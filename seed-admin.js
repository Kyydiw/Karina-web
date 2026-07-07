/**
 * seed-admin.js
 * Script untuk membuat akun admin di MongoDB Atlas.
 * Jalankan: node seed-admin.js
 */
'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ============================================================
// KONFIGURASI — GANTI SESUAI DATA-MU
// ============================================================
const MONGODB_URI = 'mongodb+srv://kyy023818_db_user:egHxhv6fmiEYdyvy@cluster0.5pj4h3h.mongodb.net/?appName=Cluster0&compressors=zlib';

const ADMIN_USERNAME = 'admin';        // ganti sesuai keinginan
const ADMIN_PASSWORD = 'admin123';     // ganti dengan password kuat

// ============================================================

async function seed() {
  console.log('[Seed] Menghubungkan ke MongoDB Atlas...');

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      dbName: 'karina_md'
    });
    console.log('[Seed] Koneksi berhasil.');

    // Tampilkan nama database yang sedang dipakai
    console.log('[Seed] Database: ' + mongoose.connection.db.databaseName);

    // Definisi schema User (sama dengan api/models/User.js)
    const userSchema = new mongoose.Schema({
      username: { type: String, required: true, unique: true },
      password: { type: String, required: true }
    }, { collection: 'users' });

    // Gunakan model yang sudah ada, atau buat baru
    const User = mongoose.models.User || mongoose.model('User', userSchema);

    // Cek apakah user sudah ada
    const existing = await User.findOne({ username: ADMIN_USERNAME });
    if (existing) {
      console.log('[Seed] User "' + ADMIN_USERNAME + '" SUDAH ADA di database.');
      console.log('[Seed] Jika ingin mengubah password, hapus dulu user lama.');
      console.log('');
      console.log('  Untuk menghapus: db.users.deleteOne({username:"' + ADMIN_USERNAME + '"})');
      await mongoose.disconnect();
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

    // Insert user baru
    await User.create({
      username: ADMIN_USERNAME,
      password: hashedPassword
    });

    console.log('');
    console.log('============================================');
    console.log('  ADMIN USER BERHASIL DIBUAT!');
    console.log('============================================');
    console.log('  Username : ' + ADMIN_USERNAME);
    console.log('  Password : ' + ADMIN_PASSWORD);
    console.log('  Database : ' + mongoose.connection.db.databaseName);
    console.log('============================================');
    console.log('');
    console.log('Sekarang buka website-mu dan login dengan data di atas.');

  } catch (error) {
    console.error('[Seed] ERROR:', error.message);
    if (error.message.includes('Authentication failed')) {
      console.log('');
      console.log('TIPS: Pastikan MONGODB_URI sudah benar.');
      console.log('Format: mongodb+srv://<user_db>:<password_db>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority');
      console.log('<user_db> dan <password_db> adalah akun MongoDB Atlas, BUKAN akun admin website.');
    }
  } finally {
    await mongoose.disconnect();
    console.log('[Seed] Koneksi ditutup.');
  }
}

seed();