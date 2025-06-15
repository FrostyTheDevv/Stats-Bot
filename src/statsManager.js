// statsManager.js
const moment = require('moment');
const { UserStats, DailyStats } = require('./database');
const logger = require('./logger');
const config = require('./config');

const stats = {};

function getTodayUTC() {
  return moment.utc().format("YYYY-MM-DD");
}

function getLast7Dates() {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    dates.unshift(moment.utc().subtract(i, 'days').format("YYYY-MM-DD"));
  }
  return dates;
}

function initUserStats(userId) {
  if (!stats[userId]) {
    stats[userId] = { totalMessages: 0, totalVoiceTime: 0, daily: {} };
  }
}

function initUserDateStats(userId, date) {
  initUserStats(userId);
  if (!stats[userId].daily[date]) {
    stats[userId].daily[date] = { messages: 0, voiceTime: 0, channels: {} };
  }
}

function recordMessage(userId, channelId) {
  initUserStats(userId);
  stats[userId].totalMessages += 1;
  const today = getTodayUTC();
  initUserDateStats(userId, today);
  stats[userId].daily[today].messages += 1;
  stats[userId].daily[today].channels[channelId] =
    (stats[userId].daily[today].channels[channelId] || 0) + 1;
}

function recordVoiceTime(userId, seconds) {
  initUserStats(userId);
  stats[userId].totalVoiceTime += seconds;
  const today = getTodayUTC();
  initUserDateStats(userId, today);
  stats[userId].daily[today].voiceTime += seconds;
}

async function flushStatsToDB() {
  try {
    for (const userId in stats) {
      const userData = stats[userId];
      await UserStats.upsert({
        userId,
        totalMessages: userData.totalMessages,
        totalVoiceTime: userData.totalVoiceTime,
      });
      for (const date in userData.daily) {
        const dailyData = userData.daily[date];
        await DailyStats.upsert({
          userId,
          date,
          messages: dailyData.messages,
          voiceTime: dailyData.voiceTime,
          channels: JSON.stringify(dailyData.channels),
        });
      }
    }
    logger.info("Stats flushed to database.");
  } catch (err) {
    logger.error(`Error flushing stats to DB: ${err.message}`);
  }
}

setInterval(() => {
  flushStatsToDB();
}, config.flushInterval);

module.exports = {
  stats,
  getTodayUTC,
  getLast7Dates,
  initUserStats,
  initUserDateStats,
  recordMessage,
  recordVoiceTime,
  flushStatsToDB,
};