const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// Allow your Goorac frontend to communicate with this server without CORS errors
app.use(cors());

// 1. HOME PAGE ROUTE (To test if the server is awake)
app.get('/', (req, res) => {
    res.send('🚀 Goorac Quantum API is LIVE! Test it here: <a href="/api/feed?topic=dhoni">/api/feed?topic=dhoni</a>');
});

// 2. THE MAIN FEED ROUTE
app.get('/api/feed', async (req, res) => {
    const topic = req.query.topic || "technology";
    let combinedFeed = [];

    // --- 1. SCRAPE REDDIT (Bypassing blocks using RSS Bridge) ---
    try {
        // Instead of .json, we use Reddit's RSS feed and pass it through the RSS2JSON proxy
        const redditRssUrl = `https://www.reddit.com/search.rss?q=${encodeURIComponent(topic)}&sort=hot`;
        const redditApiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(redditRssUrl)}`;
        
        const redditRes = await axios.get(redditApiUrl);
        
        if (redditRes.data.status === "ok") {
            let redditPosts = redditRes.data.items.map(item => {
                // Reddit RSS hides images inside the HTML content. We extract it here:
                let imgUrl = "";
                const imgMatch = item.content.match(/<img[^>]+src="([^">]+)"/);
                if (imgMatch) {
                    imgUrl = imgMatch[1];
                }

                return {
                    id: `reddit_${Math.random().toString(36).substring(2, 9)}`,
                    category: topic,
                    source: "Reddit",
                    author: item.author || "User",
                    title: item.title,
                    imgUrl: imgUrl,
                    likes: Math.floor(Math.random() * 900) + 150, // Simulated likes for UI consistency
                    link: item.link,
                    type: 'reddit'
                };
            }).filter(post => post.imgUrl); // STRICT FILTER: Drop any text-only posts
            
            // Shuffle and pick up to 15 random Reddit posts
            redditPosts = redditPosts.sort(() => Math.random() - 0.5).slice(0, 15);
            combinedFeed.push(...redditPosts);
        }
    } catch (error) {
        console.error("Reddit fetch failed:", error.message);
    }

    // --- 2. SCRAPE GOOGLE NEWS (Highly Reliable) ---
    // (Wikipedia has been completely removed)
    try {
        const newsRssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-IN&gl=IN&ceid=IN:en`;
        const newsApiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(newsRssUrl)}`;
        
        const newsRes = await axios.get(newsApiUrl);
        
        if (newsRes.data.status === "ok") {
            let newsPosts = newsRes.data.items
                .filter(item => item.enclosure && item.enclosure.link) // Only keep articles with images
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
                
            // Shuffle and pick up to 15 random News posts
            newsPosts = newsPosts.sort(() => Math.random() - 0.5).slice(0, 15);
            combinedFeed.push(...newsPosts);
        }
    } catch (error) {
        console.error("News fetch failed:", error.message);
    }

    // Mix Reddit and Google News together randomly for a dynamic feed
    combinedFeed.sort(() => Math.random() - 0.5);

    // Send the data back to the Goorac frontend
    res.json({ success: true, bites: combinedFeed });
});

// START THE SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Goorac Quantum Server is running on port ${PORT}`);
});
