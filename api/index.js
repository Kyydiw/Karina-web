'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const { requireAuth, requireAdmin, optionalAuth } = require('./middleware/auth');
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
app.use(express.json({ limit: '6mb' }));
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
    version: '3.0.0'
  });
});

/* ------------------------------------------------------------------ */
/*  Database connection + model registration                           */
/* ------------------------------------------------------------------ */
app.use(async (req, res, next) => {
  try {
    const db = await connectDB();

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
/*  - POST /api/auth/google  → Google Sign-In (Firebase)               */
/*  - GET  /api/auth/check   → Verify internal JWT                    */
/* ------------------------------------------------------------------ */
app.post('/api/auth/google', authLimiter, authController.googleLogin);
app.get('/api/auth/check', requireAuth, authController.checkAuth);

/* ------------------------------------------------------------------ */
/*  Update Routes (Admin only)                                         */
/* ------------------------------------------------------------------ */
app.get('/api/updates/latest', updateController.getLatestUpdates);
app.get('/api/updates/all', updateController.getAllUpdates);
app.get('/api/updates/:id', updateController.getUpdate);
app.post('/api/updates/upload', requireAuth, requireAdmin, updateController.uploadUpdate);
app.put('/api/updates/:id', requireAuth, requireAdmin, updateController.updateUpdate);
app.delete('/api/updates/:id', requireAuth, requireAdmin, updateController.deleteUpdate);

/* ------------------------------------------------------------------ */
/*  Script Routes                                                      */
/* ------------------------------------------------------------------ */
app.get('/api/scripts/list', scriptController.listScripts);
app.get('/api/scripts/featured', scriptController.getFeaturedScripts);
app.get('/api/scripts/categories/counts', scriptController.getCategoryCounts);
app.get('/api/scripts/:idOrSlug', scriptController.getScript);
app.get('/api/scripts/:idOrSlug/download', scriptController.downloadScript);
app.post('/api/scripts/create', requireAuth, requireAdmin, scriptController.createScript);
app.put('/api/scripts/:id', requireAuth, requireAdmin, scriptController.updateScript);
app.delete('/api/scripts/:id', requireAuth, requireAdmin, scriptController.deleteScript);

/* ------------------------------------------------------------------ */
/*  Snippet Routes                                                     */
/*  Perubahan:                                                         */
/*  - POST /api/snippets        → requireAuth (user+admin bisa submit)  */
/*  - PATCH /api/snippets/:id/approve → requireAdmin (approve/reject)   */
/*  - PATCH /api/snippets/:id/reject  → requireAdmin                    */
/*  - PUT/DELETE                  → requireAdmin (sama seperti sebelum)  */
/* ------------------------------------------------------------------ */
app.get('/api/snippets/list', snippetController.listSnippets);
app.get('/api/snippets/featured', snippetController.getFeaturedSnippets);
app.get('/api/snippets/:idOrSlug', snippetController.getSnippet);
app.post('/api/snippets/:idOrSlug/copy', snippetController.recordCopy);

// Community submission: user biasa + admin bisa submit
app.post('/api/snippets', requireAuth, snippetController.createSnippet);

// Admin approval/rejection routes
app.patch('/api/snippets/:id/approve', requireAuth, requireAdmin, snippetController.approveSnippet);
app.patch('/api/snippets/:id/reject', requireAuth, requireAdmin, snippetController.rejectSnippet);

// Admin CRUD (full control)
app.put('/api/snippets/:id', requireAuth, requireAdmin, snippetController.updateSnippet);
app.delete('/api/snippets/:id', requireAuth, requireAdmin, snippetController.deleteSnippet);

/* ------------------------------------------------------------------ */
/*  Ticket Routes                                                      */
/*  - Public create + view (with access token)                        */
/*  - Admin can view all and reply                                     */
/* ------------------------------------------------------------------ */
app.post('/api/tickets/create', ticketLimiter, ticketController.createTicket);
app.get('/api/tickets/mine', ticketController.listMyTickets);
app.get('/api/tickets/:ticketNumber', optionalAuth, ticketController.getTicket);
app.post('/api/tickets/:ticketNumber/reply', replyLimiter, optionalAuth, ticketController.replyTicket);

// Admin-only ticket routes
app.get('/api/tickets/admin/list', requireAuth, requireAdmin, ticketController.adminListTickets);
app.put('/api/tickets/:ticketNumber/status', requireAuth, requireAdmin, ticketController.updateTicketStatus);
app.delete('/api/tickets/:ticketNumber', requireAuth, requireAdmin, ticketController.deleteTicket);

/* ------------------------------------------------------------------ */
/*  Admin Dashboard Routes                                             */
/* ------------------------------------------------------------------ */
app.get('/api/admin/stats', requireAuth, requireAdmin, adminController.getStats);
app.get('/api/admin/all-scripts', requireAuth, requireAdmin, adminController.listAllScripts);
app.get('/api/admin/all-snippets', requireAuth, requireAdmin, adminController.listAllSnippets);
app.get('/api/admin/all-updates', requireAuth, requireAdmin, adminController.listAllUpdates);

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