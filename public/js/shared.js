/* ============================================================
   Karina-MD Platform — Shared JS utilities
   Provides: API client, auth state, toast notifications,
   navbar injection, footer injection, date formatting,
   escape HTML, query string parsing.
   ============================================================ */
(function (window) {
  'use strict';

  var API_BASE = '/api';
  var TOKEN_KEY = 'karina_token';
  var USER_KEY = 'karina_user';

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

  function login(username, password) {
    return api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: username, password: password })
    }).then(function (json) {
      if (json.success) {
        setToken(json.data.token, { id: json.data.username, username: json.data.username });
        authState.isAuthenticated = true;
        authState.user = { id: json.data.username, username: json.data.username };
      }
      return json;
    });
  }

  function logout() {
    removeToken();
    authState.isAuthenticated = false;
    authState.user = null;
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
    return str.slice(0, max).trim() + '…';
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

  /* ---------- Navbar injection ---------- */
  var NAV_LINKS = [
    { href: '/', label: 'Home', key: 'home' },
    { href: '/scripts', label: 'Scripts', key: 'scripts' },
    { href: '/snippets', label: 'Snippets', key: 'snippets' },
    { href: '/downloads', label: 'Downloads', key: 'downloads' },
    { href: '/updates', label: 'Updates', key: 'updates' },
    { href: '/support', label: 'Support', key: 'support' }
  ];

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
    var key = getCurrentNavKey();
    var linksHtml = NAV_LINKS.map(function (l) {
      return '<a href="' + l.href + '" class="nav-link' + (l.key === key ? ' active' : '') + '">' + l.label + '</a>';
    }).join('');

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
            '<span class="nav-user-badge" id="navUserBadge">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' +
              '</svg>' +
              '<span id="navUsername"></span>' +
            '</span>' +
            '<a href="#" class="btn-login" id="btnLogin">Log in</a>' +
            '<a href="/admin" class="btn-signup" id="btnAdmin" style="display:none;">Admin Panel</a>' +
          '</div>' +
        '</div>' +
      '</nav>' +
      '<div class="drawer-backdrop" id="drawerBackdrop"></div>' +
      '<aside class="mobile-nav-drawer" id="mobileDrawer">' +
        NAV_LINKS.map(function (l) {
          return '<a href="' + l.href + '"' + (l.key === key ? ' class="active"' : '') + '>' + l.label + '</a>';
        }).join('') +
        '<a href="/admin" id="drawerAdminLink">Admin Panel</a>' +
      '</aside>';

    var mount = document.getElementById('navbarMount');
    if (!mount) {
      var div = document.createElement('div');
      div.innerHTML = html;
      document.body.insertBefore(div.firstChild, document.body.firstChild);
    } else {
      mount.innerHTML = html;
    }

    // Login modal
    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'loginModal';
    modal.innerHTML =
      '<div class="modal-box">' +
        '<button class="modal-close-btn" id="modalCloseBtn" aria-label="Close">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
        '<h2 class="modal-title">Welcome Back</h2>' +
        '<p class="modal-subtitle">Sign in to access the admin dashboard.</p>' +
        '<form id="loginForm" novalidate>' +
          '<div class="form-group">' +
            '<label class="form-label" for="loginUsername">Username <span class="required">*</span></label>' +
            '<input class="form-input" type="text" id="loginUsername" placeholder="Enter your username" autocomplete="username" required>' +
            '<div class="form-error-msg" id="loginError"></div>' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label" for="loginPassword">Password <span class="required">*</span></label>' +
            '<input class="form-input" type="password" id="loginPassword" placeholder="Enter your password" autocomplete="current-password" required>' +
          '</div>' +
          '<button type="submit" class="btn btn-primary btn-block" id="loginSubmitBtn">Sign In</button>' +
        '</form>' +
      '</div>';
    document.body.appendChild(modal);

    bindNavEvents();
  }

  function bindNavEvents() {
    var btnLogin = document.getElementById('btnLogin');
    var btnAdmin = document.getElementById('btnAdmin');
    var modal = document.getElementById('loginModal');
    var modalCloseBtn = document.getElementById('modalCloseBtn');
    var loginForm = document.getElementById('loginForm');
    var toggle = document.querySelector('.nav-mobile-toggle');
    var drawer = document.getElementById('mobileDrawer');
    var backdrop = document.getElementById('drawerBackdrop');

    if (btnLogin) btnLogin.addEventListener('click', function (e) { e.preventDefault(); openLoginModal(); });
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeLoginModal);
    if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) closeLoginModal(); });
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.classList.contains('active')) closeLoginModal();
    });

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
  }

  function openLoginModal() {
    var modal = document.getElementById('loginModal');
    if (!modal) return;
    modal.classList.add('active');
    var u = document.getElementById('loginUsername');
    if (u) u.focus();
    var err = document.getElementById('loginError');
    if (err) { err.classList.remove('visible'); err.textContent = ''; }
  }
  function closeLoginModal() {
    var modal = document.getElementById('loginModal');
    if (!modal) return;
    modal.classList.remove('active');
    var form = document.getElementById('loginForm');
    if (form) form.reset();
  }

  function handleLogin(e) {
    e.preventDefault();
    var u = document.getElementById('loginUsername').value.trim();
    var p = document.getElementById('loginPassword').value;
    var err = document.getElementById('loginError');
    var btn = document.getElementById('loginSubmitBtn');
    err.classList.remove('visible');

    if (!u || !p) {
      err.textContent = 'Please fill in all fields.';
      err.classList.add('visible');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Signing in...';

    login(u, p).then(function (json) {
      if (json.success) {
        closeLoginModal();
        updateAuthUI();
        toast('Welcome back, ' + json.data.username + '!', 'success');
        // Redirect to admin if currently on home or admin link clicked
        setTimeout(function () {
          if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
            window.location.href = '/admin';
          }
        }, 500);
      } else {
        err.textContent = json.message || 'Login failed.';
        err.classList.add('visible');
      }
    }).catch(function () {
      err.textContent = 'Network error. Please try again.';
      err.classList.add('visible');
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    });
  }

  function updateAuthUI() {
    var btnLogin = document.getElementById('btnLogin');
    var btnAdmin = document.getElementById('btnAdmin');
    var badge = document.getElementById('navUserBadge');
    var usernameEl = document.getElementById('navUsername');
    if (!btnLogin) return;

    if (authState.isAuthenticated && authState.user) {
      btnLogin.style.display = 'none';
      btnAdmin.style.display = 'inline-flex';
      if (badge) badge.classList.add('visible');
      if (usernameEl) usernameEl.textContent = authState.user.username;
    } else {
      btnLogin.style.display = '';
      btnAdmin.style.display = 'none';
      if (badge) badge.classList.remove('visible');
      if (usernameEl) usernameEl.textContent = '';
    }
  }

  /* ---------- Footer injection ---------- */
  function buildFooter() {
    var html =
      '<footer class="footer-section site-footer">' +
        '<div class="container">' +
          '<div class="footer-top">' +
            '<div class="footer-brand">' +
              '<div class="footer-logo">Karina-MD</div>' +
              '<p class="footer-tagline">Premium multi-device WhatsApp bot platform. Scripts, snippets, and updates in one place.</p>' +
            '</div>' +
            '<div class="footer-links">' +
              '<div class="footer-col"><h5>Explore</h5>' +
                '<a href="/scripts">Scripts</a>' +
                '<a href="/snippets">Snippets</a>' +
                '<a href="/downloads">Downloads</a>' +
                '<a href="/updates">Updates</a>' +
              '</div>' +
              '<div class="footer-col"><h5>Support</h5>' +
                '<a href="/support">Submit Ticket</a>' +
                '<a href="https://whatsapp.com/channel/0029Vb816qs6LwHheK1KT044" target="_blank" rel="noopener">WhatsApp Channel</a>' +
                '<a href="https://wa.me/6283815201912" target="_blank" rel="noopener">Contact</a>' +
              '</div>' +
              '<div class="footer-col"><h5>Admin</h5>' +
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
      login: login,
      logout: logout,
      isAdmin: function () { return authState.isAuthenticated && authState.user; },
      getCachedUser: getCachedUser
    },
    ui: {
      toast: toast,
      buildNavbar: buildNavbar,
      buildFooter: buildFooter,
      updateAuthUI: updateAuthUI,
      openLoginModal: openLoginModal
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
    // Check auth state if token exists
    if (getToken()) {
      refreshAuthState().then(function () {
        updateAuthUI();
      });
    } else {
      updateAuthUI();
    }
  });
})(window);
