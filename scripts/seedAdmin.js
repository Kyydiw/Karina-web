'use strict';

/**
 * Admin seeder script.
 *
 * Usage:
 *   1. Make sure MONGODB_URI is set in your .env file (or environment).
 *   2. Run:  npm run seed
 *   3. Or with custom credentials:
 *        ADMIN_USERNAME=myadmin ADMIN_PASSWORD=Str0ngP@ss node scripts/seedAdmin.js
 *
 * This script connects to MongoDB, creates (or updates) the admin user with
 * the credentials provided, and exits. It is safe to run multiple times —
 * if the user already exists, the password will be updated.
 */

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
    password: { type: String, required: true, minlength: 6 }
  },
  { timestamps: true, collection: 'users' }
);

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('ERROR: MONGODB_URI environment variable is not set.');
    console.error('Create a .env file in the project root with:');
    console.error('  MONGODB_URI=mongodb+srv://...');
    process.exit(1);
  }

  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  if (password.length < 6) {
    console.error('ERROR: Password must be at least 6 characters.');
    process.exit(1);
  }

  console.log('[Seed] Connecting to MongoDB...');
  const conn = await mongoose.createConnection(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    dbName: 'karina_md'
  }).asPromise();

  const User = conn.model('User', userSchema);

  console.log('[Seed] Checking for existing user "' + username + '"...');
  const existing = await User.findOne({ username: username });

  const hashed = await bcrypt.hash(password, 12);

  if (existing) {
    existing.password = hashed;
    await existing.save();
    console.log('[Seed] Existing admin user updated.');
  } else {
    await User.create({ username: username, password: hashed });
    console.log('[Seed] New admin user created.');
  }

  console.log('');
  console.log('========================================');
  console.log('  Admin credentials');
  console.log('========================================');
  console.log('  Username: ' + username);
  console.log('  Password: ' + password);
  console.log('========================================');
  console.log('');
  console.log('[Seed] Done. You can now log in to the admin panel.');

  await conn.close();
  process.exit(0);
}

main().catch(function (err) {
  console.error('[Seed] Failed:', err.message);
  process.exit(1);
});
