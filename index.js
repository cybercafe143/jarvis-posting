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

// Init Groq
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Init Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const CHANNEL_ID = process.env.CHANNEL_ID;

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

// Image prompts for each topic
const imagePrompts = [
  'futuristic AI robot watching movies in cinema, neon lights, sci-fi',
  'AI holographic tools floating in space, futuristic technology',
  'robot and human working together in office, future workplace',
  'AI medical robot doctor scanning patient, futuristic hospital',
  'AI creating digital art on holographic canvas, creative technology',
  'futuristic AI chatbot hologram assistant, neon blue glow',
  'AI teaching students in futuristic classroom, holographic screens',
  'self driving car on Indian highway, futuristic neon city',
  'digital eye watching data streams, privacy concept, dark theme',
  'neural network brain visualization, glowing connections, dark background',
  'AI gaming character in neon virtual world, cyberpunk style',
  'humanoid robot working in factory, industrial futuristic',
  'AI algorithm social media network visualization, digital art',
  'neural network brain glowing connections, blue purple neon',
  'AI robot thinking ethics decision making, dramatic lighting',
];

let topicIndex = 0;
let postHistory = [];
let isAutoPosting = false;
let scheduledJob = null;

// Generate image URL from Pollinations (FREE)
function getImageUrl(prompt) {
  const encoded = encodeURIComponent(prompt + ', high quality, dramatic lighting, 4k');
  return `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true`;
}

// Download image as buffer
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// Generate post content using Groq
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

// Send post with photo to Telegram
async function sendToTelegram(content, imagePrompt) {
  try {
    const imageUrl = getImageUrl(imagePrompt);
    console.log('Generating image:', imageUrl);
    
    // Download image
    const imageBuffer = await downloadImage(imageUrl);
    
    // Send photo with caption
    const message = await bot.sendPhoto(CHANNEL_ID, imageBuffer, {
      caption: content,
    });
    return { success: true, messageId: message.message_id };
  } catch (err) {
    console.log('Image failed, trying text only:', err.message);
    // Fallback to text only
    try {
      const message = await bot.sendMessage(CHANNEL_ID, content);
      return { success: true, messageId: message.message_id };
    } catch (err2) {
      return { success: false, error: err2.message };
    }
  }
}

// Main post function
async function createAndPost(topicOverride = null, promptOverride = null) {
  const idx = topicIndex % topics.length;
  const topic = topicOverride || topics[idx];
  const imagePrompt = promptOverride || imagePrompts[idx] || 'futuristic AI technology neon glow';
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

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/status', (req, res) => {
  res.json({
    isAutoPosting,
    totalPosts: postHistory.length,
    channel: CHANNEL_ID,
    nextTopic: topics[topicIndex % topics.length],
    postTime: process.env.POST_TIME || '09:00',
  });
});

app.get('/api/history', (req, res) => {
  res.json(postHistory);
});

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

app.post('/api/stop', (req, res) => {
  if (scheduledJob) {
    scheduledJob.destroy();
    scheduledJob = null;
  }
  isAutoPosting = false;
  res.json({ success: true, message: 'Auto posting stopped' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🤖 Jarvis Auto Poster running on port ${PORT}`);
  console.log(`📱 Channel: ${CHANNEL_ID}`);
  console.log(`🌐 Dashboard: http://localhost:${PORT}`);
});
