'use strict';

const rateLimit = require('express-rate-limit');

/**
 * Strict limiter for auth & ticket creation — prevent brute force and spam.
 * 10 requests per 15 minutes per IP.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again in 15 minutes.'
  },
  keyGenerator: function (req) {
    return req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  }
});

/**
 * Ticket creation limiter — 5 tickets per hour per IP (anti-spam).
 */
const ticketLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many tickets created. Please try again later.'
  },
  keyGenerator: function (req) {
    return req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  }
});

/**
 * Ticket reply limiter — 30 replies per hour per IP.
 */
const replyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many replies. Please slow down.'
  },
  keyGenerator: function (req) {
    return req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  }
});

/**
 * General API limiter — 200 requests per 10 minutes per IP.
 */
const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down.'
  },
  keyGenerator: function (req) {
    return req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  }
});

module.exports = { authLimiter, ticketLimiter, replyLimiter, apiLimiter };
