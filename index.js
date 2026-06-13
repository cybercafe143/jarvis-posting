const express = require('express');
const cron = require('node-cron');
const TelegramBot = require('node-telegram-bot-api');
const Groq = require('groq-sdk');
const https = require('https');
const http = require('http');
const path = require('path');
const { addWatermark } = require('./watermark');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const CHANNEL_ID = process.env.CHANNEL_ID;

// Topic categories — AI khud fresh topic generate karega
const topicCategories = [
  'dark psychology aur manipulation tactics jo log daily life mein use karte hain',
  'quantum computing aur uska future impact',
  'neuroscience - human brain ke shocking secrets',
  'AI aur consciousness - kya machines soch sakti hain',
  'deepfake technology - reality vs fake ka khel',
  'dark web aur internet ka hidden side',
  'cognitive biases - hamare brain ki galat soch',
  'surveillance capitalism - companies kaise humein track karti hain',
  'transhumanism - human body ka future upgrade',
  'algorithmic bias - AI kaise discriminate karta hai',
  'social engineering - hackers log ko kaise fool karte hain',
  'memory aur learning - brain science ke secrets',
  'AI aur war - future warfare',
  'digital addiction - tech companies ka psychological trap',
  'nanotechnology - invisible machines ka future',
  'black box AI - jo khud nahi jaanta kya kar raha hai',
  'biometric surveillance - face recognition ka dark side',
  'emotional AI - machines jo feelings samajhti hain',
  'misinformation aur propaganda - fake news ka science',
  'human cloning aur genetic engineering ethics',
];

// Unsplash tech images pool
const techImages = [
  'https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=1024&q=80',
  'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1024&q=80',
  'https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=1024&q=80',
  'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1024&q=80',
  'https://images.unsplash.com/photo-1561736778-92e52a7769ef?w=1024&q=80',
  'https://images.unsplash.com/photo-1655720828018-edd2daec9349?w=1024&q=80',
  'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1024&q=80',
  'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=1024&q=80',
  'https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?w=1024&q=80',
  'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=1024&q=80',
  'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=1024&q=80',
  'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1024&q=80',
  'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=1024&q=80',
  'https://images.unsplash.com/photo-1507146153580-69a1fe6d8aa1?w=1024&q=80',
  'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1024&q=80',
];

// AI generated topic cache
let topicCache = [];
let topicCacheIndex = 0;

let topicIndex = 0;
let postHistory = [];
let isAutoPosting = false;
let scheduledJob = null;

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, { timeout: 20000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error('Status: ' + res.statusCode));
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
  });
}

// Generate fresh unique topics using AI
async function generateFreshTopics() {
  const randomCategory = topicCategories[Math.floor(Math.random() * topicCategories.length)];
  
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{
      role: 'user',
      content: `Tu ek expert content strategist hai jo "Ai Daily By Jarvis" Telegram channel ke liye topics banata hai.

Category focus: ${randomCategory}

5 unique, specific, deep aur interesting post topics generate kar jo:
- Factual aur mind-blowing ho
- Psychology, technology, neuroscience, AI ke intersection pe ho
- Common knowledge nahi — surprising aur lesser-known facts pe based ho
- Hinglish audience ke liye relatable ho
- Clickbait nahi — genuinely informative aur thought-provoking ho

Sirf 5 topics list karo, numbered 1-5, ek line each. Kuch extra mat likho.`
    }],
    max_tokens: 300,
  });
  
  const raw = completion.choices[0].message.content;
  const lines = raw.split('\n').filter(l => l.trim() && /^\d/.test(l.trim()));
  const topics = lines.map(l => l.replace(/^\d+[\.\)\s]+/, '').trim()).filter(t => t.length > 10);
  return topics.length >= 3 ? topics : null;
}

async function getNextTopic() {
  // Refill cache when empty
  if (topicCache.length === 0 || topicCacheIndex >= topicCache.length) {
    console.log('Generating fresh topics...');
    const newTopics = await generateFreshTopics();
    if (newTopics) {
      topicCache = newTopics;
      topicCacheIndex = 0;
      console.log('New topics:', topicCache);
    } else {
      // Fallback
      return topicCategories[Math.floor(Math.random() * topicCategories.length)];
    }
  }
  return topicCache[topicCacheIndex++];
}

