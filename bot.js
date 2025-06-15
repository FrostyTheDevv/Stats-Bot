/*******************************************************
 * Modified "Screenshot-Style" Nebulous Stats Bot
 * 
 * - Additional Box in the middle (200x180),
 *******************************************************/
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const moment = require("moment");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder
} = require("discord.js");
const sqlite3 = require("sqlite3").verbose();
const { promisify } = require("util");
const winston = require("winston");
const QuickChart = require("quickchart-js");
const Sentry = require("@sentry/node");
const { createCanvas, loadImage } = require("canvas");

/* ================== CONFIG & LOGGING ================== */
const config = {
  discordToken: process.env.DISCORD_TOKEN || "",
  flushInterval: 10000,
  logLevel: "info",
  sentryDsn: process.env.SENTRY_DSN || "",
};

Sentry.init({
  dsn: config.sentryDsn,
  tracesSampleRate: 1.0,
});

const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
  ),
  transports: [new winston.transports.Console()]
});

/* ================== DATABASE (SQLite) ================== */
const dbFile = "stats.db";
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    logger.error(`Error opening database: ${err.message}`);
  } else {
    logger.info("Connected to SQLite database.");
  }
});
db.runAsync = promisify(db.run.bind(db));
db.getAsync = promisify(db.get.bind(db));
db.allAsync = promisify(db.all.bind(db));

async function initDatabase() {
  try {
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS user_stats (
        user_id TEXT PRIMARY KEY,
        total_messages INTEGER,
        total_voice_time REAL
      )
    `);
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS daily_stats (
        user_id TEXT,
        date TEXT,
        messages INTEGER,
        voice_time REAL,
        channels TEXT,
        PRIMARY KEY (user_id, date)
      )
    `);
    logger.info("Database tables ensured.");
  } catch (err) {
    logger.error(`Error initializing database: ${err.message}`);
  }
}

/* ================== IN-MEMORY STATS ================== */
let stats = {};

async function loadStatsFromDB() {
  try {
    const dailyRows = await db.allAsync(`SELECT * FROM daily_stats`);
    dailyRows.forEach(row => {
      if (!stats[row.user_id]) {
        stats[row.user_id] = { totalMessages: 0, totalVoiceTime: 0, daily: {} };
      }
      stats[row.user_id].daily[row.date] = {
        messages: row.messages,
        voiceTime: row.voice_time,
        channels: JSON.parse(row.channels)
      };
    });
    const userRows = await db.allAsync(`SELECT * FROM user_stats`);
    userRows.forEach(row => {
      if (!stats[row.user_id]) {
        stats[row.user_id] = { totalMessages: row.total_messages, totalVoiceTime: row.total_voice_time, daily: {} };
      } else {
        stats[row.user_id].totalMessages = row.total_messages;
        stats[row.user_id].totalVoiceTime = row.total_voice_time;
      }
    });
    logger.info("Stats loaded from database.");
  } catch (err) {
    logger.error(`Error loading stats from database: ${err.message}`);
  }
}

async function flushStatsToDB() {
  try {
    for (const userId in stats) {
      const userData = stats[userId];
      await db.runAsync(
        `INSERT INTO user_stats (user_id, total_messages, total_voice_time)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           total_messages = excluded.total_messages,
           total_voice_time = excluded.total_voice_time`,
        [userId, userData.totalMessages, userData.totalVoiceTime]
      );
      for (const date in userData.daily) {
        const dailyData = userData.daily[date];
        const channelsJSON = JSON.stringify(dailyData.channels);
        await db.runAsync(
          `INSERT INTO daily_stats (user_id, date, messages, voice_time, channels)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, date) DO UPDATE SET
             messages = excluded.messages,
             voice_time = excluded.voice_time,
             channels = excluded.channels`,
          [userId, date, dailyData.messages, dailyData.voiceTime, channelsJSON]
        );
      }
    }
    logger.info("Stats flushed to database.");
  } catch (err) {
    logger.error(`Error flushing stats to database: ${err.message}`);
  }
}
setInterval(() => { flushStatsToDB(); }, config.flushInterval);
process.on("exit", async () => { flushStatsToDB(); db.close(); });
process.on("SIGINT", () => { process.exit(); });

