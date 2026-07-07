'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'karina-md-fallback-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Strict auth middleware. Requires a valid Bearer token.
 * Use for admin-only routes.
 */
function authMiddleware(req, res, next) {
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
      username: decoded.username
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
 * Soft auth middleware. If a valid token is present, sets req.user; otherwise continues.
 * Use for routes that behave differently for admins vs. guests (e.g. ticket view/reply).
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.id, username: decoded.username };
  } catch (e) {
    /* ignore invalid token, treat as anonymous */
  }
  next();
}

function generateToken(user) {
  const payload = {
    id: user._id.toString(),
    username: user.username
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

module.exports = { authMiddleware, optionalAuth, generateToken };
