const express = require('express');
const cron = require('node-cron');
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Init Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Init Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const CHANNEL_ID = process.env.CHANNEL_ID || '@daily_by_jarvis';

// Topics rotation
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

let topicIndex = 0;
let postHistory = [];
let isAutoPosting = false;
let scheduledJob = null;

// Generate post content using Gemini
async function generatePost(topic) {
  const prompt = `Tu ek AI content creator hai "Ai Daily By Jarvis" Telegram channel ke liye.
  
Topic: ${topic}

Ek engaging Telegram post likho jo:
- Hinglish (Hindi + English mix) mein ho
- 150-200 words ka ho
- Catchy emoji use kare
- Interesting facts ya story ho
- End mein ek thought-provoking question ho readers ke liye
- Hashtags include kare: #AIDaily #AINews #Tech #Futurism #Hinglish
- Channel mention kare: @daily_by_jarvis

Sirf post content do, kuch extra mat likho.`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

// Send post to Telegram
async function sendToTelegram(content) {
  try {
    const message = await bot.sendMessage(CHANNEL_ID, content, {
      parse_mode: 'Markdown',
      disable_web_page_preview: false,
    });
    return { success: true, messageId: message.message_id };
  } catch (err) {
    // Try without markdown if formatting fails
    try {
      const message = await bot.sendMessage(CHANNEL_ID, content);
      return { success: true, messageId: message.message_id };
    } catch (err2) {
      return { success: false, error: err2.message };
    }
  }
}

// Main post function
async function createAndPost(topicOverride = null) {
  const topic = topicOverride || topics[topicIndex % topics.length];
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

    const result = await sendToTelegram(content);

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

// API Routes

// Dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get status
app.get('/api/status', (req, res) => {
  res.json({
    isAutoPosting,
    totalPosts: postHistory.length,
    channel: CHANNEL_ID,
    nextTopic: topics[topicIndex % topics.length],
    postTime: process.env.POST_TIME || '09:00',
  });
});

// Get history
app.get('/api/history', (req, res) => {
  res.json(postHistory);
});

// Get topics
app.get('/api/topics', (req, res) => {
  res.json(topics);
});

// Manual post now
app.post('/api/post-now', async (req, res) => {
  const { topic } = req.body;
  const log = await createAndPost(topic || null);
  res.json(log);
});

// Start auto posting
app.post('/api/start', (req, res) => {
  const { time } = req.body; // format: "09:00"
  const [hour, minute] = (time || process.env.POST_TIME || '09:00').split(':');

  if (scheduledJob) scheduledJob.destroy();

  scheduledJob = cron.schedule(
    `${minute} ${hour} * * *`,
    async () => {
      console.log('Auto posting...');
      await createAndPost();
    },
    { timezone: 'Asia/Kolkata' }
  );

  isAutoPosting = true;
  process.env.POST_TIME = `${hour}:${minute}`;

  res.json({ success: true, message: `Auto posting started at ${hour}:${minute} IST daily` });
});

// Stop auto posting
app.post('/api/stop', (req, res) => {
  if (scheduledJob) {
    scheduledJob.destroy();
    scheduledJob = null;
  }
  isAutoPosting = false;
  res.json({ success: true, message: 'Auto posting stopped' });
});

// Add custom topic
app.post('/api/topics', (req, res) => {
  const { topic } = req.body;
  if (topic) {
    topics.push(topic);
    res.json({ success: true, topics });
  } else {
    res.status(400).json({ error: 'Topic required' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🤖 Jarvis Auto Poster running on port ${PORT}`);
  console.log(`📱 Channel: ${CHANNEL_ID}`);
  console.log(`🌐 Dashboard: http://localhost:${PORT}`);
});
