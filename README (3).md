# 🤖 Ai Daily By Jarvis - Auto Poster

Gemini AI se daily Telegram posts auto generate aur post karta hai!

## Setup Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. .env file fill karo
```
GEMINI_API_KEY=apni_gemini_key_yahan
TELEGRAM_BOT_TOKEN=apna_bot_token_yahan
CHANNEL_ID=@daily_by_jarvis
POST_TIME=09:00
PORT=3000
```

### 3. Bot ko Channel Admin banao
- Telegram pe apna channel open karo
- Settings → Administrators → Add Admin
- Apna bot search karo aur add karo
- "Post Messages" permission do

### 4. Start karo
```bash
npm start
```

### 5. Dashboard open karo
```
http://localhost:3000
```

## Features
- ✅ Daily auto posting (scheduled)
- ✅ Manual post anytime
- ✅ 15+ AI topics rotation
- ✅ Hinglish content generation
- ✅ Post history dashboard
- ✅ Custom topic add kar sakte ho

## Deploy on Render (Free)
1. GitHub pe push karo
2. render.com pe new Web Service banao
3. Environment variables add karo
4. Deploy!
