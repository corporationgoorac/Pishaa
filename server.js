const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// ============================================================================
// 1. MIDDLEWARE & CONFIGURATION
// ============================================================================
app.use(cors());

// List of the most reliable open-source Invidious instances to bypass YouTube Blocks
const INSTANCES = [
    "https://vid.puffyan.us",
    "https://invidious.fdn.fr",
    "https://invidious.perennialte.ch",
    "https://yt.artemislena.eu",
    "https://invidious.privacydev.net",
    "https://invidious.v0l.me",
    "https://invidious.namazso.eu"
];

// Tamil-Specific Trending Keywords for Auto-Injection
const TAMIL_TRENDING_POOL = [
    "Tamil Shorts", "Tamil Cinema", "Kollywood Trending", 
    "Tamil Comedy Shorts", "Chennai Vibes", "Tamil Tech"
];

// ============================================================================
// 2. HIGH-SPEED IN-MEMORY CACHE (The Secret to 0ms Lag)
// ============================================================================
// Stores scraped data for 5 minutes so repeat requests don't have to wait for YouTube
const scrapeCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getFromCache(key) {
    const cached = scrapeCache.get(key);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        return cached.data;
    }
    return null;
}

function setInCache(key, data) {
    scrapeCache.set(key, {
        timestamp: Date.now(),
        data: data
    });
}

// ============================================================================
// 3. CORE SCRAPING ENGINES
// ============================================================================

/**
 * Fetches multiple pages of YouTube Shorts simultaneously for maximum speed.
 * FIX: Added strict title matching and exact-phrase search to stop unrelated videos.
 */
async function fetchYouTubeShorts(topic, pagesToFetch = 2) {
    const cacheKey = `yt_${topic}`;
    const cachedData = getFromCache(cacheKey);
    
    // If we already scraped this recently, return it instantly!
    if (cachedData) {
        console.log(`⚡ CACHE HIT: Delivered [${topic}] instantly.`);
        // Shuffle the cached data so it feels fresh even on a reload
        return cachedData.sort(() => Math.random() - 0.5);
    }

    console.log(`🔍 SCRAPING: Initiating multi-thread fetch for [${topic}]...`);
    let collectedShorts = [];

    // Try each server instance until one works
    for (let instance of INSTANCES) {
        try {
            // Build an array of promises to fetch pages concurrently (The "5x5" method)
            const pagePromises = [];
            for (let i = 1; i <= pagesToFetch; i++) {
                // FIX: Use double quotes in query for strict matching
                const strictQuery = `"${topic}" shorts`;
                const url = `${instance}/api/v1/search?q=${encodeURIComponent(strictQuery)}&type=video&page=${i}`;
                pagePromises.push(axios.get(url, { timeout: 6000 }).catch(() => null));
            }

            // Execute all page fetches at the exact same time
            const pageResults = await Promise.all(pagePromises);

            pageResults.forEach(res => {
                if (res && res.data && Array.isArray(res.data)) {
                    collectedShorts.push(...res.data);
                }
            });

            // If we got data, format it and break out of the instance loop
            if (collectedShorts.length > 0) {
                // FIX: RELEVANCE FILTER
                // We check if at least one word of the topic exists in the video title
                const topicWords = topic.toLowerCase().split(' ');

                let formattedVids = collectedShorts
                    .filter(vid => {
                        const title = vid.title.toLowerCase();
                        // 1. Must be under 4 mins
                        const isShort = vid.lengthSeconds > 0 && vid.lengthSeconds < 240;
                        // 2. Title must be related to at least one search word
                        const isRelated = topicWords.some(word => title.includes(word));
                        return isShort && isRelated;
                    })
                    .map(video => ({
                        id: `yt_${video.videoId}_${Math.random().toString(36).substring(2, 8)}`,
                        category: topic,
                        source: "YouTube Shorts",
                        author: video.author || "Quantum Creator",
                        title: video.title,
                        imgUrl: video.videoThumbnails && video.videoThumbnails.length > 0 ? video.videoThumbnails[0].url : `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
                        videoId: video.videoId,
                        likes: video.viewCount || Math.floor(Math.random() * 8000),
                        link: `https://youtube.com/watch?v=${video.videoId}`,
                        type: 'video',
                        timestamp: Date.now()
                    }));

                // Save to cache for the next user/scroll
                if (formattedVids.length > 0) {
                    setInCache(cacheKey, formattedVids);
                    return formattedVids;
                }
            }
        } catch (err) {
            console.log(`⚠️ Instance ${instance} failed for [${topic}]. Switching servers...`);
        }
    }
    
    return []; // Return empty if all instances fail
}

/**
 * Failsafe mechanism: Google News RSS if YouTube blocks us completely.
 */
