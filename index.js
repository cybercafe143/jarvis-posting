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

const imagePrompts = [
  'futuristic AI robot watching movies cinema neon lights sci-fi',
  'AI holographic tools floating space futuristic technology glowing',
  'robot and human working together office future workplace neon',
  'AI medical robot doctor scanning patient futuristic hospital blue',
  'AI creating digital art holographic canvas creative technology neon',
  'futuristic AI chatbot hologram assistant neon blue glow dark',
  'AI teaching students futuristic classroom holographic screens',
  'self driving car highway futuristic neon city night',
  'digital eye watching data streams privacy concept dark theme neon',
  'neural network brain visualization glowing connections dark background',
  'AI gaming character neon virtual world cyberpunk style',
  'humanoid robot working factory industrial futuristic dramatic',
  'AI algorithm social media network visualization digital art neon',
  'neural network brain glowing connections blue purple neon dark',
  'AI robot thinking ethics decision making dramatic lighting',
];

let topicIndex = 0;
let postHistory = [];
let isAutoPosting = false;
let scheduledJob = null;

function getImageUrl(prompt) {
  const encoded = encodeURIComponent(prompt + ' high quality dramatic 4k');
  return `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&seed=${Date.now()}`;
}

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const timeoutMs = 25000;
    const protocol = url.startsWith('https') ? https : http;
    
    const req = protocol.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error('Status: ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Image download timeout'));
    });
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

async function sendToTelegram(content, imagePrompt) {
  const imageUrl = getImageUrl(imagePrompt);
  console.log('Trying image URL:', imageUrl);

  // Try 1: Download buffer and send
  try {
    const imageBuffer = await downloadImage(imageUrl);
    console.log('Image downloaded, size:', imageBuffer.length);
    const message = await bot.sendPhoto(CHANNEL_ID, imageBuffer, { caption: content });
    console.log('SUCCESS: Photo sent with buffer!');
    return { success: true, messageId: message.message_id };
  } catch (err) {
    console.log('Buffer method failed:', err.message);
  }

  // Try 2: Send URL directly to Telegram
  try {
    const message = await bot.sendPhoto(CHANNEL_ID, imageUrl, { caption: content });
    console.log('SUCCESS: Photo sent with URL!');
    return { success: true, messageId: message.message_id };
  } catch (err) {
    console.log('URL method failed:', err.message);
  }

  // Try 3: Text only
  try {
    const message = await bot.sendMessage(CHANNEL_ID, content);
    console.log('Fallback: Text only sent');
    return { success: true, messageId: message.message_id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function createAndPost(topicOverride = null) {
  const idx = topicIndex % topics.length;
  const topic = topicOverride || topics[idx];
  const imagePrompt = imagePrompts[idx];
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

    const result = await sendToTelegram(content, imagePrompt);

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

app.get('/api/status', (req, res) => {
  res.json({
    isAutoPosting,
    totalPosts: postHistory.length,
    channel: CHANNEL_ID,
    nextTopic: topics[topicIndex % topics.length],
    postTime: process.env.POST_TIME || '09:00',
  });
});

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
  scheduledJob = cron.schedule(
    `${minute} ${hour} * * *`,
    async () => { console.log('Auto posting...'); await createAndPost(); },
    { timezone: 'Asia/Kolkata' }
  );
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
app.listen(PORT, () => {
  console.log(`🤖 Jarvis running on port ${PORT} | Channel: ${CHANNEL_ID}`);
});
