// database.js
const { Sequelize, Model, DataTypes } = require('sequelize');
const config = require('./config');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: config.databaseFile,
  logging: false,
});

class UserStats extends Model {}
UserStats.init({
  userId: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  totalMessages: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  totalVoiceTime: {
    type: DataTypes.FLOAT,
    defaultValue: 0,
  },
}, {
  sequelize,
  modelName: 'UserStats',
  tableName: 'user_stats',
  timestamps: false,
});

class DailyStats extends Model {}
DailyStats.init({
  userId: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  date: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  messages: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  voiceTime: {
    type: DataTypes.FLOAT,
    defaultValue: 0,
  },
  channels: {
    type: DataTypes.TEXT,
    defaultValue: '{}',
  },
}, {
  sequelize,
  modelName: 'DailyStats',
  tableName: 'daily_stats',
  timestamps: false,
});

async function initDatabase() {
  try {
    await sequelize.sync();
  } catch (err) {
    throw err;
  }
}

module.exports = { sequelize, UserStats, DailyStats, initDatabase };