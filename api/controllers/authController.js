'use strict';

const bcrypt = require('bcryptjs');
const { generateToken } = require('../middleware/auth');

/**
 * POST /api/auth/login
 * Verifies admin credentials and returns a JWT token.
 */
async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required.'
      });
    }

    const db = req.app.get('db');
    console.log('[Auth] Login attempt for:', username, '| DB:', db.db.databaseName);

    const User = db.model('User');
    const user = await User.findOne({ username: username.toLowerCase().trim() });

    if (!user) {
      console.log('[Auth] User not found in DB:', db.db.databaseName);
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('[Auth] Wrong password for:', username);
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.'
      });
    }

    const token = generateToken(user);

    console.log('[Auth] Login success:', username);

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        token: token,
        username: user.username
      }
    });
  } catch (error) {
    console.error('[Auth] Login error:', error.message);
    console.error('[Auth] Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login.'
    });
  }
}

/**
 * GET /api/auth/check
 * Verifies if the current token is valid and returns user info.
 */
async function checkAuth(req, res) {
  try {
    const db = req.app.get('db');
    const User = db.model('User');
    const user = await User.findById(req.user.id).select('-password -__v').lean();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists.'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        username: user.username
      }
    });
  } catch (error) {
    console.error('[Auth] Check auth error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Internal server error during auth check.'
    });
  }
}

module.exports = { login, checkAuth };