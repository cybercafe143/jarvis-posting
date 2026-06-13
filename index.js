const express = require('express');
const cron = require('node-cron');
const TelegramBot = require('node-telegram-bot-api');
const Groq = require('groq-sdk');
const https = require('https');
const http = require('http');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const CHANNEL_ID = process.env.CHANNEL_ID;

const topics = [
  'AI aur Popular Culture - movies, shows mein AI ka role',
  'AI Tools jo aaj use kar sakte ho - practical tips',
  'Future of Jobs - AI se kya badlega',
  'AI aur Healthcare - medical mein revolution',
  'AI Art and Creativity - machines ka creative side',
  'Chatbots aur Virtual Assistants - future kya hai',
  'AI in Education - padhai ka future',
  'Self Driving Cars aur AI - kab aayenge India mein',
  'AI aur Privacy - kya humara data safe hai',
  'Machine Learning basics - simple Hinglish mein',
  'AI aur Gaming - next level gaming experience',
  'Robots aur AI - kya robots lenge hamare kaam',
  'AI aur Social Media - algorithm ka khel',
  'Neural Networks - brain jaisa computer',
  'AI Ethics - sahi aur galat ka faisla kaun karega',
];

// Fixed Unsplash image URLs - tech/AI themed, no API key needed
const techImages = [
  'https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=1024&q=80', // AI art
  'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1024&q=80', // robot
  'https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=1024&q=80', // tech
  'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1024&q=80', // medical tech
  'https://images.unsplash.com/photo-1561736778-92e52a7769ef?w=1024&q=80', // digital art
  'https://images.unsplash.com/photo-1655720828018-edd2daec9349?w=1024&q=80', // chatbot
  'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1024&q=80', // education
  'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=1024&q=80', // self driving
  'https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?w=1024&q=80', // privacy/security
  'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=1024&q=80', // network
  'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=1024&q=80', // gaming
  'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1024&q=80', // circuit/robot
  'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=1024&q=80', // social media
  'https://images.unsplash.com/photo-1507146153580-69a1fe6d8aa1?w=1024&q=80', // neural/brain
  'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1024&q=80', // AI ethics
];

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

async function generatePost(topic) {
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{
      role: 'user',
      content: `Tu ek AI content creator hai "Ai Daily By Jarvis" Telegram channel ke liye.
Topic: ${topic}
Ek engaging Telegram post likho jo:
- Hinglish (Hindi + English mix) mein ho
- 150-200 words ka ho
- Catchy emoji use kare
- End mein thought-provoking question ho
- Hashtags: #AIDaily #AINews #Tech #Futurism #Hinglish
- Channel mention: @daily_by_jarvis
Sirf post content do, kuch extra mat likho.`
    }],
    max_tokens: 500,
  });
  return completion.choices[0].message.content;
}

async function sendToTelegram(content, imageUrl) {
  console.log('Downloading image from:', imageUrl);

  // Try: Download and send as buffer
  try {
    const imageBuffer = await downloadImage(imageUrl);
    console.log('Downloaded! Size:', imageBuffer.length, 'bytes');
    const message = await bot.sendPhoto(CHANNEL_ID, imageBuffer, { caption: content });
    console.log('Photo + caption sent!');
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
  const idx = topicIndex % topics.length;
  const topic = topicOverride || topics[idx];
  const imageUrl = techImages[idx % techImages.length];
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
app.get('/api/status', (req, res) => res.json({ isAutoPosting, totalPosts: postHistory.length, channel: CHANNEL_ID, nextTopic: topics[topicIndex % topics.length], postTime: process.env.POST_TIME || '09:00' }));
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
