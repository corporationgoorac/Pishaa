const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// Allow Goorac frontend to communicate with this server
app.use(cors());
app.use(express.json());

// 1. HOME PAGE ROUTE (Health Check)
app.get('/', (req, res) => {
    res.send('🚀 Goorac Vision & Bites Proxy is ONLINE! Test: <a href="/api/feed?topics=taylor+swift&mode=strict">Test Search</a>');
});

// 2. THE MAIN SEARCH ROUTE
app.get('/api/feed', async (req, res) => {
    const rawTopic = req.query.topics || req.query.topic || "trending";
    const isVisionMode = req.query.mode === 'strict'; // Vision passes 'strict'
    
    let combinedFeed = [];
    
    // Clean query - let YouTube's native algorithm handle typos!
    let searchQuery = rawTopic.trim();
    
    // If it's the Bites feed, force it to look for shorts. 
    // If it's Vision (isVisionMode), leave it alone so it finds FULL LONG VIDEOS.
    if (!isVisionMode && !searchQuery.toLowerCase().includes('shorts')) {
        searchQuery += " shorts";
    }

    // --- STAGE 1: INVIDIOUS NETWORK (Fastest) ---
    const invidiousInstances = [
        "https://vid.puffyan.us",
        "https://invidious.fdn.fr",
        "https://invidious.perennialte.ch",
        "https://yt.artemislena.eu",
        "https://invidious.privacydev.net"
    ].sort(() => Math.random() - 0.5); // Shuffle for load balancing

    for (let instance of invidiousInstances) {
        try {
            console.log(`Trying Invidious: ${instance}`);
            const reqUrl = `${instance}/api/v1/search?q=${encodeURIComponent(searchQuery)}&type=video&page=1&sort_by=relevance`;
            
            const response = await axios.get(reqUrl, { timeout: 5000 });
            
            if (response.data && response.data.length > 0) {
                let allVideos = response.data;
                
                // FILTERING LOGIC:
                // Bites mode = under 4 mins (240s)
                // Vision mode = ALL videos allowed
                if (!isVisionMode) {
                    allVideos = allVideos.filter(vid => vid.lengthSeconds > 0 && vid.lengthSeconds < 240);
                } else {
                    allVideos = allVideos.filter(vid => vid.lengthSeconds > 0); // Must be valid video
                }

                combinedFeed = allVideos.map(video => ({
                    id: `yt_${video.videoId}_${Math.random().toString(36).substring(2, 7)}`,
                    category: rawTopic,
                    author: video.author || "YouTube Creator",
                    title: video.title,
                    imgUrl: video.videoThumbnails && video.videoThumbnails.length > 0 ? video.videoThumbnails[0].url : `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
                    videoId: video.videoId, 
                    likes: video.viewCount || Math.floor(Math.random() * 5000), 
                    link: `https://youtube.com/watch?v=${video.videoId}`,
                    type: 'video',
                    lengthSeconds: video.lengthSeconds
                }));
                
                break; // SUCCESS! Break out of the loop instantly.
            }
        } catch (err) {
            console.log(`${instance} failed or is busy.`);
        }
    }

    // --- STAGE 2: PIPED API FAILSAFE (If all Invidious instances are down) ---
    if (combinedFeed.length === 0) {
        try {
            console.log("Invidious failed. Activating Piped API Failsafe...");
            const pipedUrl = `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(searchQuery)}&filter=all`;
            const pipedRes = await axios.get(pipedUrl, { timeout: 6000 });
            
            if (pipedRes.data && pipedRes.data.items && pipedRes.data.items.length > 0) {
                // In Piped, 'stream' means video
                let allVideos = pipedRes.data.items.filter(i => i.type === 'stream');
                
                if (!isVisionMode) {
                    allVideos = allVideos.filter(vid => vid.duration < 240);
                }

                combinedFeed = allVideos.map(video => ({
                    id: `yt_${video.url.replace('/watch?v=', '')}_${Math.random().toString(36).substring(2, 7)}`,
                    category: rawTopic,
                    author: video.uploaderName || "YouTube Creator",
                    title: video.title,
                    imgUrl: video.thumbnail,
                    videoId: video.url.replace('/watch?v=', ''), 
                    likes: video.views || Math.floor(Math.random() * 5000), 
                    link: `https://youtube.com${video.url}`,
                    type: 'video',
                    lengthSeconds: video.duration
                }));
            }
        } catch (e) {
            console.error("Piped Failsafe also failed.");
        }
    }

    // Send the final result!
    res.json({ success: true, bites: combinedFeed });
});

// START THE SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Goorac Proxy Server running on port ${PORT}`);
});
