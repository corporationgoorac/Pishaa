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

// 2. THE MAIN FEED ROUTE (Invidious Network + News Fallback)
app.get('/api/feed', async (req, res) => {
    const topic = req.query.topic || "technology";
    let combinedFeed = [];
    let debugMessage = "Fetching videos...";

    // --- SOURCE 1: INVIDIOUS YOUTUBE NETWORK ---
    // We use a list of 3 public servers. If one is busy, it instantly tries the next!
    const instances = [
        "https://vid.puffyan.us",
        "https://invidious.fdn.fr",
        "https://invidious.perennialte.ch"
    ];

    for (let instance of instances) {
        try {
            // Ask the public server for YouTube Shorts data
            const searchUrl = `${instance}/api/v1/search?q=${encodeURIComponent(topic + " shorts")}&type=video`;
            const response = await axios.get(searchUrl, { timeout: 6000 }); // 6 second timeout
            
            if (response.data && response.data.length > 0) {
                // Filter for vertical shorts (Under 3 minutes)
                const shorts = response.data.filter(vid => vid.lengthSeconds < 180).slice(0, 15);
                
                combinedFeed = shorts.map(video => ({
                    id: `yt_${video.videoId}_${Math.random().toString(36).substring(2, 7)}`,
                    category: topic,
                    source: "YouTube Shorts",
                    author: video.author,
                    title: video.title,
                    imgUrl: video.videoThumbnails ? video.videoThumbnails[0].url : `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
                    videoId: video.videoId, // Required to play the video in your app!
                    likes: video.viewCount || Math.floor(Math.random() * 5000), 
                    link: `https://youtube.com/watch?v=${video.videoId}`,
                    type: 'video'
                }));
                
                debugMessage = `Success using ${instance}`;
                break; // We got the data! Exit the loop.
            }
        } catch (err) {
            console.log(`Instance ${instance} failed. Trying next...`);
            debugMessage = `Invidious instances busy.`;
        }
    }

    // --- SOURCE 2: THE FAILSAFE (Google News) ---
    // If YouTube blocks all the public servers, we fall back to the News feed so the app NEVER breaks.
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

    // Shuffle the feed so it feels organic
    combinedFeed.sort(() => Math.random() - 0.5);

    // Send the data back to the Goorac frontend
    res.json({ success: true, bites: combinedFeed, debug: debugMessage });
});

// START THE SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Goorac Quantum Server is running on port ${PORT}`);
});
