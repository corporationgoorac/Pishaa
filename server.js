const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// Allow Goorac frontend to communicate with this server
app.use(cors());

// 1. HOME PAGE ROUTE
app.get('/', (req, res) => {
    res.send('🚀 Goorac Quantum API is LIVE! Test it here: <a href="/api/feed?topic=dhoni">/api/feed?topic=dhoni</a>');
});

// 2. THE MAIN FEED ROUTE (High-Volume Invidious Network)
app.get('/api/feed', async (req, res) => {
    const topic = req.query.topic || "technology";
    let combinedFeed = [];
    let debugMessage = "Fetching videos...";

    // We added more reliable servers to the list
    const instances = [
        "https://vid.puffyan.us",
        "https://invidious.fdn.fr",
        "https://invidious.perennialte.ch",
        "https://yt.artemislena.eu" 
    ];

    for (let instance of instances) {
        try {
            // THE FIX: Fetch Page 1 and Page 2 at the exact same time for double the data!
            const [page1, page2] = await Promise.all([
                axios.get(`${instance}/api/v1/search?q=${encodeURIComponent(topic + " shorts")}&type=video&page=1`, { timeout: 7000 }).catch(() => null),
                axios.get(`${instance}/api/v1/search?q=${encodeURIComponent(topic + " shorts")}&type=video&page=2`, { timeout: 7000 }).catch(() => null)
            ]);

            let allVideos = [];
            if (page1 && page1.data) allVideos.push(...page1.data);
            if (page2 && page2.data) allVideos.push(...page2.data);
            
            if (allVideos.length > 0) {
                // Keep videos under 4 minutes (240 seconds). Removed the .slice() limit!
                const shorts = allVideos.filter(vid => vid.lengthSeconds < 240);
                
                combinedFeed = shorts.map(video => ({
                    id: `yt_${video.videoId}_${Math.random().toString(36).substring(2, 7)}`,
                    category: topic,
                    source: "YouTube Shorts",
                    author: video.author,
                    title: video.title,
                    imgUrl: video.videoThumbnails && video.videoThumbnails.length > 0 ? video.videoThumbnails[0].url : `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
                    videoId: video.videoId, 
                    likes: video.viewCount || Math.floor(Math.random() * 5000), 
                    link: `https://youtube.com/watch?v=${video.videoId}`,
                    type: 'video'
                }));
                
                debugMessage = `Success using ${instance}. Loaded ${combinedFeed.length} videos.`;
                break; // We got a massive list of data! Exit the loop.
            }
        } catch (err) {
            console.log(`Instance ${instance} failed. Trying next...`);
            debugMessage = `Invidious instances busy.`;
        }
    }

    // --- SOURCE 2: THE FAILSAFE (Google News) ---
    if (combinedFeed.length === 0) {
        try {
            const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic + " video")}&hl=en-IN&gl=IN&ceid=IN:en`;
            const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
            
            const newsRes = await axios.get(rss2jsonUrl);
            
            if (newsRes.data.status === "ok") {
                combinedFeed = newsRes.data.items
                    .filter(item => item.enclosure && item.enclosure.link) 
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
                debugMessage = "Used Google News Failsafe.";
            }
        } catch (e) {
            console.error("Failsafe also failed.", e);
        }
    }

    // Shuffle the huge feed so it feels completely random
    combinedFeed.sort(() => Math.random() - 0.5);

    // Send the data back to the Goorac frontend
    res.json({ success: true, bites: combinedFeed, debug: debugMessage });
});

// START THE SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Goorac Quantum Server is running on port ${PORT}`);
});
