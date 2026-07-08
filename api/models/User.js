'use strict';

const mongoose = require('mongoose');

/**
 * User Model — Firebase Auth Integration
 *
 * Skema ini mendukung autentikasi via Google Sign-In (Firebase).
 * Field utama: email, displayName, photoURL, firebaseUid, role.
 *
 * Migrasi catatan:
 * - Skema lama (username + password bcrypt) dihapus.
 * - Registrasi sekarang hanya melalui Firebase Auth (frontend Google Sign-In).
 * - Role admin ditetapkan manual (lihat authController.googleLogin).
 */
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: [254, 'Email must be at most 254 characters']
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      maxlength: [60, 'Display name must be at most 60 characters']
    },
    photoURL: {
      type: String,
      trim: true,
      default: ''
    },
    firebaseUid: {
      type: String,
      required: [true, 'Firebase UID is required'],
      unique: true,
      trim: true,
      index: true
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user'
    }
  },
  {
    timestamps: true,
    collection: 'users'
  }
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);