/* ================== STATS & ANALYTICS UTILS ================== */
function getTodayUTC() {
  return moment.utc().format("YYYY-MM-DD");
}
function getLast7Dates() {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    dates.unshift(moment.utc().subtract(i, "days").format("YYYY-MM-DD"));
  }
  return dates;
}
function initUserStats(userId) {
  if (!stats[userId]) {
    stats[userId] = { totalMessages: 0, totalVoiceTime: 0, daily: {} };
  }
}
function initUserDateStats(userId, dateStr) {
  initUserStats(userId);
  if (!stats[userId].daily[dateStr]) {
    stats[userId].daily[dateStr] = { messages: 0, voiceTime: 0, channels: {} };
  }
}
function recordMessage(userId, channelId) {
  initUserStats(userId);
  stats[userId].totalMessages++;
  const today = getTodayUTC();
  initUserDateStats(userId, today);
  stats[userId].daily[today].messages++;
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
function get1DayMessages(userId) {
  const today = getTodayUTC();
  return (stats[userId] && stats[userId].daily[today]) ? stats[userId].daily[today].messages : 0;
}
function get7DayMessages(userId) {
  const dates = getLast7Dates();
  let sum = 0;
  for (const d of dates) {
    if (stats[userId] && stats[userId].daily[d]) {
      sum += stats[userId].daily[d].messages;
    }
  }
  return sum;
}
function get1DayVoiceHours(userId) {
  const today = getTodayUTC();
  return (stats[userId] && stats[userId].daily[today])
    ? Math.floor(stats[userId].daily[today].voiceTime / 3600)
    : 0;
}
function get7DayVoiceHours(userId) {
  const dates = getLast7Dates();
  let sum = 0;
  for (const d of dates) {
    if (stats[userId] && stats[userId].daily[d]) {
      sum += stats[userId].daily[d].voiceTime;
    }
  }
  return Math.floor(sum / 3600);
}
function getUserRank(userId) {
  const allUserIds = Object.keys(stats);
  const sorted = allUserIds.sort((a, b) => get7DayMessages(b) - get7DayMessages(a));
  return sorted.indexOf(userId) + 1;
}
function getTopChannels(userId) {
  const dates = getLast7Dates();
  const channelCounts = {};
  for (const d of dates) {
    if (stats[userId] && stats[userId].daily[d]) {
      const dailyCh = stats[userId].daily[d].channels;
      for (const chId in dailyCh) {
        channelCounts[chId] = (channelCounts[chId] || 0) + dailyCh[chId];
      }
    }
  }
  const sorted = Object.entries(channelCounts)
    .map(([chId, count]) => ({ channelId: chId, count }))
    .sort((a, b) => b.count - a.count);
  return sorted.slice(0, 3);
}
function generateChart(userId) {
  const last7 = getLast7Dates();
  const msgArr = [];
  const voiceArr = [];
  for (const d of last7) {
    const dayStats = (stats[userId] && stats[userId].daily[d]) || { messages: 0, voiceTime: 0 };
    msgArr.push(dayStats.messages);
    voiceArr.push(Math.floor(dayStats.voiceTime / 3600));
  }
  const qc = new QuickChart();
  qc.setWidth(500);
  qc.setHeight(100);
  qc.setConfig({
    type: "line",
    data: {
      labels: last7.map(d => d.slice(5)),
      datasets: [
        {
          label: "Message",
          data: msgArr,
          borderColor: "green",
          fill: false,
        },
        {
          label: "Voice",
          data: voiceArr,
          borderColor: "red",
          fill: false,
        }
      ]
    },
    options: {
      legend: { display: true },
      title: { display: false },
      scales: {
        yAxes: [{ ticks: { min: 0 } }]
      }
    }
  });
  return qc.getUrl();
}

/* ================== DRAW PANEL: 4-ROW ADDITIONAL BOX (200x180) ================== */
async function drawScreenshotStylePanel({
  username,
  createdOn,
  joinedOn,
  rank,
  msg1d,
  msg7d,
  voice1d,
  voice7d,
  topChannels,
  chartUrl,
  avatarUrl
}) {
  const width = 900;
  const height = 500;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // MAIN BG
  ctx.fillStyle = "#2C2F33";
  ctx.fillRect(0, 0, width, height);

  // Title: username + "Nebulous"
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 22px Sans";
  ctx.fillText(username, 30, 40);
  ctx.font = "16px Sans";
  ctx.fillStyle = "#AAAAAA";
  ctx.fillText("Nebulous", 30, 65);

  // "Created On" box
  ctx.fillStyle = "#23272A";
  ctx.fillRect(width - 270, 20, 240, 60);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "14px Sans";
  ctx.fillText("Created On", width - 260, 40);
  ctx.fillStyle = "#AAAAAA";
  ctx.fillText(createdOn, width - 260, 58);

  // "Joined On" box
  ctx.fillStyle = "#23272A";
  ctx.fillRect(width - 270, 90, 240, 60);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("Joined On", width - 260, 110);
  ctx.fillStyle = "#AAAAAA";
  ctx.fillText(joinedOn, width - 260, 128);

  // "Charts" label box
  ctx.fillStyle = "#23272A";
  ctx.fillRect(width - 270, 160, 240, 60);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "14px Sans";
  ctx.fillText("Charts", width - 260, 180);
  ctx.fillStyle = "#AAAAAA";
  ctx.fillText("Message  •  Voice", width - 260, 195);

  // Server Ranks box
  ctx.fillStyle = "#23272A";
  ctx.fillRect(30, 80, 160, 80);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "14px Sans";
  ctx.fillText("Server Ranks", 40, 100);
  ctx.fillStyle = "#AAAAAA";
  ctx.fillText(`Message #${rank}`, 40, 120);
  ctx.fillText("Voice", 40, 140);
  ctx.fillText("No Data", 85, 140);

  // Messages box
  ctx.fillStyle = "#23272A";
  ctx.fillRect(210, 80, 160, 80);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("Messages", 220, 100);
  ctx.fillStyle = "#AAAAAA";
  ctx.fillText(`1d ${msg1d} messages`, 220, 120);
  ctx.fillText(`7d ${msg7d} messages`, 220, 140);

  // Voice Activity box
  ctx.fillStyle = "#23272A";
  ctx.fillRect(390, 80, 160, 80);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("Voice Activity", 400, 100);
  ctx.fillStyle = "#AAAAAA";
  ctx.fillText(`1d ${voice1d} hours`, 400, 120);
  ctx.fillText(`7d ${voice7d} hours`, 400, 140);

  // Top Channels & Applications box
  ctx.fillStyle = "#23272A";
  ctx.fillRect(30, 180, 520, 80);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("Top Channels & Applications", 40, 200);
  ctx.fillStyle = "#AAAAAA";
  ctx.font = "13px Sans";
  let yTop = 220;
  topChannels.split("\n").forEach(line => {
    ctx.fillText(line, 40, yTop);
    yTop += 16;
  });

  // Chart area
  ctx.fillStyle = "#23272A";
  ctx.fillRect(width - 270, 230, 240, 130);

  // BOX for avatar + pill (bottom-left)
  ctx.fillStyle = "#23272A";
  ctx.fillRect(30, 350, 250, 130);
  try {
    if (avatarUrl) {
      const avatarImg = await loadImage(avatarUrl);
      ctx.drawImage(avatarImg, 40, 360, 80, 80);
      ctx.font = "40px Sans";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText("💊", 130, 410);
    }
  } catch (err) {
    console.error("Error loading avatar image:", err.message);
  }

  // ADDITIONAL BOX (200 wide, 180 tall) in the middle
  ctx.fillStyle = "#23272A";
  ctx.fillRect(320, 280, 200, 180);

  // Label
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "14px Sans";
  ctx.fillText("Additional Box", 330, 300);

  // We'll create 4 stacked rows (instead of 5)
  let rowX = 330, rowY = 320, rowW = 180, rowH = 30;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = "#2C2F33";
    ctx.fillRect(rowX, rowY + i * rowH, rowW, rowH - 2); // -2 for small gap
    ctx.fillStyle = "#AAAAAA";
    ctx.font = "12px Sans";
    ctx.fillText(`Row #${i + 1}`, rowX + 5, rowY + i * rowH + 20);
  }

  // Footer
  ctx.font = "12px Sans";
  ctx.fillStyle = "#AAAAAA";
  ctx.fillText("Server Lookback: Last 7 days — Timezone: UTC   Provided by Nebulous", 30, height - 20);

  // LOAD chart image
  try {
    const chartImg = await loadImage(chartUrl);
    ctx.drawImage(chartImg, width - 265, 235, 230, 120);
  } catch (err) {
    console.error("Error loading chart image:", err.message);
  }

  return canvas.toBuffer("image/png");
}

