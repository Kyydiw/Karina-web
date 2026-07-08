'use strict';

/**
 * Auth Controller — Firebase Google Sign-In Integration
 *
 * Endpoint:
 * - POST /api/auth/google  — Menerima idToken dari Firebase Client SDK,
 *   memverifikasi via firebase-admin, lalu membuat/mencari user di DB
 *   dan mengembalikan JWT internal.
 * - GET  /api/auth/check   — Memverifikasi token internal & mengembalikan info user.
 * - POST /api/auth/logout  — Endpoint client-side (no-op server side, token dihapus di frontend).
 */

const { generateToken } = require('../middleware/auth');

/**
 * Inisialisasi firebase-admin SDK.
 * Dilakukan lazy (saat pertama kali dipanggil) karena:
 * - Serverless Vercel tidak mendukung top-level await dengan baik.
 * - Environment variable mungkin belum tersedia saat modul di-load.
 */
let _admin = null;

function getAdmin() {
  if (_admin) return _admin;

  // Cek apakah konfigurasi Firebase tersedia
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      'Firebase Admin SDK not configured. ' +
      'Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in environment variables.'
    );
  }

  const admin = require('firebase-admin');
  const credential = admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  });

  if (!admin.apps.length) {
    _admin = admin.initializeApp({ credential: credential });
  } else {
    _admin = admin;
  }

  return _admin;
}

/**
 * POST /api/auth/google
 *
 * Flow:
 * 1. Terima idToken dari frontend (hasil signInWithPopup).
 * 2. Verifikasi idToken via admin.auth().verifyIdToken().
 * 3. Cari user di DB berdasarkan firebaseUid.
 *    - Jika belum ada → buat user baru (role: 'user').
 *    - Jika sudah ada → update displayName & photoURL terbaru dari Google.
 * 4. Jika user adalah Ripki (email yang terdaftar di ADMIN_EMAIL env),
 *    set role = 'admin' (otomatis).
 * 5. Generate JWT internal dan kembalikan ke frontend.
 */
async function googleLogin(req, res) {
  try {
    const { idToken } = req.body;

    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Firebase ID token is required.'
      });
    }

    // 1. Verifikasi idToken via Firebase Admin SDK
    const admin = getAdmin();
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (firebaseError) {
      console.error('[Auth] Firebase verifyIdToken error:', firebaseError.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired Firebase token. Please sign in again.'
      });
    }

    const firebaseUid = decodedToken.uid;
    const email = (decodedToken.email || '').toLowerCase().trim();
    const displayName = decodedToken.name || decodedToken.displayName || 'User';
    const photoURL = decodedToken.picture || '';

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email not available from Google account. Please use an account with a verified email.'
      });
    }

    // 2. Cari atau buat user di database
    const db = req.app.get('db');
    const User = db.model('User');

    let user = await User.findOne({ firebaseUid: firebaseUid }).lean();

    if (user) {
      // Update displayName & photoURL jika berubah di Google
      const needsUpdate = (
        user.displayName !== displayName ||
        user.photoURL !== photoURL
      );
      if (needsUpdate) {
        await User.updateOne(
          { _id: user._id },
          { $set: { displayName: displayName, photoURL: photoURL } }
        );
        user.displayName = displayName;
        user.photoURL = photoURL;
      }
    } else {
      // Cek apakah email sudah terdaftar dengan firebaseUid berbeda (edge case)
      const existingByEmail = await User.findOne({ email: email }).lean();
      if (existingByEmail) {
        // Link firebaseUid ke user yang sudah ada (account merging)
        await User.updateOne(
          { _id: existingByEmail._id },
          {
            $set: {
              firebaseUid: firebaseUid,
              displayName: displayName,
              photoURL: photoURL
            }
          }
        );
        user = existingByEmail;
        user.firebaseUid = firebaseUid;
        user.displayName = displayName;
        user.photoURL = photoURL;
      } else {
        // Buat user baru
        user = await User.create({
          email: email,
          displayName: displayName,
          photoURL: photoURL,
          firebaseUid: firebaseUid,
          role: 'user'
        });
      }
    }

    // 3. Auto-promote ke admin jika email cocok ADMIN_EMAIL (Ripki)
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(function (e) {
      return e.trim().toLowerCase();
    }).filter(Boolean);

    if (adminEmails.indexOf(email) !== -1 && user.role !== 'admin') {
      await User.updateOne({ _id: user._id }, { $set: { role: 'admin' } });
      user.role = 'admin';
      console.log('[Auth] Auto-promoted user to admin:', email);
    }

    // 4. Generate JWT internal
    const token = generateToken(user);

    console.log('[Auth] Google login success:', email, '| Role:', user.role);

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        token: token,
        user: {
          id: user._id.toString(),
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('[Auth] Google login error:', error.message);
    console.error('[Auth] Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login.'
    });
  }
}

/**
 * GET /api/auth/check
 * Verifikasi token internal dan kembalikan info user terbaru dari DB.
 */
async function checkAuth(req, res) {
  try {
    const db = req.app.get('db');
    const User = db.model('User');
    const user = await User.findById(req.user.id)
      .select('-__v')
      .lean();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists.'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id.toString(),
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: user.role
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

module.exports = { googleLogin, checkAuth };