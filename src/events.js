// events.js
const { recordMessage, recordVoiceTime, getTodayUTC, initUserStats, initUserDateStats } = require('./statsManager');
const logger = require('./logger');

const voiceJoinTimes = new Map();

function registerEventHandlers(client) {
  // Message tracking
  client.on("messageCreate", message => {
    if (message.author.bot) return;
    try {
      recordMessage(message.author.id, message.channelId);
    } catch (err) {
      logger.error(`Error in messageCreate: ${err.message}`);
    }
  });

  // Voice state updates
  client.on("voiceStateUpdate", (oldState, newState) => {
    try {
      const member = newState.member || oldState.member;
      if (!member) return;
      const userId = member.id;
      initUserStats(userId);
      const today = getTodayUTC();
      initUserDateStats(userId, today);

      // User joins a voice channel
      if (!oldState.channelId && newState.channelId) {
        voiceJoinTimes.set(userId, Date.now());
      }
      // User switches channels (treated as continuous)
      else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        if (voiceJoinTimes.has(userId)) {
          const joinTime = voiceJoinTimes.get(userId);
          const timeSpent = (Date.now() - joinTime) / 1000;
          recordVoiceTime(userId, timeSpent);
          voiceJoinTimes.set(userId, Date.now());
        }
      }
      // User leaves a voice channel
      else if (oldState.channelId && !newState.channelId) {
        if (voiceJoinTimes.has(userId)) {
          const joinTime = voiceJoinTimes.get(userId);
          const timeSpent = (Date.now() - joinTime) / 1000;
          recordVoiceTime(userId, timeSpent);
          voiceJoinTimes.delete(userId);
        }
      }
    } catch (err) {
      logger.error(`Error in voiceStateUpdate: ${err.message}`);
    }
  });
}

module.exports = { registerEventHandlers };