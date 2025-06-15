// config.js
require('dotenv').config();

module.exports = {
  discordToken: process.env.DISCORD_TOKEN || '',
  databaseFile: process.env.DATABASE_FILE || 'stats.db',
  flushInterval: parseInt(process.env.FLUSH_INTERVAL || '10000'),
  logLevel: process.env.LOG_LEVEL || 'info',
  rateLimitMs: parseInt(process.env.RATE_LIMIT_MS || '5000'),
  sentryDsn: process.env.SENTRY_DSN || '',
};