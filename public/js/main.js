(function () {
  'use strict';

  /* ================================================================
     CONSTANTS
     ================================================================ */
  var API_BASE = '/api';

  /* ================================================================
     UTILITY HELPERS
     ================================================================ */
  function $(selector) { return document.querySelector(selector); }
  function $$(selector) { return document.querySelectorAll(selector); }

  function getToken() {
    try { return localStorage.getItem('karina_token'); } catch (e) { return null; }
  }
  function setToken(token) {
    try { localStorage.setItem('karina_token', token); } catch (e) { /* noop */ }
  }
  function removeToken() {
    try { localStorage.removeItem('karina_token'); } catch (e) { /* noop */ }
  }

  function formatDate(iso) {
    var d = new Date(iso);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  /* ================================================================
     AUTH STATE
     ================================================================ */
  var isAuthenticated = false;
  var currentUser = null;

  function updateAuthUI() {
    var loginBtn = $('#btnLogin');
    var adminBtn = $('#btnAdmin');
    var badge = $('#navUserBadge');
    var usernameEl = $('#navUsername');
    var adminPanel = $('#adminPanel');

    if (isAuthenticated && currentUser) {
      loginBtn.style.display = 'none';
      adminBtn.style.display = 'inline-flex';
      badge.classList.add('visible');
      usernameEl.textContent = currentUser.username;
    } else {
      loginBtn.style.display = '';
      adminBtn.style.display = 'none';
      badge.classList.remove('visible');
      usernameEl.textContent = '';
      adminPanel.classList.remove('visible');
    }
  }

  async function checkAuth() {
    var token = getToken();
    if (!token) { updateAuthUI(); return; }

    try {
      var res = await fetch(API_BASE + '/auth/check', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token }
      });
      var json = await res.json();
      if (json.success && json.data) {
        isAuthenticated = true;
        currentUser = json.data;
      } else {
        removeToken();
      }
    } catch (e) {
      /* Network error - keep existing state silently */
    }
    updateAuthUI();
  }

  /* ================================================================
     LOGIN MODAL
     ================================================================ */
  function openLoginModal() {
    $('#loginModal').classList.add('active');
    $('#loginUsername').focus();
    $('#loginError').classList.remove('visible');
    $('#loginError').textContent = '';
  }

  function closeLoginModal() {
    $('#loginModal').classList.remove('active');
    $('#loginForm').reset();
  }

  async function handleLogin(e) {
    e.preventDefault();
    var username = $('#loginUsername').value.trim();
    var password = $('#loginPassword').value;
    var errorEl = $('#loginError');
    var submitBtn = $('#loginSubmitBtn');

    errorEl.classList.remove('visible');

    if (!username || !password) {
      errorEl.textContent = 'Please fill in all fields.';
      errorEl.classList.add('visible');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';

    try {
      var res = await fetch(API_BASE + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password })
      });
      var json = await res.json();

      if (json.success) {
        setToken(json.data.token);
        isAuthenticated = true;
        currentUser = { id: json.data.username, username: json.data.username };
        updateAuthUI();
        closeLoginModal();
        showAdminPanel();
      } else {
        errorEl.textContent = json.message || 'Login failed.';
        errorEl.classList.add('visible');
      }
    } catch (err) {
      errorEl.textContent = 'Network error. Please try again.';
      errorEl.classList.add('visible');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  }

  function handleLogout() {
    removeToken();
    isAuthenticated = false;
    currentUser = null;
    updateAuthUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function bindAuthEvents() {
    $('#btnLogin').addEventListener('click', function (e) { e.preventDefault(); openLoginModal(); });
    $('#modalCloseBtn').addEventListener('click', closeLoginModal);
    $('#loginForm').addEventListener('submit', handleLogin);
    $('#btnLogout').addEventListener('click', handleLogout);
    $('#btnAdmin').addEventListener('click', function (e) { e.preventDefault(); showAdminPanel(); });

    $('#loginModal').addEventListener('click', function (e) {
      if (e.target === this) closeLoginModal();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('#loginModal').classList.contains('active')) {
        closeLoginModal();
      }
    });
  }

  /* ================================================================
     ADMIN PANEL
     ================================================================ */
  function showAdminPanel() {
    var panel = $('#adminPanel');
    panel.classList.add('visible');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    loadAdminUpdates();
  }

  async function loadAdminUpdates() {
    var container = $('#adminUpdatesList');
    container.innerHTML = '<div class="admin-empty-state">Loading updates...</div>';

    try {
      var res = await fetch(API_BASE + '/updates/latest?limit=20');
      var json = await res.json();

      if (json.success && json.data && json.data.length > 0) {
        container.innerHTML = json.data.map(function (u) {
          return '<div class="admin-update-item">' +
            '<div class="update-meta">' +
              '<span class="update-version">' + escapeHTML(u.version) + '</span>' +
              '<span class="update-date">' + formatDate(u.createdAt) + '</span>' +
            '</div>' +
            '<div class="update-title">' + escapeHTML(u.title) + '</div>' +
            '<div class="update-desc">' + escapeHTML(u.description) + '</div>' +
          '</div>';
        }).join('');
      } else {
        container.innerHTML = '<div class="admin-empty-state">No updates published yet. Create your first update above.</div>';
      }
    } catch (e) {
      container.innerHTML = '<div class="admin-empty-state">Failed to load updates.</div>';
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    var title = $('#updateTitle').value.trim();
    var version = $('#updateVersion').value.trim();
    var description = $('#updateDesc').value.trim();
    var changelogLink = $('#updateLink').value.trim();
    var statusEl = $('#uploadStatus');
    var submitBtn = $('#uploadSubmitBtn');
    var token = getToken();

    statusEl.className = 'upload-status';
    statusEl.textContent = '';

    if (!title || !version || !description) {
      statusEl.className = 'upload-status error';
      statusEl.textContent = 'Title, version, and description are required.';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Publishing...';

    try {
      var res = await fetch(API_BASE + '/updates/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ title: title, version: version, description: description, changelogLink: changelogLink })
      });
      var json = await res.json();

      if (json.success) {
        statusEl.className = 'upload-status success';
        statusEl.textContent = 'Update published successfully!';
        $('#uploadForm').reset();
        loadAdminUpdates();
        fetchLatestUpdates(); // refresh public grid too
      } else {
        statusEl.className = 'upload-status error';
        statusEl.textContent = json.message || 'Failed to publish update.';
      }
    } catch (err) {
      statusEl.className = 'upload-status error';
      statusEl.textContent = 'Network error. Please try again.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Publish Update';
    }
  }

  function bindAdminEvents() {
    $('#uploadForm').addEventListener('submit', handleUpload);
  }

  /* ================================================================
     DYNAMIC UPDATES (PUBLIC GRID)
     ================================================================ */
  async function fetchLatestUpdates() {
    var featureList = $('#featureList');
    if (!featureList) return;

    try {
      var res = await fetch(API_BASE + '/updates/latest?limit=10');
      var json = await res.json();

      if (json.success && json.data && json.data.length > 0) {
        featureList.innerHTML = json.data.map(function (u, i) {
          var num = String(i + 1).padStart(2, '0');
          return '<div class="feature-card tilt-card">' +
            '<div class="feature-badge">' + num + '</div>' +
            '<div class="feature-text">' +
              '<h4>' + escapeHTML(u.title) + '</h4>' +
              '<p>' + escapeHTML(u.description) + '</p>' +
            '</div>' +
          '</div>';
        }).join('');

        // Re-bind tilt effects on newly injected cards
        if (typeof gsap !== 'undefined') {
          bindTiltCards();
        }
      }
      // If no data, keep the static fallback HTML already in place
    } catch (e) {
      /* Silently fail - static fallback remains visible */
    }
  }

  function escapeHTML(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ================================================================
     GSAP ANIMATIONS
     ================================================================ */
  function waitForGSAP(callback) {
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      callback();
    } else {
      setTimeout(function () { waitForGSAP(callback); }, 50);
    }
  }

  function bindTiltCards() {
    var tiltCards = $$('.tilt-card');
    tiltCards.forEach(function (card) {
      // Skip if already bound
      if (card._tiltBound) return;
      card._tiltBound = true;

      card.addEventListener('mousemove', function (e) {
        var rect = card.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        var centerX = rect.width / 2;
        var centerY = rect.height / 2;
        var rotateX = ((y - centerY) / centerY) * -6;
        var rotateY = ((x - centerX) / centerX) * 6;
        card.style.transform = 'perspective(800px) rotateX(' + rotateX + 'deg) rotateY(' + rotateY + 'deg) scale3d(1.02, 1.02, 1.02)';
      });

      card.addEventListener('mouseleave', function () {
        card.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
      });
    });
  }

  function initAnimations() {
    gsap.registerPlugin(ScrollTrigger);

    /* Reveal animations */
    gsap.utils.toArray('.reveal-up').forEach(function (el, i) {
      gsap.to(el, {
        opacity: 1, y: 0,
        duration: 0.8,
        delay: i * 0.08,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' }
      });
    });

    gsap.utils.toArray('.reveal-left').forEach(function (el) {
      gsap.to(el, {
        opacity: 1, x: 0, duration: 0.8, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%' }
      });
    });

    gsap.utils.toArray('.reveal-right').forEach(function (el) {
      gsap.to(el, {
        opacity: 1, x: 0, duration: 0.8, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%' }
      });
    });

    gsap.utils.toArray('.reveal-scale').forEach(function (el) {
      gsap.to(el, {
        opacity: 1, scale: 1, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%' }
      });
    });

    /* Hero content stagger */
    var heroItems = $$('.hero-content .reveal-up');
    if (heroItems.length) {
      gsap.to(heroItems, {
        opacity: 1, y: 0,
        duration: 0.7, stagger: 0.12,
        ease: 'power3.out', delay: 0.2
      });
    }

    /* Hero scroll parallax */
    var heroContainer = $('.hero-container');
    if (heroContainer) {
      ScrollTrigger.create({
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 1,
        onUpdate: function (self) {
          var p = self.progress;
          gsap.set('.hero-image-wrapper', { y: p * -40 });
          gsap.set('.hero-content', { y: p * -15 });
        }
      });
    }

    /* Mouse parallax for floating shapes */
    var floatingShapes = $$('.float-shape');
    if (floatingShapes.length) {
      document.addEventListener('mousemove', function (e) {
        var cx = (e.clientX / window.innerWidth - 0.5) * 2;
        var cy = (e.clientY / window.innerHeight - 0.5) * 2;
        floatingShapes.forEach(function (shape) {
          var speed = parseFloat(shape.getAttribute('data-speed')) || 2;
          gsap.to(shape, {
            x: cx * speed * 12, y: cy * speed * 10,
            duration: 0.6, ease: 'power2.out'
          });
        });
      });
    }

    /* Floating shape ambient animation */
    floatingShapes.forEach(function (shape, i) {
      gsap.to(shape, {
        y: '+=12', rotation: i % 2 === 0 ? 8 : -8,
        duration: 2.5 + i * 0.4, repeat: -1, yoyo: true,
        ease: 'sine.inOut', delay: i * 0.3
      });
    });

    /* 3D tilt effect */
    bindTiltCards();

    /* Particle system */
    var particlesContainer = $('#heroParticles');
    if (particlesContainer) {
      for (var i = 0; i < 25; i++) {
        var p = document.createElement('div');
        p.classList.add('particle');
        var size = Math.random() * 6 + 3;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.left = Math.random() * 100 + '%';
        p.style.top = Math.random() * 100 + '%';
        p.style.opacity = (Math.random() * 0.4 + 0.1).toString();
        particlesContainer.appendChild(p);

        gsap.to(p, {
          y: (Math.random() - 0.5) * 80, x: (Math.random() - 0.5) * 40,
          duration: 3 + Math.random() * 4, repeat: -1, yoyo: true,
          ease: 'sine.inOut', delay: Math.random() * 3
        });
        gsap.to(p, {
          opacity: Math.random() * 0.3 + 0.05,
          duration: 2 + Math.random() * 3, repeat: -1, yoyo: true,
          ease: 'sine.inOut', delay: Math.random() * 2
        });
      }
    }

    /* Slider dot interaction */
    var dots = $$('.slider-dot');
    dots.forEach(function (dot) {
      dot.addEventListener('click', function () {
        dots.forEach(function (d) { d.classList.remove('active'); });
        dot.classList.add('active');
      });
    });

    /* Widget close buttons */
    $$('.widget-close').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var card = btn.closest('.widget-card');
        gsap.to(card, {
          opacity: 0, scale: 0.8, duration: 0.3, ease: 'power2.in',
          onComplete: function () { card.style.display = 'none'; }
        });
      });
    });

    /* Navbar scroll shadow */
    var navbar = $('.navbar');
    window.addEventListener('scroll', function () {
      navbar.style.boxShadow = window.scrollY > 20
        ? '0 2px 20px rgba(44, 62, 80, 0.06)'
        : 'none';
    });

    /* Artwork card hover glow */
    $$('.artwork-card').forEach(function (card) {
      card.addEventListener('mouseenter', function () {
        gsap.to(card, { boxShadow: '0 8px 32px rgba(80, 200, 194, 0.15)', duration: 0.3 });
      });
      card.addEventListener('mouseleave', function () {
        gsap.to(card, { boxShadow: 'none', duration: 0.3 });
      });
    });

    /* CTA button hover */
    $$('.cta-btn').forEach(function (btn) {
      btn.addEventListener('mouseenter', function () {
        gsap.fromTo(btn, { scale: 0.97 }, { scale: 1, duration: 0.4, ease: 'elastic.out(1, 0.5)' });
      });
    });

    /* Search item hover */
    $$('.search-item').forEach(function (item) {
      item.addEventListener('mouseenter', function () {
        gsap.to(item, { x: 4, duration: 0.25, ease: 'power2.out' });
        var svg = item.querySelector('svg');
        if (svg) gsap.to(svg, { rotation: 15, duration: 0.3, ease: 'power2.out' });
      });
      item.addEventListener('mouseleave', function () {
        gsap.to(item, { x: 0, duration: 0.25, ease: 'power2.out' });
        var svg = item.querySelector('svg');
        if (svg) gsap.to(svg, { rotation: 0, duration: 0.3, ease: 'power2.out' });
      });
    });

    /* Grid cards stagger */
    $$('.grid-container > .card').forEach(function (card, idx) {
      gsap.to(card, {
        opacity: 1, y: 0,
        duration: 0.7, delay: idx * 0.15, ease: 'power3.out',
        scrollTrigger: { trigger: card, start: 'top 90%', toggleActions: 'play none none none' }
      });
    });

    /* Dev credit glow pulse */
    var devCredit = $('.dev-credit');
    if (devCredit) {
      gsap.to(devCredit, {
        textShadow: '0 0 20px rgba(80, 200, 194, 0.3)',
        duration: 2, repeat: -1, yoyo: true, ease: 'sine.inOut'
      });
    }

    ScrollTrigger.refresh();
  }

  /* ================================================================
     BOOTSTRAP
     ================================================================ */
  function init() {
    bindAuthEvents();
    bindAdminEvents();
    checkAuth();
    fetchLatestUpdates();
    waitForGSAP(initAnimations);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();