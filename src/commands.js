// commands.js
const { SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const moment = require('moment');
const QuickChart = require('quickchart-js');
const config = require('./config');
const logger = require('./logger');
const { stats, getLast7Dates } = require('./statsManager');

// Helper functions for analytics using in-memory stats
function getLast7DaysMessagesLocal(userId) {
  const dates = getLast7Dates();
  let sum = 0;
  for (const date of dates) {
    if (stats[userId] && stats[userId].daily[date]) {
      sum += stats[userId].daily[date].messages;
    }
  }
  return sum;
}

function getLast7DaysVoiceTimeLocal(userId) {
  const dates = getLast7Dates();
  let sum = 0;
  for (const date of dates) {
    if (stats[userId] && stats[userId].daily[date]) {
      sum += stats[userId].daily[date].voiceTime;
    }
  }
  return sum;
}

function getUserRankLocal(userId) {
  const userIds = Object.keys(stats);
  const sorted = userIds.sort(
    (a, b) => getLast7DaysMessagesLocal(b) - getLast7DaysMessagesLocal(a)
  );
  return sorted.indexOf(userId) + 1;
}

function getTopChannelsLocal(userId) {
  const dates = getLast7Dates();
  const channelCounts = {};
  dates.forEach(date => {
    if (stats[userId] && stats[userId].daily[date]) {
      const channels = stats[userId].daily[date].channels;
      for (const channelId in channels) {
        channelCounts[channelId] = (channelCounts[channelId] || 0) + channels[channelId];
      }
    }
  });
  const sorted = Object.entries(channelCounts)
    .map(([channelId, count]) => ({ channelId, count }))
    .sort((a, b) => b.count - a.count);
  return sorted;
}

// In-memory rate limiter: userId => last command timestamp
const commandTimestamps = new Map();
const RATE_LIMIT_MS = config.rateLimitMs;

function registerCommands(client) {
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "stats") return;

    const userId = interaction.user.id;
    const now = Date.now();
    if (commandTimestamps.has(userId)) {
      const last = commandTimestamps.get(userId);
      if (now - last < RATE_LIMIT_MS) {
        await interaction.reply({ content: "You're doing that too fast. Please wait a moment.", ephemeral: true });
        return;
      }
    }
    commandTimestamps.set(userId, now);

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "me") {
      const last7Msg = getLast7DaysMessagesLocal(userId);
      const last7Voice = getLast7DaysVoiceTimeLocal(userId);
      const rank = getUserRankLocal(userId);
      const dates = getLast7Dates();
      const messagesArr = dates.map(date =>
        (stats[userId] && stats[userId].daily[date] ? stats[userId].daily[date].messages : 0)
      );
      const voiceArr = dates.map(date =>
        (stats[userId] && stats[userId].daily[date] ? Math.round(stats[userId].daily[date].voiceTime) : 0)
      );

      // Generate a chart image using QuickChart
      const qc = new QuickChart();
      qc.setWidth(500);
      qc.setHeight(300);
      qc.setConfig({
        type: 'line',
        data: {
          labels: dates.map(d => d.slice(5)),
          datasets: [
            {
              label: 'Messages',
              data: messagesArr,
              borderColor: 'blue',
              fill: false,
            },
            {
              label: 'Voice (min)',
              data: voiceArr.map(v => Math.round(v / 60)),
              borderColor: 'green',
              fill: false,
            },
          ],
        },
        options: {
          title: {
            display: true,
            text: 'Last 7 Days Stats',
          },
        },
      });
      const chartUrl = qc.getUrl();

      const topChannels = getTopChannelsLocal(userId).slice(0, 3);
      const topChannelsField = topChannels.length > 0 ?
        topChannels.map(tc => `• ${tc.channelId}: **${tc.count}** messages`).join("\n")
        : "No channel data";

      const joinedOn = moment(interaction.member?.joinedAt || new Date()).format("MMMM D, YYYY");
      const createdOn = moment(interaction.user.createdAt).format("MMMM D, YYYY");

      const embed = new EmbedBuilder()
        .setColor("Aqua")
        .setTitle(`Ecstasy Stats for ${interaction.user.username}`)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: "Server Rank", value: `#${rank}`, inline: true },
          { name: "Messages (7d)", value: `${last7Msg}`, inline: true },
          { name: "Voice (7d)", value: last7Voice > 0 ? `${Math.floor(last7Voice / 60)} min` : "No Data", inline: true },
          { name: "Joined On", value: joinedOn, inline: true },
          { name: "Created On", value: createdOn, inline: true },
          { name: "Top Channels (7d)", value: topChannelsField }
        )
        .setImage(chartUrl)
        .setFooter({ text: "Server Lookback: Last 7 days (UTC) • Provided by Ecstasy" });
      try {
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } catch (err) {
        logger.error(`Error replying to /stats me: ${err.message}`);
      }
    } else if (subcommand === "server") {
      const allUserIds = Object.keys(stats);
      if (allUserIds.length === 0) {
        await interaction.reply({ content: "No stats available yet.", ephemeral: true });
        return;
      }
      const sorted = allUserIds.sort((a, b) => getLast7DaysMessagesLocal(b) - getLast7DaysMessagesLocal(a));
      const top5 = sorted.slice(0, 5).map((id, idx) => {
        const count = getLast7DaysMessagesLocal(id);
        return `**#${idx + 1}** ${id}: ${count} messages`;
      });
      let totalMsg = 0;
      let totalVoice = 0;
      const dates = getLast7Dates();
      allUserIds.forEach(uid => {
        dates.forEach(date => {
          if (stats[uid] && stats[uid].daily[date]) {
            totalMsg += stats[uid].daily[date].messages;
            totalVoice += stats[uid].daily[date].voiceTime;
          }
        });
      });
      const embed = new EmbedBuilder()
        .setTitle("Ecstasy Server Stats (Last 7 Days)")
        .setColor("Aqua")
        .setDescription(
          `**Total Messages (7d):** ${totalMsg}\n**Total Voice (7d):** ${Math.floor(totalVoice / 60)} minutes\n\n` +
          `**Top 5 Users (by messages):**\n${top5.join("\n")}`
        )
        .setFooter({ text: "Server Lookback: Last 7 days (UTC) • Provided by Ecstasy" });
      try {
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } catch (err) {
        logger.error(`Error replying to /stats server: ${err.message}`);
      }
    }
  });
}

async function registerSlashCommands(client) {
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
  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commands.map(cmd => cmd.toJSON()),
    });
    logger.info("Slash commands registered.");
  } catch (err) {
    logger.error(`Error registering slash commands: ${err.message}`);
  }
}

module.exports = { registerCommands, registerSlashCommands };