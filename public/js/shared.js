/* ============================================================
   Karina-MD Platform — Shared JS utilities
   Provides: Firebase Client SDK init, Google Sign-In, API client,
   auth state, toast notifications, state-aware navbar injection,
   footer injection, date formatting, escape HTML, query string parsing.
   ============================================================ */
(function (window) {
  'use strict';

  var API_BASE = '/api';
  var TOKEN_KEY = 'karina_token';
  var USER_KEY = 'karina_user';

  /* ---------- Firebase Config ---------- */
  // Ganti nilai ini dengan konfigurasi Firebase project Anda.
  // Diperoleh dari: Firebase Console > Project Settings > General > Your apps > Web app.
  var FIREBASE_CONFIG = {
    apiKey: window.__FIREBASE_API_KEY__ || '',
    authDomain: window.__FIREBASE_AUTH_DOMAIN__ || '',
    projectId: window.__FIREBASE_PROJECT_ID__ || '',
    storageBucket: window.__FIREBASE_STORAGE_BUCKET__ || '',
    messagingSenderId: window.__FIREBASE_MESSAGING_SENDER_ID__ || '',
    appId: window.__FIREBASE_APP_ID__ || ''
  };

  /* ---------- Firebase SDK references ---------- */
  var _firebaseAuth = null;
  var _googleProvider = null;
  var _firebaseReady = false;

  /**
   * Lazy-init Firebase Client SDK (v10 Modular style via CDN compat).
   * SDK dimuat dari CDN di HTML. Fungsi ini membuat instance Auth & GoogleAuthProvider.
   */
  function initFirebase() {
    if (_firebaseReady) return true;

    try {
      // Firebase v10 Modular: kita gunakan global `firebase` namespace dari compat bundle
      // yang dimuat via <script> tag di setiap halaman.
      if (typeof firebase === 'undefined') {
        console.warn('[Karina] Firebase SDK not loaded. Google Sign-In will be unavailable.');
        return false;
      }

      if (!firebase.apps || firebase.apps.length === 0) {
        if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.projectId) {
          console.warn('[Karina] Firebase config missing. Google Sign-In will be unavailable.');
          return false;
        }
        firebase.initializeApp(FIREBASE_CONFIG);
      }

      _firebaseAuth = firebase.auth();
      _googleProvider = new firebase.auth.GoogleAuthProvider();
      // Scope tambahan untuk mendapatkan foto profil
      _googleProvider.addScope('profile');
      _googleProvider.addScope('email');

      _firebaseReady = true;
      console.log('[Karina] Firebase Client SDK initialized.');
      return true;
    } catch (err) {
      console.error('[Karina] Firebase init error:', err.message);
      return false;
    }
  }

  /* ---------- Token storage ---------- */
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function setToken(token, user) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) { /* noop */ }
  }
  function removeToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (e) { /* noop */ }
  }
  function getCachedUser() {
    try {
      var raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* ---------- API client ---------- */
  function api(path, options) {
    options = options || {};
    var headers = Object.assign({}, options.headers || {});
    if (!headers['Content-Type'] && options.body && typeof options.body === 'string') {
      headers['Content-Type'] = 'application/json';
    }
    var token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(API_BASE + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body
    }).then(function (res) {
      var ct = res.headers.get('content-type') || '';
      if (ct.indexOf('application/json') !== -1) {
        return res.json().then(function (json) {
          if (!res.ok && !json.success) {
            var err = new Error(json.message || 'Request failed');
            err.status = res.status;
            err.body = json;
            throw err;
          }
          return json;
        });
      }
      // Non-JSON response (e.g. file download)
      if (!res.ok) {
        var err = new Error('Request failed with status ' + res.status);
        err.status = res.status;
        throw err;
      }
      return res;
    });
  }

  /* ---------- Auth state ---------- */
  var authState = { isAuthenticated: false, user: null };

  /**
   * refreshAuthState — Verifikasi token internal ke backend dan update state.
   * Jika token expired/invalid, clear localStorage.
   */
  function refreshAuthState() {
    return api('/auth/check').then(function (json) {
      if (json.success && json.data) {
        authState.isAuthenticated = true;
        authState.user = json.data;
        setToken(getToken(), json.data);
      } else {
        removeToken();
        authState.isAuthenticated = false;
        authState.user = null;
      }
      return authState;
    }).catch(function () {
      removeToken();
      authState.isAuthenticated = false;
      authState.user = null;
      return authState;
    });
  }

  /**
   * googleSignIn — Memulai Google Sign-In popup via Firebase Client SDK.
   * Setelah berhasil, kirim idToken ke backend /api/auth/google.
   * Backend mengembalikan JWT internal yang disimpan ke localStorage.
   */
  function googleSignIn() {
    if (!initFirebase()) {
      toast('Google Sign-In is not available. Firebase SDK is not configured.', 'error');
      return Promise.reject(new Error('Firebase not configured'));
    }

    return _firebaseAuth.signInWithPopup(_googleProvider)
      .then(function (result) {
        // Dapatkan idToken dari credential
        return result.user.getIdToken();
      })
      .then(function (idToken) {
        // Kirim idToken ke backend
        return api('/auth/google', {
          method: 'POST',
          body: JSON.stringify({ idToken: idToken })
        });
      })
      .then(function (json) {
        if (json.success) {
          setToken(json.data.token, json.data.user);
          authState.isAuthenticated = true;
          authState.user = json.data.user;
        }
        return json;
      });
  }

  /**
   * logout — Sign out dari Firebase & clear token lokal.
   */
  function logout() {
    // Sign out dari Firebase (fire-and-forget)
    if (_firebaseReady && _firebaseAuth) {
      _firebaseAuth.signOut().catch(function () {});
    }
    removeToken();
    authState.isAuthenticated = false;
    authState.user = null;
    // Update UI immediately
    updateAuthUI();
  }

  /* ---------- Toast notifications ---------- */
  function ensureToastContainer() {
    var c = document.querySelector('.toast-container');
    if (!c) {
      c = document.createElement('div');
      c.className = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }
  function toast(message, type, duration) {
    type = type || 'info';
    duration = duration || 3500;
    var c = ensureToastContainer();
    var t = document.createElement('div');
    t.className = 'toast toast-' + type;
    var iconSvg = '';
    if (type === 'success') iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    else if (type === 'error') iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    else if (type === 'warning') iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    else iconSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    t.innerHTML = iconSvg + '<span>' + escapeHTML(message) + '</span>';
    c.appendChild(t);
    setTimeout(function () {
      t.classList.add('leaving');
      setTimeout(function () { t.remove(); }, 300);
    }, duration);
  }

  /* ---------- Helpers ---------- */
  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(iso, opts) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var m = months[d.getMonth()];
    if (opts && opts.long) {
      return m + ' ' + d.getDate() + ', ' + d.getFullYear();
    }
    return m + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function formatRelative(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var now = Date.now();
    var diff = now - d.getTime();
    var sec = Math.floor(diff / 1000);
    if (sec < 60) return 'just now';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + (min === 1 ? ' minute ago' : ' minutes ago');
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + (hr === 1 ? ' hour ago' : ' hours ago');
    var day = Math.floor(hr / 24);
    if (day < 7) return day + (day === 1 ? ' day ago' : ' days ago');
    var wk = Math.floor(day / 7);
    if (wk < 5) return wk + (wk === 1 ? ' week ago' : ' weeks ago');
    var mo = Math.floor(day / 30);
    if (mo < 12) return mo + (mo === 1 ? ' month ago' : ' months ago');
    var yr = Math.floor(day / 365);
    return yr + (yr === 1 ? ' year ago' : ' years ago');
  }

  function formatBytes(bytes) {
    if (!bytes || bytes < 1) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    if (i >= units.length) i = units.length - 1;
    return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  }

  function formatNumber(n) {
    if (n === null || n === undefined) return '0';
    if (n < 1000) return String(n);
    if (n < 1000000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }

  function getQueryParam(name) {
    var params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function truncate(str, max) {
    if (!str) return '';
    if (str.length <= max) return str;
    return str.slice(0, max).trim() + '\u2026';
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (e) { reject(e); }
    });
  }

  /* =========================================================================
     STATE-AWARE NAVBAR
     =========================================================================

     Tiga state yang didukung:

     1. BELUM LOGIN (guest):
        Menu: [Home, Projects, Snippets, Downloads]
        Tombol: [Login dengan Google]
        Hidden: [Support Ticket], [Admin Panel], [Foto Profil], [Logout]

     2. LOGIN SEBAGAI USER BIASA:
        Menu: [Home, Projects, Snippets, Downloads, Support Ticket]
        Hidden: [Admin Panel]
        Visible: [Foto Profil Google User] + [Logout]

     3. LOGIN SEBAGAI ADMIN:
        Menu: [Home, Projects, Snippets, Downloads, Support Ticket, Admin Panel]
        Visible: [Foto Profil Google User] + [Logout]

     ========================================================================= */

  /**
   * getNavLinks — Mengembalikan daftar link berdasarkan auth state.
   */
  function getNavLinks() {
    var base = [
      { href: '/', label: 'Home', key: 'home' },
      { href: '/scripts', label: 'Projects', key: 'scripts' },
      { href: '/snippets', label: 'Snippets', key: 'snippets' },
      { href: '/downloads', label: 'Downloads', key: 'downloads' }
    ];

    // Support Ticket hanya muncul jika sudah login
    if (authState.isAuthenticated) {
      base.push({ href: '/support', label: 'Support Ticket', key: 'support' });
    }

    // Admin Panel hanya muncul jika role === 'admin'
    if (authState.isAuthenticated && authState.user && authState.user.role === 'admin') {
      base.push({ href: '/admin', label: 'Admin Panel', key: 'admin' });
    }

    return base;
  }

  function getCurrentNavKey() {
    var p = window.location.pathname;
    if (p === '/' || p === '/index.html') return 'home';
    if (p.indexOf('/scripts') === 0) return 'scripts';
    if (p.indexOf('/snippets') === 0) return 'snippets';
    if (p.indexOf('/downloads') === 0) return 'downloads';
    if (p.indexOf('/updates') === 0) return 'updates';
    if (p.indexOf('/support') === 0) return 'support';
    if (p.indexOf('/admin') === 0) return 'admin';
    return '';
  }

  function buildNavbar() {
    // Init Firebase saat navbar dibangun
    initFirebase();

    var key = getCurrentNavKey();
    var links = getNavLinks();

    var linksHtml = links.map(function (l) {
      return '<a href="' + l.href + '" class="nav-link' + (l.key === key ? ' active' : '') + '">' + l.label + '</a>';
    }).join('');

    var userPhotoUrl = '';
    var userDisplayName = '';
    var userRole = '';
    if (authState.isAuthenticated && authState.user) {
      userPhotoUrl = authState.user.photoURL || '';
      userDisplayName = authState.user.displayName || 'User';
      userRole = authState.user.role || 'user';
    }

    // Profile avatar HTML (hanya ditampilkan jika sudah login)
    var profileHtml = '';
    if (authState.isAuthenticated) {
      var avatarInner = '';
      if (userPhotoUrl) {
        avatarInner = '<img src="' + escapeHTML(userPhotoUrl) + '" alt="' + escapeHTML(userDisplayName) + '" class="nav-avatar-img">';
      } else {
        avatarInner = '<span class="nav-avatar-initial">' + escapeHTML(userDisplayName.charAt(0).toUpperCase()) + '</span>';
      }
      profileHtml =
        '<div class="nav-profile" id="navProfile">' +
          avatarInner +
          '<span class="nav-profile-name">' + escapeHTML(userDisplayName) + '</span>' +
          (userRole === 'admin' ? '<span class="nav-role-badge">Admin</span>' : '') +
          '<div class="nav-profile-dropdown" id="navProfileDropdown">' +
            '<div class="nav-dropdown-item nav-dropdown-info">' +
              (userPhotoUrl ? '<img src="' + escapeHTML(userPhotoUrl) + '" alt="" class="nav-dropdown-avatar">' : '') +
              '<div><strong>' + escapeHTML(userDisplayName) + '</strong><small>' + escapeHTML(authState.user.email || '') + '</small></div>' +
            '</div>' +
            '<button class="nav-dropdown-item" id="btnLogout">' +
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
              'Sign Out' +
            '</button>' +
          '</div>' +
        '</div>';
    }

    // Login button (hanya ditampilkan jika BELUM login)
    var loginBtnHtml = '';
    if (!authState.isAuthenticated) {
      loginBtnHtml = '<button class="btn-login btn-google-login" id="btnGoogleLogin">' +
        '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>' +
        'Login dengan Google' +
      '</button>';
    }

    var html =
      '<nav class="navbar">' +
        '<div class="nav-inner">' +
          '<div class="nav-left">' +
            '<a href="/" class="nav-brand" aria-label="Karina-MD Home">' +
              '<span class="brand-mark">K</span>' +
              '<span class="brand-name">Karina<span>-MD</span></span>' +
            '</a>' +
          '</div>' +
          '<div class="nav-center">' + linksHtml + '</div>' +
          '<div class="nav-right">' +
            '<button class="nav-mobile-toggle" aria-label="Open menu">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
                '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>' +
              '</svg>' +
            '</button>' +
            loginBtnHtml +
            profileHtml +
          '</div>' +
        '</div>' +
      '</nav>' +
      '<div class="drawer-backdrop" id="drawerBackdrop"></div>' +
      '<aside class="mobile-nav-drawer" id="mobileDrawer">' +
        links.map(function (l) {
          return '<a href="' + l.href + '"' + (l.key === key ? ' class="active"' : '') + '>' + l.label + '</a>';
        }).join('') +
        (authState.isAuthenticated
          ? '<button class="mobile-logout-btn" id="mobileLogoutBtn">Sign Out</button>'
          : '<button class="mobile-login-btn" id="mobileGoogleLogin">Login dengan Google</button>'
        ) +
      '</aside>';

    var mount = document.getElementById('navbarMount');
    if (!mount) {
      var div = document.createElement('div');
      div.innerHTML = html;
      document.body.insertBefore(div.firstChild, document.body.firstChild);
    } else {
      mount.innerHTML = html;
    }

    bindNavEvents();
  }

  function bindNavEvents() {
    var btnGoogleLogin = document.getElementById('btnGoogleLogin');
    var btnLogout = document.getElementById('btnLogout');
    var navProfile = document.getElementById('navProfile');
    var toggle = document.querySelector('.nav-mobile-toggle');
    var drawer = document.getElementById('mobileDrawer');
    var backdrop = document.getElementById('drawerBackdrop');
    var mobileGoogleLogin = document.getElementById('mobileGoogleLogin');
    var mobileLogoutBtn = document.getElementById('mobileLogoutBtn');

    // Google Login button (desktop)
    if (btnGoogleLogin) {
      btnGoogleLogin.addEventListener('click', function () {
        btnGoogleLogin.disabled = true;
        btnGoogleLogin.innerHTML = '<span class="btn-spinner"></span> Signing in...';
        googleSignIn().then(function (json) {
          if (json.success) {
            toast('Welcome, ' + json.data.user.displayName + '!', 'success');
            // Rebuild navbar dengan state baru
            updateAuthUI();
          } else {
            toast(json.message || 'Login failed.', 'error');
            btnGoogleLogin.disabled = false;
            btnGoogleLogin.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> Login dengan Google';
          }
        }).catch(function (err) {
          toast(err.message || 'Sign-in failed. Please try again.', 'error');
          btnGoogleLogin.disabled = false;
          btnGoogleLogin.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> Login dengan Google';
        });
      });
    }

    // Logout button (desktop dropdown)
    if (btnLogout) {
      btnLogout.addEventListener('click', function () {
        logout();
        toast('You have been signed out.', 'info');
      });
    }

    // Profile dropdown toggle (click to open/close)
    if (navProfile) {
      navProfile.addEventListener('click', function (e) {
        // Jangan tutup dropdown jika klik item di dalamnya
        if (e.target.closest('#btnLogout')) return;
        var dd = document.getElementById('navProfileDropdown');
        if (dd) dd.classList.toggle('open');
      });
      // Tutup dropdown jika klik di luar
      document.addEventListener('click', function (e) {
        if (!navProfile.contains(e.target)) {
          var dd = document.getElementById('navProfileDropdown');
          if (dd) dd.classList.remove('open');
        }
      });
    }

    // Mobile drawer
    if (toggle && drawer && backdrop) {
      toggle.addEventListener('click', function () {
        drawer.classList.add('open');
        backdrop.classList.add('visible');
      });
      backdrop.addEventListener('click', function () {
        drawer.classList.remove('open');
        backdrop.classList.remove('visible');
      });
    }

    // Mobile Google Login
    if (mobileGoogleLogin) {
      mobileGoogleLogin.addEventListener('click', function () {
        mobileGoogleLogin.disabled = true;
        mobileGoogleLogin.textContent = 'Signing in...';
        googleSignIn().then(function (json) {
          if (json.success) {
            toast('Welcome, ' + json.data.user.displayName + '!', 'success');
            drawer.classList.remove('open');
            backdrop.classList.remove('visible');
            updateAuthUI();
          } else {
            toast(json.message || 'Login failed.', 'error');
            mobileGoogleLogin.disabled = false;
            mobileGoogleLogin.textContent = 'Login dengan Google';
          }
        }).catch(function () {
          toast('Sign-in failed.', 'error');
          mobileGoogleLogin.disabled = false;
          mobileGoogleLogin.textContent = 'Login dengan Google';
        });
      });
    }

    // Mobile Logout
    if (mobileLogoutBtn) {
      mobileLogoutBtn.addEventListener('click', function () {
        logout();
        drawer.classList.remove('open');
        backdrop.classList.remove('visible');
        toast('You have been signed out.', 'info');
      });
    }
  }

  /**
   * updateAuthUI — Rebuild navbar berdasarkan auth state terkini.
   * Dipanggil setelah login/logout/refresh.
   */
  function updateAuthUI() {
    // Rebuild seluruh navbar agar state-aware
    buildNavbar();
  }

  /**
   * Firebase onAuthStateChanged listener.
   * Menyinkronkan state Firebase dengan state lokal kita.
   * Jika Firebase mengatakan user signed out (misal token revoke dari lain),
   * clear token lokal dan update UI.
   */
  function setupFirebaseAuthListener() {
    if (!initFirebase()) return;

    _firebaseAuth.onAuthStateChanged(function (firebaseUser) {
      if (!firebaseUser) {
        // Firebase mengatakan user sudah sign out
        if (authState.isAuthenticated) {
          // Clear state lokal
          removeToken();
          authState.isAuthenticated = false;
          authState.user = null;
          updateAuthUI();
          console.log('[Karina] Firebase onAuthStateChanged: signed out.');
        }
      } else {
        // Firebase user masih signed in — jika kita belum punya token internal,
        // coba refresh dari backend
        if (!authState.isAuthenticated) {
          // User signed in via Firebase tapi belum punya JWT internal
          // (misalnya refresh halaman). Dapatkan idToken dan kirim ke backend.
          firebaseUser.getIdToken().then(function (idToken) {
            return api('/auth/google', {
              method: 'POST',
              body: JSON.stringify({ idToken: idToken })
            });
          }).then(function (json) {
            if (json.success) {
              setToken(json.data.token, json.data.user);
              authState.isAuthenticated = true;
              authState.user = json.data.user;
              updateAuthUI();
            }
          }).catch(function () {
            /* silent — user bisa jadi guest */
          });
        }
      }
    });
  }

  /* ---------- Footer injection ---------- */
  function buildFooter() {
    var html =
      '<footer class="footer-section site-footer">' +
        '<div class="container">' +
          '<div class="footer-top">' +
            '<div class="footer-brand">' +
              '<div class="footer-logo">Karina-MD</div>' +
              '<p class="footer-tagline">Global Open-Source Platform & Project Hub. Scripts, snippets, and community contributions in one place.</p>' +
            '</div>' +
            '<div class="footer-links">' +
              '<div class="footer-col"><h5>Explore</h5>' +
                '<a href="/scripts">Projects</a>' +
                '<a href="/snippets">Snippets</a>' +
                '<a href="/downloads">Downloads</a>' +
                '<a href="/updates">Updates</a>' +
              '</div>' +
              '<div class="footer-col"><h5>Community</h5>' +
                '<a href="/support">Support Ticket</a>' +
                '<a href="https://whatsapp.com/channel/0029Vb816qs6LwHheK1KT044" target="_blank" rel="noopener">WhatsApp Channel</a>' +
                '<a href="https://wa.me/6283815201912" target="_blank" rel="noopener">Contact</a>' +
              '</div>' +
              '<div class="footer-col"><h5>Platform</h5>' +
                '<a href="/admin">Admin Panel</a>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="footer-bottom">' +
            '<div class="dev-credit">Developed by <span>kyyinfinite</span></div>' +
            '<div class="footer-copy">&copy; ' + new Date().getFullYear() + ' Karina-MD Platform. All rights reserved.</div>' +
          '</div>' +
        '</div>' +
      '</footer>';

    var mount = document.getElementById('footerMount');
    if (mount) {
      mount.innerHTML = html;
    } else {
      var div = document.createElement('div');
      div.innerHTML = html;
      document.body.appendChild(div.firstChild);
    }
  }

  /* ---------- Public API ---------- */
  window.Karina = {
    api: api,
    auth: {
      state: authState,
      refresh: refreshAuthState,
      googleSignIn: googleSignIn,
      logout: logout,
      isAdmin: function () { return authState.isAuthenticated && authState.user && authState.user.role === 'admin'; },
      isLoggedIn: function () { return authState.isAuthenticated; },
      getCachedUser: getCachedUser
    },
    ui: {
      toast: toast,
      buildNavbar: buildNavbar,
      buildFooter: buildFooter,
      updateAuthUI: updateAuthUI
    },
    util: {
      escapeHTML: escapeHTML,
      formatDate: formatDate,
      formatRelative: formatRelative,
      formatBytes: formatBytes,
      formatNumber: formatNumber,
      getQueryParam: getQueryParam,
      truncate: truncate,
      copyToClipboard: copyToClipboard
    }
  };

  /* ---------- Bootstrap on every page ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    buildNavbar();
    buildFooter();

    // Setup Firebase auth listener untuk sinkronisasi state
    setupFirebaseAuthListener();

    // Check auth state jika token internal tersedia
    if (getToken()) {
      refreshAuthState().then(function () {
        updateAuthUI();
      });
    } else {
      updateAuthUI();
    }
  });
})(window);