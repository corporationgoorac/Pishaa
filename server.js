const express = require('express');
const cors = require('cors');
const ytSearch = require('yt-search'); // The new YouTube engine

const app = express();

// Allow your Goorac frontend to communicate with this server
app.use(cors());

// 1. HOME PAGE ROUTE (To test if the server is awake)
app.get('/', (req, res) => {
    res.send('🚀 Goorac Quantum API is LIVE! Test it here: <a href="/api/feed?topic=dhoni">/api/feed?topic=dhoni</a>');
});

// 2. THE MAIN YOUTUBE SHORTS FEED ROUTE
app.get('/api/feed', async (req, res) => {
    const topic = req.query.topic || "technology";
    let combinedFeed = [];

    try {
        // Append #shorts to force YouTube's algorithm to return vertical short-form videos
        const searchQuery = `${topic} #shorts`;
        
        // Execute the scraper
        const searchResults = await ytSearch(searchQuery);

        // Filter the results: 
        // 1. Must be a video (not a playlist/channel)
        // 2. Must be under 3 minutes (to ensure it acts like a Bite/Short)
        const shorts = searchResults.videos.filter(video => video.seconds < 180).slice(0, 15);

        const videoPosts = shorts.map(video => ({
            id: `yt_${video.videoId}_${Math.random().toString(36).substring(2, 7)}`,
            category: topic,
            source: "YouTube Shorts",
            author: video.author.name,
            title: video.title,
            imgUrl: video.thumbnail, // Used as the cover image before the video plays
            videoId: video.videoId,  // The exact ID needed to embed the video player
            likes: video.views,      // Using view count as the "popularity" metric
            link: video.url,
            type: 'video'
        }));

        combinedFeed.push(...videoPosts);
    } catch (error) {
        console.error("YouTube fetch failed:", error.message);
    }

    // Shuffle the feed so it feels organic
    combinedFeed.sort(() => Math.random() - 0.5);

    // Send the data back to the Goorac frontend
    res.json({ success: true, bites: combinedFeed });
});

// START THE SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Goorac Quantum Server is running on port ${PORT}`);
});
