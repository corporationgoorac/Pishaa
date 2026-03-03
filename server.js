const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// This allows your Goorac frontend to communicate with this server without CORS errors!
app.use(cors());

// We fake a real browser so Reddit doesn't block the server
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

// THE MAIN FEED ROUTE
app.get('/api/feed', async (req, res) => {
    const topic = req.query.topic || "technology";
    let combinedFeed = [];

    try {
        // --- 1. SCRAPE REDDIT ---
        const redditUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(topic)}&sort=hot&limit=10`;
        const redditRes = await axios.get(redditUrl, { headers });
        
        const redditPosts = redditRes.data.data.children
            .map(c => c.data)
            .filter(post => post.url && post.url.match(/\.(jpeg|jpg|gif|png)$/i)) // Keep only images
            .map(post => ({
                id: `reddit_${post.id}`,
                category: topic,
                source: `r/${post.subreddit}`,
                author: post.author,
                title: post.title,
                imgUrl: post.url,
                likes: post.ups,
                link: `https://reddit.com${post.permalink}`,
                type: 'reddit'
            }));
            
        combinedFeed.push(...redditPosts);

    } catch (error) {
        console.error("Reddit fetch failed:", error.message);
    }

    try {
        // --- 2. SCRAPE WIKIPEDIA ---
        const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages|extracts&exintro&explaintext&generator=search&gsrsearch=${encodeURIComponent(topic)}&gsrlimit=5&pithumbsize=800`;
        const wikiRes = await axios.get(wikiUrl, { headers });
        
        if (wikiRes.data.query && wikiRes.data.query.pages) {
            const pages = Object.values(wikiRes.data.query.pages);
            const wikiPosts = pages
                .filter(page => page.thumbnail) // Keep only articles with images
                .map(page => ({
                    id: `wiki_${page.pageid}`,
                    category: topic,
                    source: "Wikipedia",
                    author: "Encyclopedia",
                    title: page.title,
                    imgUrl: page.thumbnail.source,
                    likes: Math.floor(Math.random() * 500) + 100, // Simulated likes
                    link: `https://en.wikipedia.org/?curid=${page.pageid}`,
                    type: 'wikipedia'
                }));
                
            combinedFeed.push(...wikiPosts);
        }
    } catch (error) {
        console.error("Wikipedia fetch failed:", error.message);
    }

    // Shuffle the combined feed so Reddit and Wiki are mixed beautifully
    combinedFeed.sort(() => Math.random() - 0.5);

    // Send the clean, CORS-free data back to the Goorac app
    res.json({ success: true, bites: combinedFeed });
});

// START THE SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Goorac Quantum Server is running on port ${PORT}`);
});
