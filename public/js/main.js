/* ============================================================
   Karina-MD Platform — Home page main script
   Loads: stats, featured scripts, latest updates, featured snippets
   Keeps GSAP animations from the original design.
   ============================================================ */
(function () {
  'use strict';

  var K = window.Karina;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  function escapeHTML(s) { return K.util.escapeHTML(s); }
  function formatNumber(n) { return K.util.formatNumber(n); }
  function formatDate(iso) { return K.util.formatDate(iso); }
  function formatRelative(iso) { return K.util.formatRelative(iso); }
  function formatBytes(b) { return K.util.formatBytes(b); }
  function truncate(s, n) { return K.util.truncate(s, n); }

  /* ================================================================
     STATS BAR
     ================================================================ */
  function loadStats() {
    K.api('/admin/stats').then(function () {
      // Public users can't access admin stats — use a softer approach
    }).catch(function () { /* expected — fall through */ });

    // Use aggregate counts via public endpoints
    Promise.all([
      fetch('/api/scripts/featured?limit=1').then(function (r) { return r.json(); }).catch(function () { return { success: false }; }),
      fetch('/api/snippets/featured?limit=1').then(function (r) { return r.json(); }).catch(function () { return { success: false }; })
    ]).then(function () {
      // The home stats use approximations from listing endpoints
      return Promise.all([
        fetch('/api/scripts/list?perPage=1').then(function (r) { return r.json(); }).catch(function () { return null; }),
        fetch('/api/snippets/list?perPage=1').then(function (r) { return r.json(); }).catch(function () { return null; }),
        fetch('/api/updates/all?perPage=1').then(function (r) { return r.json(); }).catch(function () { return null; })
      ]);
    }).then(function (results) {
      var scripts = results[0];
      var snippets = results[1];
      var updates = results[2];

      if (scripts && scripts.success) setText('#statScripts', formatNumber(scripts.data.total));
      if (snippets && snippets.success) setText('#statSnippets', formatNumber(snippets.data.total));
      if (updates && updates.success) setText('#statUpdates', formatNumber(updates.data.total));

      // Fetch download count via featured scripts (which include downloadCount)
      return fetch('/api/scripts/list?perPage=50&sort=downloads').then(function (r) { return r.json(); });
    }).then(function (json) {
      if (json && json.success) {
        var totalDl = 0;
        json.data.items.forEach(function (s) { totalDl += (s.downloadCount || 0); });
        setText('#statDownloads', formatNumber(totalDl));
      }
    }).catch(function () { /* noop */ });
  }

  function setText(sel, val) {
    var el = document.querySelector(sel);
    if (el) el.textContent = val;
  }

  /* ================================================================
     FEATURED SCRIPTS
     ================================================================ */
  function loadFeaturedScripts() {
    var grid = $('#featuredScriptsGrid');
    if (!grid) return;

    K.api('/scripts/featured?limit=6').then(function (json) {
      if (!json.success || !json.data || json.data.length === 0) {
        grid.innerHTML = emptyStateHTML('No featured scripts yet', 'Check back soon — new scripts are being added regularly.');
        return;
      }

      grid.innerHTML = json.data.map(function (s) {
        return scriptCardHTML(s);
      }).join('');

      if (typeof gsap !== 'undefined') {
        gsap.from('#featuredScriptsGrid .script-card', {
          opacity: 0, y: 30, duration: 0.6, stagger: 0.08, ease: 'power3.out',
          scrollTrigger: { trigger: '#featuredScriptsGrid', start: 'top 85%' }
        });
      }
    }).catch(function () {
      grid.innerHTML = emptyStateHTML('Failed to load scripts', 'Please refresh the page to try again.');
    });
  }

  function scriptCardHTML(s) {
    var tags = (s.tags || []).slice(0, 3).map(function (t) {
      return '<span class="card-tag">' + escapeHTML(t) + '</span>';
    }).join('');
    return '<article class="script-card fade-in">' +
      '<a class="card-link-overlay" href="/scripts/' + (s.slug || s._id) + '" aria-label="' + escapeHTML(s.title) + '"></a>' +
      '<div class="card-top">' +
        '<span class="card-category">' + escapeHTML(s.category) + '</span>' +
        (s.isFeatured ? '<span class="badge badge-featured">Featured</span>' : '') +
        '<span class="card-version">' + escapeHTML(s.version) + '</span>' +
      '</div>' +
      '<h3>' + escapeHTML(s.title) + '</h3>' +
      '<p class="card-desc">' + escapeHTML(truncate(s.description, 160)) + '</p>' +
      (tags ? '<div class="card-tags">' + tags + '</div>' : '') +
      '<div class="card-meta">' +
        '<div class="card-meta-group">' +
          '<span class="card-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' + formatNumber(s.downloadCount || 0) + '</span>' +
          '<span class="card-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' + formatNumber(s.viewCount || 0) + '</span>' +
        '</div>' +
        '<span class="card-meta-item">' + formatRelative(s.createdAt) + '</span>' +
      '</div>' +
    '</article>';
  }

  /* ================================================================
     LATEST UPDATES
     ================================================================ */
  function loadLatestUpdates() {
    var grid = $('#latestUpdatesGrid');
    if (!grid) return;

    K.api('/updates/latest?limit=6').then(function (json) {
      if (!json.success || !json.data || json.data.length === 0) {
        grid.innerHTML = emptyStateHTML('No updates yet', 'Updates will appear here once published.');
        return;
      }

      grid.innerHTML = json.data.map(function (u) {
        return updateCardHTML(u);
      }).join('');

      if (typeof gsap !== 'undefined') {
        gsap.from('#latestUpdatesGrid .update-card', {
          opacity: 0, y: 30, duration: 0.6, stagger: 0.08, ease: 'power3.out',
          scrollTrigger: { trigger: '#latestUpdatesGrid', start: 'top 85%' }
        });
      }
    }).catch(function () {
      grid.innerHTML = emptyStateHTML('Failed to load updates', 'Please refresh the page to try again.');
    });
  }

  function updateCardHTML(u) {
    return '<article class="update-card fade-in">' +
      '<div class="card-top">' +
        '<span class="card-category">' + escapeHTML(u.category || 'feature') + '</span>' +
        (u.isPinned ? '<span class="badge badge-pinned">Pinned</span>' : '') +
        '<span class="card-version">' + escapeHTML(u.version) + '</span>' +
      '</div>' +
      '<h3>' + escapeHTML(u.title) + '</h3>' +
      '<p class="card-desc">' + escapeHTML(truncate(u.description, 180)) + '</p>' +
      '<div class="card-meta">' +
        '<span class="card-meta-item">' + formatDate(u.createdAt, { long: true }) + '</span>' +
        (u.changelogLink ? '<a href="' + escapeHTML(u.changelogLink) + '" target="_blank" rel="noopener" style="position:relative;z-index:2;color:var(--accent-teal-dark);font-weight:500;">View changelog →</a>' : '') +
      '</div>' +
    '</article>';
  }

  /* ================================================================
     FEATURED SNIPPETS
     ================================================================ */
  function loadFeaturedSnippets() {
    var grid = $('#featuredSnippetsGrid');
    if (!grid) return;

    K.api('/snippets/featured?limit=6').then(function (json) {
      if (!json.success || !json.data || json.data.length === 0) {
        grid.innerHTML = emptyStateHTML('No featured snippets yet', 'Reusable code snippets will appear here.');
        return;
      }

      grid.innerHTML = json.data.map(function (s) {
        return snippetCardHTML(s);
      }).join('');

      if (typeof gsap !== 'undefined') {
        gsap.from('#featuredSnippetsGrid .snippet-card', {
          opacity: 0, y: 30, duration: 0.6, stagger: 0.08, ease: 'power3.out',
          scrollTrigger: { trigger: '#featuredSnippetsGrid', start: 'top 85%' }
        });
      }
    }).catch(function () {
      grid.innerHTML = emptyStateHTML('Failed to load snippets', 'Please refresh the page to try again.');
    });
  }

  function snippetCardHTML(s) {
    var preview = (s.code || '').slice(0, 240);
    var tags = (s.tags || []).slice(0, 3).map(function (t) {
      return '<span class="card-tag">' + escapeHTML(t) + '</span>';
    }).join('');
    return '<article class="snippet-card fade-in">' +
      '<a class="card-link-overlay" href="/snippets/' + (s.slug || s._id) + '" aria-label="' + escapeHTML(s.title) + '"></a>' +
      '<div class="card-top">' +
        '<span class="card-category">' + escapeHTML(s.language) + '</span>' +
        (s.isFeatured ? '<span class="badge badge-featured">Featured</span>' : '') +
      '</div>' +
      '<h3>' + escapeHTML(s.title) + '</h3>' +
      '<p class="card-desc" style="margin-bottom: 0;">' + escapeHTML(truncate(s.description, 100)) + '</p>' +
      '<div class="code-preview" style="max-height: 120px;"><pre>' + escapeHTML(preview) + (s.code && s.code.length > 240 ? '\n…' : '') + '</pre></div>' +
      (tags ? '<div class="card-tags">' + tags + '</div>' : '') +
      '<div class="card-meta">' +
        '<div class="card-meta-group">' +
          '<span class="card-meta-item">by ' + escapeHTML(s.author || 'admin') + '</span>' +
        '</div>' +
        '<span class="card-meta-item">' + formatRelative(s.createdAt) + '</span>' +
      '</div>' +
    '</article>';
  }

  function emptyStateHTML(title, msg) {
    return '<div class="empty-state" style="grid-column: 1 / -1;">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
      '<h3>' + escapeHTML(title) + '</h3>' +
      '<p>' + escapeHTML(msg) + '</p>' +
    '</div>';
  }

  /* ================================================================
     GSAP ANIMATIONS (preserved from original design)
     ================================================================ */
  function waitForGSAP(callback) {
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      callback();
    } else {
      setTimeout(function () { waitForGSAP(callback); }, 50);
    }
  }

  function initAnimations() {
    gsap.registerPlugin(ScrollTrigger);

    gsap.utils.toArray('.reveal-up').forEach(function (el, i) {
      gsap.to(el, {
        opacity: 1, y: 0,
        duration: 0.8,
        delay: i * 0.08,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' }
      });
    });

    gsap.utils.toArray('.reveal-scale').forEach(function (el) {
      gsap.to(el, {
        opacity: 1, scale: 1, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%' }
      });
    });

    var heroItems = $$('.hero-content .reveal-up');
    if (heroItems.length) {
      gsap.to(heroItems, {
        opacity: 1, y: 0,
        duration: 0.7, stagger: 0.12,
        ease: 'power3.out', delay: 0.2
      });
    }

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

      floatingShapes.forEach(function (shape, i) {
        gsap.to(shape, {
          y: '+=12', rotation: i % 2 === 0 ? 8 : -8,
          duration: 2.5 + i * 0.4, repeat: -1, yoyo: true,
          ease: 'sine.inOut', delay: i * 0.3
        });
      });
    }

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

    var dots = $$('.slider-dot');
    dots.forEach(function (dot) {
      dot.addEventListener('click', function () {
        dots.forEach(function (d) { d.classList.remove('active'); });
        dot.classList.add('active');
      });
    });

    var navbar = $('.navbar');
    if (navbar) {
      window.addEventListener('scroll', function () {
        navbar.style.boxShadow = window.scrollY > 20
          ? '0 2px 20px rgba(44, 62, 80, 0.06)'
          : 'none';
      });
    }

    ScrollTrigger.refresh();
  }

  /* ================================================================
     BOOTSTRAP
     ================================================================ */
  function init() {
    loadStats();
    loadFeaturedScripts();
    loadLatestUpdates();
    loadFeaturedSnippets();
    waitForGSAP(initAnimations);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
