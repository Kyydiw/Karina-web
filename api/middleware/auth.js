'use strict';

/**
 * Auth Middleware — Role-Based Access Control (RBAC)
 *
 * Tiga middleware yang disediakan:
 * 1. requireAuth  — Memastikan JWT internal valid (user sudah login).
 * 2. requireAdmin — Memastikan user yang login memiliki role === 'admin'.
 * 3. optionalAuth — Soft auth: jika token ada & valid, set req.user; jika tidak, lanjut anonymous.
 *
 * JWT payload sekarang berisi: { id, email, displayName, role, firebaseUid }
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'karina-md-fallback-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * requireAuth — Verifikasi JWT dan set req.user.
 * Digunakan pada route yang membutuhkan login (user ATAU admin).
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.id,
      email: decoded.email,
      displayName: decoded.displayName,
      role: decoded.role,
      firebaseUid: decoded.firebaseUid
    };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please log in again.'
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid token.'
    });
  }
}

/**
 * requireAdmin — Harus dipasang SETELAH requireAuth.
 * Memastikan req.user.role === 'admin'.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }
  next();
}

/**
 * optionalAuth — Soft auth middleware.
 * Jika token valid ada, set req.user; jika tidak, lanjut sebagai anonymous.
 * Cocok untuk route yang berperilaku beda untuk user vs guest (misal: ticket view/reply).
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.id,
      email: decoded.email,
      displayName: decoded.displayName,
      role: decoded.role,
      firebaseUid: decoded.firebaseUid
    };
  } catch (e) {
    /* ignore invalid token, treat as anonymous */
  }
  next();
}

/**
 * generateToken — Membuat JWT internal untuk user.
 * @param {Object} user — Mongoose User document.
 * @returns {string} Signed JWT token.
 */
function generateToken(user) {
  const payload = {
    id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    firebaseUid: user.firebaseUid
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Alias untuk backward compatibility (index.js lama masih memakai nama ini).
 * TODO: Hapus setelah semua route di index.js sudah diupdate ke requireAuth/requireAdmin.
 */
var authMiddleware = requireAuth;

module.exports = { requireAuth, requireAdmin, optionalAuth, authMiddleware, generateToken };