async function generatePost(topic) {
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{
      role: 'user',
      content: `Tu ek expert AI content creator hai "Ai Daily By Jarvis" Telegram channel ke liye.

Topic: ${topic}

Ek viral Telegram post likho jo:
- Hinglish (Hindi + English mix) mein ho — natural flow, forced translation nahi
- 180-220 words ka ho
- Hook line se shuru ho — pehli line itni powerful ho ki log ruk jayein
- 2-3 shocking/surprising facts include karo
- Catchy emojis strategically use karo (har line pe nahi)
- End mein ek aise question ke saath khatam karo jo reader ko sochne pe majboor kare
- Hashtags: #AIDaily #Psychology #TechFacts #MindBlown #Hinglish
- Last line: Join karo @daily_by_jarvis

Sirf post content do.`
    }],
    max_tokens: 600,
  });
  return completion.choices[0].message.content;
}

async function sendToTelegram(content, imageUrl) {
  console.log('Downloading image from:', imageUrl);

  // Try: Download, add watermark, and send
  try {
    const imageBuffer = await downloadImage(imageUrl);
    console.log('Downloaded! Size:', imageBuffer.length, 'bytes');
    const watermarkedBuffer = await addWatermark(imageBuffer);
    console.log('Watermark added!');
    const message = await bot.sendPhoto(CHANNEL_ID, watermarkedBuffer, { caption: content });
    console.log('Photo + watermark + caption sent!');
    return { success: true, messageId: message.message_id };
  } catch (err) {
    console.log('Photo failed:', err.message);
  }

  // Fallback: Text only
  try {
    const message = await bot.sendMessage(CHANNEL_ID, content);
    console.log('Text only sent (fallback)');
    return { success: true, messageId: message.message_id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function createAndPost(topicOverride = null) {
  const topic = topicOverride || await getNextTopic();
  const imageUrl = techImages[topicIndex % techImages.length];
  topicIndex++;

  const log = {
    id: Date.now(),
    topic,
    time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    status: 'generating',
    content: '',
  };

  postHistory.unshift(log);
  if (postHistory.length > 20) postHistory.pop();

  try {
    const content = await generatePost(topic);
    log.content = content;
    log.status = 'posting';
    const result = await sendToTelegram(content, imageUrl);
    if (result.success) {
      log.status = 'success';
      log.messageId = result.messageId;
    } else {
      log.status = 'failed';
      log.error = result.error;
    }
  } catch (err) {
    log.status = 'failed';
    log.error = err.message;
  }

  return log;
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/api/status', (req, res) => res.json({ 
  isAutoPosting, 
  totalPosts: postHistory.length, 
  channel: CHANNEL_ID, 
  nextTopic: topicCache[topicCacheIndex] || 'AI se generate hoga...', 
  cachedTopics: topicCache.length - topicCacheIndex,
  postTime: process.env.POST_TIME || '09:00' 
}));
app.get('/api/history', (req, res) => res.json(postHistory));

app.post('/api/post-now', async (req, res) => {
  const { topic } = req.body;
  const log = await createAndPost(topic || null);
  res.json(log);
});

app.post('/api/start', (req, res) => {
  const { time } = req.body;
  const [hour, minute] = (time || '09:00').split(':');
  if (scheduledJob) scheduledJob.destroy();
  scheduledJob = cron.schedule(`${minute} ${hour} * * *`, async () => await createAndPost(), { timezone: 'Asia/Kolkata' });
  isAutoPosting = true;
  process.env.POST_TIME = `${hour}:${minute}`;
  res.json({ success: true, message: `Auto posting started at ${hour}:${minute} IST daily` });
});

app.post('/api/stop', (req, res) => {
  if (scheduledJob) { scheduledJob.destroy(); scheduledJob = null; }
  isAutoPosting = false;
  res.json({ success: true, message: 'Auto posting stopped' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🤖 Jarvis running | Channel: ${CHANNEL_ID} | Port: ${PORT}`));
