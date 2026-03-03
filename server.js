const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// Allow your Goorac frontend to communicate with this server
app.use(cors());

// Fake a real browser
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

app.get('/', (req, res) => {
    res.send('🚀 Goorac Quantum API is LIVE! Test it here: <a href="/api/feed?topic=dhoni">/api/feed?topic=dhoni</a>');
});

// THE UPGRADED MAIN FEED ROUTE
app.get('/api/feed', async (req, res) => {
    const topic = req.query.topic || "technology";
    let combinedFeed = [];

    // --- 1. SCRAPE REDDIT (High Volume & Randomized) ---
    try {
        // Randomize the sort method so you don't see the same posts twice
        const sortMethods = ['hot', 'new', 'relevance'];
        const randomSort = sortMethods[Math.floor(Math.random() * sortMethods.length)];
        
        // Ask for 50 items instead of 10 to ensure we get plenty of media
        const redditUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(topic)}&sort=${randomSort}&limit=50`;
        const redditRes = await axios.get(redditUrl, { headers });
        
        let redditPosts = redditRes.data.data.children
            .map(c => c.data)
            .filter(post => {
                // Must not be 18+
                if (post.over_18) return false;
                
                // Smarter Image Detection: Checks post hints, previews, and thumbnails
                const hasImageHint = post.post_hint === 'image';
                const hasImageExt = post.url && post.url.match(/\.(jpeg|jpg|gif|png)$/i);
                const hasThumbnail = post.thumbnail && post.thumbnail.startsWith('http');
                
                return hasImageHint || hasImageExt || hasThumbnail;
            })
            .map(post => {
                // Find the highest quality image available
                let highResImg = post.url;
                if (post.preview && post.preview.images && post.preview.images[0].source.url) {
                    highResImg = post.preview.images[0].source.url.replace(/&amp;/g, '&');
                } else if (!highResImg.match(/\.(jpeg|jpg|gif|png)$/i) && post.thumbnail.startsWith('http')) {
                    highResImg = post.thumbnail;
                }

                return {
                    id: `reddit_${post.id}_${Math.random().toString(36).substr(2, 5)}`,
                    category: topic,
                    source: `r/${post.subreddit}`,
                    author: post.author,
                    title: post.title,
                    imgUrl: highResImg,
                    likes: post.ups,
                    link: `https://reddit.com${post.permalink}`,
                    type: 'reddit'
                };
            });
            
        // Shuffle the extracted Reddit posts and take 15 random ones
        redditPosts = redditPosts.sort(() => Math.random() - 0.5).slice(0, 15);
        combinedFeed.push(...redditPosts);

    } catch (error) {
        console.error("Reddit fetch failed:", error.message);
    }

    // --- 2. SCRAPE WIKIPEDIA (Randomized) ---
    try {
        // Fetch 20 Wiki pages instead of 5, so we can randomly pick from a larger pool
        const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages|extracts&exintro&explaintext&generator=search&gsrsearch=${encodeURIComponent(topic)}&gsrlimit=20&pithumbsize=800`;
        const wikiRes = await axios.get(wikiUrl, { headers });
        
        if (wikiRes.data.query && wikiRes.data.query.pages) {
            const pages = Object.values(wikiRes.data.query.pages);
            let wikiPosts = pages
                .filter(page => page.thumbnail) // Keep only articles with images
                .map(page => ({
                    id: `wiki_${page.pageid}_${Math.random().toString(36).substr(2, 5)}`,
                    category: topic,
                    source: "Wikipedia",
                    author: "Encyclopedia",
                    title: page.title,
                    imgUrl: page.thumbnail.source,
                    likes: Math.floor(Math.random() * 500) + 100, 
                    link: `https://en.wikipedia.org/?curid=${page.pageid}`,
                    type: 'wikipedia'
                }));
            
            // Shuffle Wikipedia results and pick 5 random ones
            wikiPosts = wikiPosts.sort(() => Math.random() - 0.5).slice(0, 5);
            combinedFeed.push(...wikiPosts);
        }
    } catch (error) {
        console.error("Wikipedia fetch failed:", error.message);
    }

    // --- 3. SCRAPE GOOGLE NEWS (For guaranteed extra content) ---
    try {
        const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-IN&gl=IN&ceid=IN:en`;
        const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
        
        const newsRes = await axios.get(rss2jsonUrl);
        
        if (newsRes.data.status === "ok") {
            let newsPosts = newsRes.data.items
                .filter(item => item.enclosure && item.enclosure.link) // Must have image
                .map(item => ({
                    id: `news_${Math.random().toString(36).substring(2, 9)}`,
                    category: topic,
                    source: item.source || "News",
                    author: "NewsDesk",
                    title: item.title.split(' - ')[0],
                    imgUrl: item.enclosure.link,
                    likes: Math.floor(Math.random() * 800) + 200,
                    link: item.link,
                    type: 'news'
                }));
                
            newsPosts = newsPosts.sort(() => Math.random() - 0.5).slice(0, 10);
            combinedFeed.push(...newsPosts);
        }
    } catch (error) {
        console.error("News fetch failed:", error.message);
    }

    // Shuffle the final combined feed so Reddit, Wiki, and News are all mixed together
    combinedFeed.sort(() => Math.random() - 0.5);

    // Send the massive, randomized data back to the Goorac app
    res.json({ success: true, bites: combinedFeed });
});

// START THE SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Goorac Quantum Server is running on port ${PORT}`);
});
