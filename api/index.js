'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const { authMiddleware } = require('./middleware/auth');
const authController = require('./controllers/authController');
const updateController = require('./controllers/updateController');

const app = express();

/* ------------------------------------------------------------------ */
/*  Middleware                                                          */
/* ------------------------------------------------------------------ */
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ------------------------------------------------------------------ */
/*  Database connection + model registration                           */
/* ------------------------------------------------------------------ */
app.use(async (req, res, next) => {
  try {
    const db = await connectDB();

    // Register models on this connection so controllers can use db.model()
    const User = require('./models/User');
    const UpdateFile = require('./models/UpdateFile');

    // Ensure models are attached to this specific connection
    if (!db.models.User) db.model('User', User.schema);
    if (!db.models.UpdateFile) db.model('UpdateFile', UpdateFile.schema);

    app.set('db', db);
    next();
  } catch (error) {
    console.error('[Server] DB init error:', error.message);
    res.status(500).json({ success: false, message: 'Database connection failed.' });
  }
});

/* ------------------------------------------------------------------ */
/*  Health check                                                       */
/* ------------------------------------------------------------------ */
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

/* ------------------------------------------------------------------ */
/*  Auth Routes                                                        */
/* ------------------------------------------------------------------ */
app.post('/api/auth/login', authController.login);
app.get('/api/auth/check', authMiddleware, authController.checkAuth);

/* ------------------------------------------------------------------ */
/*  Update Routes                                                      */
/* ------------------------------------------------------------------ */
app.get('/api/updates/latest', updateController.getLatestUpdates);
app.post('/api/updates/upload', authMiddleware, updateController.uploadUpdate);

/* ------------------------------------------------------------------ */
/*  404 Catch-all                                                      */
/* ------------------------------------------------------------------ */
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint not found.' });
});

/* ------------------------------------------------------------------ */
/*  Export for Vercel Serverless Functions                              */
/* ------------------------------------------------------------------ */
module.exports = app;