// index.js
const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const logger = require('./logger');
const { initDatabase } = require('./database');
const { registerEventHandlers } = require('./events');
const { registerSlashCommands, registerCommands } = require('./commands');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: config.sentryDsn,
  tracesSampleRate: 1.0,
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

registerEventHandlers(client);
registerCommands(client);

client.once('ready', async () => {
  logger.info(`Ecstasy Bot (${client.user.tag}) is online!`);
  await registerSlashCommands(client);
});

process.on('uncaughtException', err => {
  logger.error(`Uncaught Exception: ${err.message}`);
  Sentry.captureException(err);
});
process.on('unhandledRejection', err => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  Sentry.captureException(err);
});

(async () => {
  try {
    await initDatabase();
    client.login(config.discordToken);
  } catch (err) {
    logger.error(`Error during initialization: ${err.message}`);
    process.exit(1);
  }
})();