const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// ============================================================================
// 1. MIDDLEWARE
// ============================================================================
app.use(cors());
app.use(express.json());

// ============================================================================
// 2. THE "3x3 FAST FETCH" ENGINE
// ============================================================================
const INSTANCES = [
    "https://vid.puffyan.us", 
    "https://invidious.fdn.fr",
    "https://invidious.perennialte.ch", 
    "https://yt.artemislena.eu",
    "https://invidious.privacydev.net",
    "https://invidious.lunar.icu"
];

async function fastSearchRace(query) {
    // 1. Pick 3 random mirrors to race against each other
    const shuffledMirrors = [...INSTANCES].sort(() => Math.random() - 0.5).slice(0, 3);
    
    // 2. Clean the query (YouTube's algorithm handles typos best when sorted by 'relevance')
    const cleanQuery = query.trim();

    const fetchTask = async (baseUrl) => {
        const reqUrl = `${baseUrl}/api/v1/search?q=${encodeURIComponent(cleanQuery)}&type=video&page=1&sort_by=relevance`;
        
        // Aggressive 4-second timeout. If a mirror is slow, we drop it instantly.
        const res = await axios.get(reqUrl, { timeout: 4000 });
        if (res.data && res.data.length > 0) return res.data;
        throw new Error("No data");
    };

    try { 
        // Promise.any fires all 3 requests at the exact same time and returns the FIRST one to finish
        return await Promise.any(shuffledMirrors.map(m => fetchTask(m))); 
    } catch (e) { 
        console.error(`All 3 mirrors failed for query: ${query}`);
        return []; 
    }
}

// ============================================================================
// 3. THE SEARCH ENDPOINT
// ============================================================================
app.get('/api/feed', async (req, res) => {
    // Get the search term from the URL (e.g., ?topics=taylor+swift)
    const rawQuery = req.query.topics || "trending music";

    try {
        const data = await fastSearchRace(rawQuery);
        
        // Format the results for Vision (Allows Long Videos)
        const results = data.filter(v => v.lengthSeconds > 0).map(v => ({
            videoId: v.videoId,
            author: v.author || "YouTube",
            title: v.title,
            // Grab the highest quality thumbnail available
            imgUrl: v.videoThumbnails && v.videoThumbnails.length > 0 ? v.videoThumbnails[0].url : `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
            lengthSeconds: v.lengthSeconds,
            viewCount: v.viewCount || 0
        }));

        res.json({ success: true, bites: results });
    } catch (error) { 
        res.json({ success: false, bites: [] }); 
    }
});

// Root health check to let Render know it's alive
app.get('/', (req, res) => {
    res.send("🚀 Goorac Vision Fast-Fetch Search Proxy is ONLINE.");
});

// ============================================================================
// 4. BOOT SERVER
// ============================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Fast Proxy running on port ${PORT}`));
