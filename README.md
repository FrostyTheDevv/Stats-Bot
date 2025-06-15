# 📊 Stats Bot

A modular Discord stats bot built with Node.js.

## 📁 Folder Structure

📦stats-bot
┣ 📂src
┃ ┣ 📜commands.js # Command handling
┃ ┣ 📜config.js # Configurable constants
┃ ┣ 📜database.js # SQLite DB interface
┃ ┣ 📜events.js # Event listeners
┃ ┣ 📜index.js # Bot startup
┃ ┣ 📜logger.js # Logging utility
┃ ┗ 📜statsManager.js # Stats tracking logic
┣ 📜.env # Environment variables (ignored)
┣ 📜bot.js # Entry point
┣ 📜package.json
┣ 📜package-lock.json
┗ 📜stats.db # Local database (ignored)


## 🚀 Getting Started

### 1. Clone the Repo
```bash
git clone https://github.com/YOUR_USERNAME/stats-bot.git
cd stats-bot
```

2. Install Dependencies
```bash
npm install
```

3. Create .env
```bash
DISCORD_TOKEN=your_token_here
```

4. Run the Bot
```bash
node bot.js
```

🧠 Features
Tracks user stats

Modular file structure

SQLite-based storage

Event & command handler
