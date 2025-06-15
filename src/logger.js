// logger.js
const { createLogger, format, transports } = require('winston');
const config = require('./config');

const logger = createLogger({
  level: config.logLevel,
  format: format.combine(
    format.timestamp(),
    format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'bot.log' })
  ]
});

module.exports = logger;