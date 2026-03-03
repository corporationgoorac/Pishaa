const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

const INSTANCES = [
    "https://vid.puffyan.us", "https://invidious.fdn.fr",
    "https://invidious.perennialte.ch", "https://yt.artemislena.eu",
    "https://invidious.privacydev.net", "https://invidious.v0l.me"
];

const TAMIL_POOL = ["Tamil Shorts", "Tamil Cinema", "Kollywood Trending", "Tamil Comedy"];

async function fastScrape(query, pages = 1) {
    const shuffled = [...INSTANCES].sort(() => Math.random() - 0.5).slice(0, 3);
    const fetch = async (url) => {
        const res = await axios.get(`${url}/api/v1/search?q=${encodeURIComponent(query)}&type=video&page=${pages}`, { timeout: 5000 });
        if (res.data && res.data.length > 0) return res.data;
        throw new Error();
    };
    try { return await Promise.any(shuffled.map(m => fetch(m))); } 
    catch (e) { return []; }
}

function interleave(arrays) {
    let out = [];
    let max = Math.max(...arrays.map(a => a.length));
    for (let i = 0; i < max; i++) {
        for (let j = 0; j < arrays.length; j++) {
            if (arrays[j][i]) out.push(arrays[j][i]);
        }
    }
    return out;
}

app.get('/api/feed', async (req, res) => {
    const raw = req.query.topics || req.query.topic || "trending";
    const topics = raw.split(',').map(t => t.trim());
    const isSearch = topics.length === 1;

    try {
        const topicPromises = topics.map(async (t) => {
            const data = await fastScrape(isSearch ? `"${t}" shorts` : `${t} shorts`, isSearch ? 3 : 1);
            return data.filter(v => v.lengthSeconds < 240).map(v => ({
                id: `yt_${v.videoId}_${Math.random().toString(36).substring(2,7)}`,
                category: t,
                author: v.author,
                title: v.title,
                imgUrl: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
                videoId: v.videoId,
                likes: v.viewCount || Math.floor(Math.random() * 5000),
                link: `https://youtube.com/watch?v=${v.videoId}`,
                type: 'video'
            }));
        });

        const tamilTag = TAMIL_POOL[Math.floor(Math.random() * TAMIL_POOL.length)];
        const tamilPromise = fastScrape(tamilTag).then(d => d.slice(0, 6).map(v => ({...v, category: 'Tamil'})));

        const [results, tamil] = await Promise.all([Promise.all(topicPromises), tamilPromise]);
        
        let final = isSearch ? results[0] : interleave(results);
        if (!isSearch) {
            // Inject Tamil every 4th
            let mixed = [];
            final.forEach((v, i) => {
                mixed.push(v);
                if (i % 4 === 0 && tamil.length > 0) mixed.push(tamil.shift());
            });
            final = mixed;
        }

        res.json({ success: true, bites: final.filter(v => v.videoId) });
    } catch (e) { res.json({ success: false, bites: [] }); }
});

app.listen(process.env.PORT || 3000);