/* ================== DISCORD CLIENT ================== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", async () => {
  logger.info(`Nebulous Bot is online! Logged in as ${client.user.tag}`);

  // Register slash commands
  const commands = [
    new SlashCommandBuilder()
      .setName("stats")
      .setDescription("View your stats or server stats")
      .addSubcommand(sub =>
        sub.setName("me").setDescription("View your personal last 7-day stats")
      )
      .addSubcommand(sub =>
        sub.setName("server").setDescription("View overall server stats")
      ),
  ];
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commands.map(cmd => cmd.toJSON()),
    });
    logger.info("Slash commands registered: /stats me, /stats server");
  } catch (err) {
    logger.error(`Error registering slash commands: ${err.message}`);
  }
});

/* ================== MESSAGE & VOICE TRACKING ================== */
client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  try {
    recordMessage(message.author.id, message.channelId);
  } catch (err) {
    logger.error(`Error in messageCreate: ${err.message}`);
  }
});

const voiceTimes = new Map();
client.on("voiceStateUpdate", (oldState, newState) => {
  try {
    const member = newState.member || oldState.member;
    if (!member) return;
    const userId = member.id;

    if (!oldState.channelId && newState.channelId) {
      voiceTimes.set(userId, Date.now());
    } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      if (voiceTimes.has(userId)) {
        const timeSpent = (Date.now() - voiceTimes.get(userId)) / 1000;
        recordVoiceTime(userId, timeSpent);
        voiceTimes.set(userId, Date.now());
      }
    } else if (oldState.channelId && !newState.channelId) {
      if (voiceTimes.has(userId)) {
        const timeSpent = (Date.now() - voiceTimes.get(userId)) / 1000;
        stats[userId].totalVoiceTime += timeSpent;
        stats[userId].daily[getTodayUTC()].voiceTime += timeSpent;
        voiceTimes.delete(userId);
      }
    }
  } catch (err) {
    logger.error(`Error in voiceStateUpdate: ${err.message}`);
  }
});

