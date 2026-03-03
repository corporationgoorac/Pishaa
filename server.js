const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();

// ============================================================================
// 1. MIDDLEWARE
// ============================================================================
app.use(cors());
app.use(express.json()); // Crucial: Allows the server to read JSON from the frontend

// ============================================================================
// 2. FIREBASE ADMIN "GOD MODE" SETUP (TESTING MODE)
// ============================================================================
// PASTE YOUR ENTIRE JSON FILE CONTENTS HERE:
const serviceAccount = {
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "your-private-key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\nYOUR_LONG_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com",
  "client_id": "1234567890",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/your-service-account-email"
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://goorac-c3b59-default-rtdb.firebaseio.com" // Your database URL
});

const db = admin.firestore();

// ============================================================================
// 3. BACKGROUND NEURAL SYNC ENDPOINT (LAG KILLER)
// ============================================================================
// The Goorac app pings this instantly without waiting, saving phone battery & RAM.
app.post('/api/neural-sync', async (req, res) => {
    const { uid, tags, points } = req.body;
    
    if (!uid || !tags || !Array.isArray(tags) || tags.length === 0) {
        return res.status(400).json({ error: "Missing or invalid data" });
    }

    try {
        const updates = {};
        // Batch update all extracted hashtags and the main category at once
        tags.forEach(tag => {
            if (tag) updates[`bitesProfile.${tag}`] = admin.firestore.FieldValue.increment(points);
        });

        // Push directly to Firebase bypassing client-side rules
        await db.collection("users").doc(uid).set(updates, { merge: true });
        
        console.log(`🔥 Neural DB Updated for [${uid}]: +${points} pts to [${tags.join(', ')}]`);
        res.json({ success: true });
    } catch (error) {
        console.error("Firebase Admin Error:", error);
        res.status(500).json({ error: "DB Sync Failed" });
    }
});

// ============================================================================
// 4. THE ANTI-LOOP SCRAPER ENGINE
// ============================================================================
const INSTANCES = [
    "https://vid.puffyan.us", 
    "https://invidious.fdn.fr",
    "https://invidious.perennialte.ch", 
    "https://yt.artemislena.eu",
    "https://invidious.privacydev.net"
];

async function fetchWithAntiLoop(topic, isSearchMode) {
    const shuffledMirrors = [...INSTANCES].sort(() => Math.random() - 0.5);
    
    // Random deep dive into pages to break the algorithm loop
    const randomPage = isSearchMode ? 1 : Math.floor(Math.random() * 8) + 1; 
    
    // Random sorting to mix fresh and viral content
    const sorts = ["relevance", "date", "view_count"];
    const randomSort = isSearchMode ? "relevance" : sorts[Math.floor(Math.random() * sorts.length)];

    const fetchTask = async (url) => {
        const exactQuery = isSearchMode ? `"${topic}" shorts` : `${topic} shorts`;
        const reqUrl = `${url}/api/v1/search?q=${encodeURIComponent(exactQuery)}&type=video&page=${randomPage}&sort_by=${randomSort}`;
        
        const res = await axios.get(reqUrl, { timeout: 6000 });
        if (res.data && res.data.length > 0) return res.data;
        throw new Error("No data");
    };

    try { 
        return await Promise.any(shuffledMirrors.slice(0, 3).map(m => fetchTask(m))); 
    } catch (e) { 
        console.error(`Scrape failed for ${topic}`);
        return []; 
    }
}

// Interleaves arrays like shuffling a deck of cards
function interleave(arrays) {
    let out = [];
    let max = Math.max(...arrays.map(a => a.length));
    for (let i = 0; i < max; i++) {
        for (let j = 0; j < arrays.length; j++) {
            if (arrays[j] && arrays[j][i]) out.push(arrays[j][i]);
        }
    }
    return out;
}

// ============================================================================
// 5. MAIN FEED ROUTE (SERVER-SIDE PERSONALITY DNA)
// ============================================================================
app.get('/api/feed', async (req, res) => {
    let topicsArray = [];
    const isSearchMode = req.query.mode === 'strict';

    // 🚀 NEW: SERVER-SIDE ALGORITHM ENGINE
    // If a UID is provided and we aren't doing a strict search, the Server decides what to show.
    if (req.query.uid && !isSearchMode) {
        try {
            const userDoc = await db.collection("users").doc(req.query.uid).get();
            if (userDoc.exists && userDoc.data().bitesProfile) {
                const profile = userDoc.data().bitesProfile;
                
                // Sort the user's entire history by highest points
                const sortedTags = Object.entries(profile)
                    .sort((a, b) => b[1] - a[1])
                    .map(entry => entry[0].toLowerCase());

                // Language Recognition Dictionary
                const knownLanguages = ["tamil", "hindi", "telugu", "malayalam", "english", "kannada"];
                let userLang = "";

                // Scan user profile to see if they prefer a specific language
                for (let tag of sortedTags) {
                    if (knownLanguages.includes(tag)) {
                        userLang = tag;
                        break;
                    }
                }
                // Default to Tamil if no language is found but we want localization
                if (!userLang) userLang = "tamil"; 

                // Extract top 2 core interests (ignoring the language tags themselves)
                let coreInterests = sortedTags.filter(t => !knownLanguages.includes(t)).slice(0, 2);
                if (coreInterests.length === 0) coreInterests = ["trending", "viral", "comedy"];

                // Build Hyper-Personalized Queries (e.g. "cricket tamil", "tech tamil")
                topicsArray = coreInterests.map(interest => `${interest} ${userLang}`);
                
                // Always inject a discovery/trending tag in their language to keep it fresh
                topicsArray.push(`trending shorts ${userLang}`);
                
                console.log(`🧠 AI Built Query for ${req.query.uid}: ${topicsArray.join(' | ')}`);
            }
        } catch (error) {
            console.error("Failed to build personalized DNA profile:", error);
        }
    }

    // Fallback: If UID processing failed or it's a strict text search
    if (topicsArray.length === 0) {
        const rawTopics = req.query.topics || "trending shorts";
        topicsArray = rawTopics.split(',').map(t => t.trim());
    }

    try {
        const topicPromises = topicsArray.map(async (t) => {
            const data = await fetchWithAntiLoop(t, isSearchMode);
            return data.filter(v => v.lengthSeconds > 0 && v.lengthSeconds < 240).map(v => ({
                id: `yt_${v.videoId}_${Math.random().toString(36).substring(2,7)}`,
                category: t,
                author: v.author || "Creator",
                title: v.title,
                imgUrl: v.videoThumbnails && v.videoThumbnails.length > 0 ? v.videoThumbnails[0].url : `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
                videoId: v.videoId,
                likes: v.viewCount || Math.floor(Math.random() * 5000),
                link: `https://youtube.com/watch?v=${v.videoId}`,
                type: 'video'
            }));
        });

        const resultsArray = await Promise.all(topicPromises);
        let finalFeed = isSearchMode ? resultsArray[0] : interleave(resultsArray);

        // Final random shuffle to ensure 0 predictability in the standard feed
        if (!isSearchMode) finalFeed.sort(() => Math.random() - 0.5);

        res.json({ success: true, bites: finalFeed.filter(v => v && v.videoId) });
    } catch (error) { 
        res.json({ success: false, bites: [] }); 
    }
});

// Root health check
app.get('/', (req, res) => {
    res.send("🚀 Goorac Quantum Server + Server-Side AI Brain Online");
});

// ============================================================================
// 6. SERVER BOOT
// ============================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