async function fetchNewsFailsafe(topic) {
    try {
        const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic + " video")}&hl=en-IN&gl=IN&ceid=IN:en`;
        const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
        const newsRes = await axios.get(rss2jsonUrl, { timeout: 5000 });
        
        if (newsRes.data && newsRes.data.status === "ok") {
            return newsRes.data.items
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
        }
    } catch (e) {
        console.error("Failsafe failed.", e.message);
    }
    return [];
}

// ============================================================================
// 4. THE INTERLEAVER ALGORITHM (Deck of Cards Shuffler)
// ============================================================================
/**
 * Takes arrays of different topics and mixes them evenly.
 * Input: [[A1, A2], [B1, B2], [C1, C2]]
 * Output: [A1, B1, C1, A2, B2, C2]
 */
function interleaveArrays(arrays) {
    let interleaved = [];
    let maxLength = Math.max(...arrays.map(arr => arr.length));
    
    for (let i = 0; i < maxLength; i++) {
        for (let j = 0; j < arrays.length; j++) {
            if (arrays[j] && arrays[j][i]) {
                interleaved.push(arrays[j][i]);
            }
        }
    }
    return interleaved;
}

// ============================================================================
// 5. API ROUTES
// ============================================================================

app.get('/', (req, res) => {
    res.send(`
        <body style="background:#000;color:#00d2ff;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;">
            <h1 style="font-size:3rem;margin-bottom:0;">GOORAC QUANTUM V2</h1>
            <p style="color:#fff;letter-spacing:4px;">SCRAPER NODES: ${INSTANCES.length} | CACHE: ACTIVE</p>
            <div style="border:1px solid #1a1a1a;padding:20px;border-radius:15px;background:#050505;">
                Test Feed: <a href="/api/feed?topics=tech,comedy" style="color:#00d2ff;">/api/feed?topics=tech,comedy</a>
            </div>
        </body>
    `);
});

// THE MAIN ALGORITHM ROUTE
app.get('/api/feed', async (req, res) => {
    // The frontend sends topics as a comma-separated string: "tech,funny,gaming"
    const rawTopics = req.query.topics || req.query.topic || "trending";
    const topicsArray = rawTopics.split(',').map(t => t.trim()).filter(t => t.length > 0);
    
    let isSearchMode = topicsArray.length === 1; // If only 1 topic is requested, it's a specific search
    
    console.log(`\n--- NEW REQUEST ---`);
    console.log(`Topics: ${topicsArray.join(' | ')}`);
    console.log(`Mode: ${isSearchMode ? 'PURE SEARCH' : 'MIXED FEED'}`);

    let finalFeed = [];
    let debugMsg = "";

    try {
        // --- ALGORITHM PART 1: TOPIC FETCHING ---
        // Fetch all requested topics concurrently
        const fetchPromises = topicsArray.map(topic => fetchYouTubeShorts(topic, isSearchMode ? 4 : 2));
        
        // --- ALGORITHM PART 2: TAMIL TRENDING INJECTION ---
        // Secretly fetch 6 unique Tamil Trending videos to mix in
        const randomTamilTag = TAMIL_TRENDING_POOL[Math.floor(Math.random() * TAMIL_TRENDING_POOL.length)];
        const tamilPromise = fetchYouTubeShorts(randomTamilTag, 1).then(data => data.slice(0, 6));

        const [resultsArray, tamilTrending] = await Promise.all([
            Promise.all(fetchPromises),
            tamilPromise
        ]); 
        
        if (isSearchMode) {
            // PURE SEARCH: Return strict results. Then shuffle Tamil Trending at the very bottom.
            finalFeed = [...resultsArray[0], ...tamilTrending.sort(() => Math.random() - 0.5)];
            debugMsg = `Returned strict search results for [${topicsArray[0]}]`;
        } else {
            // MIXED FEED: Interleave the different topics seamlessly
            const interleaved = interleaveArrays(resultsArray);
            
            // Mix in the Tamil Trending shorts every few videos
            for (let i = 0; i < interleaved.length; i++) {
                finalFeed.push(interleaved[i]);
                if (i % 5 === 0 && tamilTrending.length > 0) {
                    finalFeed.push(tamilTrending.shift());
                }
            }
            finalFeed = [...finalFeed, ...tamilTrending]; // Add remaining
            debugMsg = `Interleaved ${topicsArray.length} topics + Tamil Trending Injection`;
        }

        // FALLBACK: If YouTube completely blocked us, use Google News
        if (finalFeed.length === 0) {
            console.log("YouTube block detected. Engaging News Failsafe...");
            const failsafeResults = await Promise.all(topicsArray.map(topic => fetchNewsFailsafe(topic)));
            finalFeed = interleaveArrays(failsafeResults);
            debugMsg = "YouTube blocked. Used Google News failsafe.";
        }

    } catch (error) {
        console.error("Critical Server Error:", error);
        debugMsg = "Server encountered a critical error.";
    }

    // Safety check to remove any accidental null values and ensure 100% video order jitter
    finalFeed = finalFeed
        .filter(item => item && item.videoId)
        .sort((a, b) => isSearchMode ? 0 : Math.random() - 0.5); // Only shuffle if NOT search mode

    // Send the final compiled, hyper-fast data back to Goorac app
    res.json({ 
        success: true, 
        total_results: finalFeed.length,
        mode: isSearchMode ? 'search' : 'feed',
        debug: debugMsg,
        bites: finalFeed 
    });
});

// HEALTH CHECK ROUTE
app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', cacheSize: scrapeCache.size, nodes: INSTANCES.length });
});

// ============================================================================
// 6. START SERVER
// ============================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n=========================================`);
    console.log(`🚀 Goorac Quantum Server running on port ${PORT}`);
    console.log(`Mirror Pool: ${INSTANCES.length} Nodes Active`);
    console.log(`=========================================\n`);
});
