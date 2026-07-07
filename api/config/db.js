'use strict';

const mongoose = require('mongoose');

let cachedConnection = null;

async function connectDB() {
  if (cachedConnection) {
    return cachedConnection;
  }

  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error(
      'MONGODB_URI environment variable is not defined. ' +
      'Please set it in your Vercel project settings or .env file.'
    );
  }

  try {
    const conn = await mongoose.createConnection(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      dbName: 'karina_md'
    }).asPromise();

    conn.on('connected', () => {
      console.log('[DB] MongoDB Atlas connected successfully.');
    });

    conn.on('error', (err) => {
      console.error('[DB] MongoDB connection error:', err.message);
      cachedConnection = null;
    });

    conn.on('disconnected', () => {
      console.log('[DB] MongoDB disconnected.');
      cachedConnection = null;
    });

    cachedConnection = conn;
    return conn;
  } catch (error) {
    console.error('[DB] Failed to connect to MongoDB:', error.message);
    cachedConnection = null;
    throw error;
  }
}

module.exports = connectDB;