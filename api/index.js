'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const { authMiddleware, optionalAuth } = require('./middleware/auth');
const { authLimiter, ticketLimiter, replyLimiter, apiLimiter } = require('./middleware/rateLimiter');

const authController = require('./controllers/authController');
const updateController = require('./controllers/updateController');
const scriptController = require('./controllers/scriptController');
const snippetController = require('./controllers/snippetController');
const ticketController = require('./controllers/ticketController');
const adminController = require('./controllers/adminController');

const app = express();

/* ------------------------------------------------------------------ */
/*  Middleware                                                          */
/* ------------------------------------------------------------------ */
app.use(cookieParser());
app.use(express.json({ limit: '6mb' }));         // allow large file content payloads
app.use(express.urlencoded({ extended: true, limit: '6mb' }));

// General API rate limiting (applied to /api/* only)
app.use('/api', apiLimiter);

/* ------------------------------------------------------------------ */
/*  Health check (must work even if DB is unreachable)                 */
/* ------------------------------------------------------------------ */
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

/* ------------------------------------------------------------------ */
/*  Database connection + model registration                           */
/* ------------------------------------------------------------------ */
app.use(async (req, res, next) => {
  try {
    const db = await connectDB();

    // Register models on this connection so controllers can use db.model()
    const User = require('./models/User');
    const UpdateFile = require('./models/UpdateFile');
    const Script = require('./models/Script');
    const Snippet = require('./models/Snippet');
    const Ticket = require('./models/Ticket');

    if (!db.models.User) db.model('User', User.schema);
    if (!db.models.UpdateFile) db.model('UpdateFile', UpdateFile.schema);
    if (!db.models.Script) db.model('Script', Script.schema);
    if (!db.models.Snippet) db.model('Snippet', Snippet.schema);
    if (!db.models.Ticket) db.model('Ticket', Ticket.schema);

    app.set('db', db);
    next();
  } catch (error) {
    console.error('[Server] DB init error:', error.message);
    res.status(500).json({ success: false, message: 'Database connection failed.' });
  }
});

/* ------------------------------------------------------------------ */
/*  Auth Routes                                                        */
/* ------------------------------------------------------------------ */
app.post('/api/auth/login', authLimiter, authController.login);
app.get('/api/auth/check', authMiddleware, authController.checkAuth);

/* ------------------------------------------------------------------ */
/*  Update Routes                                                      */
/* ------------------------------------------------------------------ */
app.get('/api/updates/latest', updateController.getLatestUpdates);
app.get('/api/updates/all', updateController.getAllUpdates);
app.get('/api/updates/:id', updateController.getUpdate);
app.post('/api/updates/upload', authMiddleware, updateController.uploadUpdate);
app.put('/api/updates/:id', authMiddleware, updateController.updateUpdate);
app.delete('/api/updates/:id', authMiddleware, updateController.deleteUpdate);

/* ------------------------------------------------------------------ */
/*  Script Routes                                                      */
/* ------------------------------------------------------------------ */
app.get('/api/scripts/list', scriptController.listScripts);
app.get('/api/scripts/featured', scriptController.getFeaturedScripts);
app.get('/api/scripts/categories/counts', scriptController.getCategoryCounts);
app.get('/api/scripts/:idOrSlug', scriptController.getScript);
app.get('/api/scripts/:idOrSlug/download', scriptController.downloadScript);
app.post('/api/scripts/create', authMiddleware, scriptController.createScript);
app.put('/api/scripts/:id', authMiddleware, scriptController.updateScript);
app.delete('/api/scripts/:id', authMiddleware, scriptController.deleteScript);

/* ------------------------------------------------------------------ */
/*  Snippet Routes                                                     */
/* ------------------------------------------------------------------ */
app.get('/api/snippets/list', snippetController.listSnippets);
app.get('/api/snippets/featured', snippetController.getFeaturedSnippets);
app.get('/api/snippets/:idOrSlug', snippetController.getSnippet);
app.post('/api/snippets/:idOrSlug/copy', snippetController.recordCopy);
app.post('/api/snippets/create', authMiddleware, snippetController.createSnippet);
app.put('/api/snippets/:id', authMiddleware, snippetController.updateSnippet);
app.delete('/api/snippets/:id', authMiddleware, snippetController.deleteSnippet);

/* ------------------------------------------------------------------ */
/*  Ticket Routes                                                      */
/*  - Public create + view (with access token)                        */
/*  - Admin can view all and reply without token                      */
/* ------------------------------------------------------------------ */
app.post('/api/tickets/create', ticketLimiter, ticketController.createTicket);
app.get('/api/tickets/mine', ticketController.listMyTickets);
app.get('/api/tickets/:ticketNumber', optionalAuth, ticketController.getTicket);
app.post('/api/tickets/:ticketNumber/reply', replyLimiter, optionalAuth, ticketController.replyTicket);

// Admin-only ticket routes
app.get('/api/tickets/admin/list', authMiddleware, ticketController.adminListTickets);
app.put('/api/tickets/:ticketNumber/status', authMiddleware, ticketController.updateTicketStatus);
app.delete('/api/tickets/:ticketNumber', authMiddleware, ticketController.deleteTicket);

/* ------------------------------------------------------------------ */
/*  Admin Dashboard Routes                                             */
/* ------------------------------------------------------------------ */
app.get('/api/admin/stats', authMiddleware, adminController.getStats);
app.get('/api/admin/all-scripts', authMiddleware, adminController.listAllScripts);
app.get('/api/admin/all-snippets', authMiddleware, adminController.listAllSnippets);
app.get('/api/admin/all-updates', authMiddleware, adminController.listAllUpdates);

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