/* ================== SLASH COMMAND HANDLER ================== */
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "stats") return;

  const subcommand = interaction.options.getSubcommand();

  // =============== /stats me ===============
  if (subcommand === "me") {
    const userId = interaction.user.id;
    initUserStats(userId);

    // Gather dynamic data
    const username = interaction.user.username;
    const createdOn = moment(interaction.user.createdAt).format("MMMM D, YYYY");
    const joinedOn = moment(interaction.member.joinedAt).format("MMMM D, YYYY");
    const rank = getUserRank(userId);
    const msg1d = get1DayMessages(userId);
    const msg7d = get7DayMessages(userId);
    const voice1d = get1DayVoiceHours(userId);
    const voice7d = get7DayVoiceHours(userId);

    // top channels
    const topArr = getTopChannels(userId);
    let topChannels = "No Data";
    if (topArr.length > 0) {
      topChannels = topArr
        .map((ch, idx) => {
          const channelObj = interaction.guild.channels.cache.get(ch.channelId);
          const chName = channelObj ? channelObj.name : `ID:${ch.channelId}`;
          return `#${idx + 1} | ${chName} | ${ch.count} messages`;
        })
        .join("\n");
    }

    // chart
    const chartUrl = generateChart(userId);

    // user avatar
    const avatarUrl = interaction.user.displayAvatarURL({ format: "png", size: 128 });

    // draw final panel
    let panelBuffer;
    try {
      panelBuffer = await drawScreenshotStylePanel({
        username,
        createdOn,
        joinedOn,
        rank,
        msg1d,
        msg7d,
        voice1d,
        voice7d,
        topChannels,
        chartUrl,
        avatarUrl
      });
    } catch (err) {
      logger.error(`Error drawing panel: ${err.message}`);
      return interaction.reply({ content: "Failed to generate stats panel.", ephemeral: true });
    }

    const attachment = new AttachmentBuilder(panelBuffer, { name: "statsPanel.png" });
    const embed = new EmbedBuilder()
      .setDescription("Nebulous Stats Panel)")
      .setImage("attachment://statsPanel.png");

    try {
      await interaction.reply({ embeds: [embed], files: [attachment], ephemeral: true });
    } catch (err) {
      logger.error(`Error replying to /stats me: ${err.message}`);
      await interaction.reply({ content: "Failed to send stats panel.", ephemeral: true });
    }
  }

  // =============== /stats server ===============
  else if (subcommand === "server") {
    // placeholder
    const embed = new EmbedBuilder()
      .setTitle("Nebulous Server Stats (Last 7 Days)")
      .setColor("Aqua")
      .setDescription("Replace with real server stats logic if you want.")
      .setFooter({ text: "Server Lookback: Last 7 days — Timezone: UTC" });

    try {
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (err) {
      logger.error(`Error replying to /stats server: ${err.message}`);
    }
  }
});

/* ================== INIT & LOGIN ================== */
(async () => {
  try {
    await initDatabase();
    await loadStatsFromDB();
    await client.login(config.discordToken);
  } catch (err) {
    logger.error(`Error during initialization: ${err.message}`);
    process.exit(1);
  }
})();