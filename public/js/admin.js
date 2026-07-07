/* ============================================================
   Karina-MD Platform — Admin dashboard logic
   Handles: stats, CRUD for updates/scripts/snippets, tickets
   ============================================================ */
(function () {
  'use strict';
  var K = window.Karina;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var eHTML = K.util.escapeHTML;
  var fNum = K.util.formatNumber;
  var fDate = K.util.formatDate;
  var fRel = K.util.formatRelative;
  var fBytes = K.util.formatBytes;

  function init() {
    // Check auth
    K.auth.refresh().then(function () {
      if (K.auth.isAdmin()) {
        showDashboard();
      } else {
        showLoginGate();
      }
    }).catch(function () { showLoginGate(); });

    // Bind tab navigation
    $$('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
        $$('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('active');
        $('#tab-' + btn.getAttribute('data-tab')).classList.add('active');
      });
    });

    $('#logoutBtn').addEventListener('click', function () {
      K.auth.logout();
      K.ui.updateAuthUI();
      showLoginGate();
      K.ui.toast('Logged out successfully.', 'success');
    });

    $('#gateLoginBtn').addEventListener('click', function () {
      K.ui.openLoginModal();
    });
  }

  function showLoginGate() {
    $('#loginGate').style.display = '';
    $('#dashboard').style.display = 'none';
  }

  function showDashboard() {
    $('#loginGate').style.display = 'none';
    $('#dashboard').style.display = '';
    var user = K.auth.state.user;
    if (user) $('#adminUsername').textContent = 'Logged in as ' + user.username;
    loadStats();
    loadUpdates();
    loadScripts();
    loadSnippets();
    loadTickets();
    bindForms();
  }

  /* ============ STATS ============ */
  function loadStats() {
    K.api('/admin/stats').then(function (json) {
      if (!json.success) return;
      var s = json.data;
      var html = '';
      var cards = [
        { label: 'Updates', value: s.counts.updates, icon: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>' },
        { label: 'Scripts', value: s.counts.scripts, icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
        { label: 'Snippets', value: s.counts.snippets, icon: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>' },
        { label: 'Open Tickets', value: s.counts.openTickets + '/' + s.counts.tickets, icon: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>' },
        { label: 'Total Downloads', value: fNum(s.metrics.totalDownloads), icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>' },
        { label: 'Script Views', value: fNum(s.metrics.totalScriptViews), icon: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>' },
        { label: 'Snippet Views', value: fNum(s.metrics.totalSnippetViews), icon: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>' }
      ];
      html = cards.map(function (c) {
        return '<div class="stat-card"><div class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + c.icon + '</svg></div><div class="stat-value">' + c.value + '</div><div class="stat-label">' + c.label + '</div></div>';
      }).join('');
      $('#statsGrid').innerHTML = html;

      // Update tab counts
      setText('#cntUpdates', s.counts.updates);
      setText('#cntScripts', s.counts.scripts);
      setText('#cntSnippets', s.counts.snippets);
      setText('#cntTickets', s.counts.openTickets);
    }).catch(function (err) {
      K.ui.toast('Failed to load stats.', 'error');
    });
  }

  function setText(sel, val) { var el = $(sel); if (el) el.textContent = val; }

  /* ============ UPDATES ============ */
  function loadUpdates() {
    K.api('/admin/all-updates?perPage=50').then(function (json) {
      if (!json.success) return;
      var html = json.data.items.map(function (u) {
        return '<tr>' +
          '<td><strong>' + eHTML(u.title) + '</strong></td>' +
          '<td><code style="font-size:11px;">' + eHTML(u.version) + '</code></td>' +
          '<td><span class="card-category">' + eHTML(u.category || 'feature') + '</span></td>' +
          '<td>' + (u.isPinned ? '📌' : '—') + '</td>' +
          '<td>' + (u.isPublished ? '<span style="color:#10b981;">✓</span>' : '<span style="color:#ef4444;">✗</span>') + '</td>' +
          '<td style="font-size:12px; color: var(--text-muted);">' + fRel(u.createdAt) + '</td>' +
          '<td class="row-actions">' +
            '<a href="/updates' + (u.isPinned ? '' : '') + '" class="btn btn-sm btn-secondary" onclick="event.preventDefault();window.KarinaAdmin.editUpdate(\'' + u._id + '\')">Edit</a>' +
            '<button class="btn btn-sm btn-danger" onclick="window.KarinaAdmin.deleteUpdate(\'' + u._id + '\')">Delete</button>' +
          '</td>' +
        '</tr>';
      }).join('');
      $('#updatesBody').innerHTML = html || '<tr><td colspan="7" style="text-align:center; color: var(--text-muted); padding: 32px;">No updates yet.</td></tr>';
    }).catch(function () {});
  }

  function bindForms() {
    // Update form
    $('#updateForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {
        title: $('#upd_title').value.trim(),
        version: $('#upd_version').value.trim(),
        description: $('#upd_desc').value.trim(),
        category: $('#upd_category').value,
        changelogLink: $('#upd_link').value.trim(),
        tags: $('#upd_tags').value,
        isPinned: $('#upd_pinned').checked,
        isPublished: $('#upd_published').checked
      };
      if (!data.title || !data.version || !data.description) {
        K.ui.toast('Title, version and description are required.', 'error');
        return;
      }
      var btn = $('#updSubmitBtn');
      btn.disabled = true; btn.textContent = 'Publishing...';
      K.api('/updates/upload', { method: 'POST', body: JSON.stringify(data) }).then(function (json) {
        if (json.success) {
          K.ui.toast('Update published!', 'success');
          $('#updateForm').reset();
          $('#upd_published').checked = true;
          loadUpdates(); loadStats();
        } else {
          K.ui.toast(json.message || 'Failed.', 'error');
        }
      }).catch(function (err) { K.ui.toast(err.message || 'Failed.', 'error'); })
        .finally(function () { btn.disabled = false; btn.textContent = 'Publish Update'; });
    });

    // Script form
    $('#sc_loadFile').addEventListener('click', function () {
      var fileInput = $('#sc_file');
      if (!fileInput.files || !fileInput.files[0]) {
        K.ui.toast('Please select a file first.', 'warning');
        return;
      }
      var file = fileInput.files[0];
      if (file.size > 5 * 1024 * 1024) {
        K.ui.toast('File too large. Max 5MB.', 'error');
        return;
      }
      var reader = new FileReader();
      reader.onload = function (e) {
        var content = e.target.result;
        // If file is read as ArrayBuffer (binary), convert to base64
        if (content instanceof ArrayBuffer) {
          var binary = '';
          var bytes = new Uint8Array(content);
          for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          $('#sc_filecontent').value = btoa(binary);
          $('#sc_binary').checked = true;
          K.ui.toast('Binary file loaded as base64.', 'info');
        } else {
          $('#sc_filecontent').value = content;
          $('#sc_binary').checked = false;
          K.ui.toast('File loaded.', 'success');
        }
        if (!$('#sc_filename').value) $('#sc_filename').value = file.name;
      };
      // Try as text first
      reader.readAsText(file);
    });

    $('#scriptForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {
        title: $('#sc_title').value.trim(),
        version: $('#sc_version').value.trim(),
        description: $('#sc_desc').value.trim(),
        longDescription: $('#sc_longdesc').value.trim(),
        category: $('#sc_category').value,
        tags: $('#sc_tags').value,
        fileName: $('#sc_filename').value.trim(),
        fileContent: $('#sc_filecontent').value,
        isBinary: $('#sc_binary').checked,
        mimeType: $('#sc_mime').value || 'text/javascript',
        changelog: $('#sc_changelog').value,
        externalUrl: $('#sc_external').value.trim(),
        thumbnailUrl: $('#sc_thumb').value.trim(),
        isFeatured: $('#sc_featured').checked,
        isPublished: $('#sc_published').checked
      };
      if (!data.title || !data.version || !data.description || !data.fileName || !data.fileContent) {
        K.ui.toast('Please fill all required fields.', 'error');
        return;
      }
      var btn = $('#scSubmitBtn');
      btn.disabled = true; btn.textContent = 'Uploading...';
      K.api('/scripts/create', { method: 'POST', body: JSON.stringify(data) }).then(function (json) {
        if (json.success) {
          K.ui.toast('Script uploaded!', 'success');
          $('#scriptForm').reset();
          $('#sc_published').checked = true;
          $('#sc_mime').value = 'text/javascript';
          loadScripts(); loadStats();
        } else {
          K.ui.toast(json.message || 'Failed.', 'error');
        }
      }).catch(function (err) { K.ui.toast(err.message || 'Failed.', 'error'); })
        .finally(function () { btn.disabled = false; btn.textContent = 'Upload Script'; });
    });

    // Snippet form
    $('#snippetForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {
        title: $('#sn_title').value.trim(),
        language: $('#sn_lang').value,
        description: $('#sn_desc').value.trim(),
        tags: $('#sn_tags').value,
        code: $('#sn_code').value,
        isFeatured: $('#sn_featured').checked,
        isPublished: $('#sn_published').checked
      };
      if (!data.title || !data.description || !data.code) {
        K.ui.toast('Title, description and code are required.', 'error');
        return;
      }
      var btn = $('#snSubmitBtn');
      btn.disabled = true; btn.textContent = 'Saving...';
      K.api('/snippets/create', { method: 'POST', body: JSON.stringify(data) }).then(function (json) {
        if (json.success) {
          K.ui.toast('Snippet added!', 'success');
          $('#snippetForm').reset();
          $('#sn_published').checked = true;
          loadSnippets(); loadStats();
        } else {
          K.ui.toast(json.message || 'Failed.', 'error');
        }
      }).catch(function (err) { K.ui.toast(err.message || 'Failed.', 'error'); })
        .finally(function () { btn.disabled = false; btn.textContent = 'Add Snippet'; });
    });

    // Refresh buttons
    $('#scRefresh').addEventListener('click', loadScripts);
    $('#snRefresh').addEventListener('click', loadSnippets);
    $('#tkRefresh').addEventListener('click', loadTickets);

    // Search
    var scTimer, snTimer, tkTimer;
    $('#scSearch').addEventListener('input', function (e) {
      clearTimeout(scTimer);
      scTimer = setTimeout(function () { loadScripts(e.target.value.trim()); }, 350);
    });
    $('#snSearch').addEventListener('input', function (e) {
      clearTimeout(snTimer);
      snTimer = setTimeout(function () { loadSnippets(e.target.value.trim()); }, 350);
    });
    $('#tkSearch').addEventListener('input', function (e) {
      clearTimeout(tkTimer);
      tkTimer = setTimeout(function () { loadTickets(); }, 350);
    });
    $('#tkStatusFilter').addEventListener('change', loadTickets);
    $('#tkPriorityFilter').addEventListener('change', loadTickets);
  }

  /* ============ SCRIPTS LIST ============ */
  function loadScripts(q) {
    var url = '/admin/all-scripts?perPage=50';
    if (q) url += '&q=' + encodeURIComponent(q);
    K.api(url).then(function (json) {
      if (!json.success) return;
      var html = json.data.items.map(function (s) {
        return '<tr>' +
          '<td><strong>' + eHTML(s.title) + '</strong><div style="font-size:11px; color:var(--text-light);">' + eHTML(s.slug) + '</div></td>' +
          '<td><span class="card-category">' + eHTML(s.category) + '</span></td>' +
          '<td><code style="font-size:11px;">' + eHTML(s.version) + '</code></td>' +
          '<td>' + fNum(s.downloadCount) + ' / ' + fNum(s.viewCount) + ' views</td>' +
          '<td>' + (s.isFeatured ? '⭐' : '—') + '</td>' +
          '<td>' + (s.isPublished ? '<span style="color:#10b981;">✓</span>' : '<span style="color:#ef4444;">✗</span>') + '</td>' +
          '<td style="font-size:12px; color: var(--text-muted);">' + fRel(s.createdAt) + '</td>' +
          '<td class="row-actions">' +
            '<a href="/scripts/' + eHTML(s.slug || s._id) + '" target="_blank" class="btn btn-sm btn-secondary">View</a>' +
            '<a href="/api/scripts/' + eHTML(s.slug || s._id) + '/download" class="btn btn-sm btn-secondary">DL</a>' +
            '<button class="btn btn-sm btn-danger" onclick="window.KarinaAdmin.deleteScript(\'' + s._id + '\',\'' + eHTML(s.title).replace(/'/g, "\\'") + '\')">Delete</button>' +
          '</td>' +
        '</tr>';
      }).join('');
      $('#scriptsBody').innerHTML = html || '<tr><td colspan="8" style="text-align:center; color: var(--text-muted); padding: 32px;">No scripts yet.</td></tr>';
    }).catch(function () {});
  }

  /* ============ SNIPPETS LIST ============ */
  function loadSnippets(q) {
    var url = '/admin/all-snippets?perPage=50';
    if (q) url += '&q=' + encodeURIComponent(q);
    K.api(url).then(function (json) {
      if (!json.success) return;
      var html = json.data.items.map(function (s) {
        return '<tr>' +
          '<td><strong>' + eHTML(s.title) + '</strong><div style="font-size:11px; color:var(--text-light);">' + eHTML(s.slug) + '</div></td>' +
          '<td><span class="card-category">' + eHTML(s.language) + '</span></td>' +
          '<td>' + fNum(s.viewCount) + '</td>' +
          '<td>' + fNum(s.copyCount) + '</td>' +
          '<td>' + (s.isFeatured ? '⭐' : '—') + '</td>' +
          '<td>' + (s.isPublished ? '<span style="color:#10b981;">✓</span>' : '<span style="color:#ef4444;">✗</span>') + '</td>' +
          '<td style="font-size:12px; color: var(--text-muted);">' + fRel(s.createdAt) + '</td>' +
          '<td class="row-actions">' +
            '<a href="/snippets/' + eHTML(s.slug || s._id) + '" target="_blank" class="btn btn-sm btn-secondary">View</a>' +
            '<button class="btn btn-sm btn-danger" onclick="window.KarinaAdmin.deleteSnippet(\'' + s._id + '\')">Delete</button>' +
          '</td>' +
        '</tr>';
      }).join('');
      $('#snippetsBody').innerHTML = html || '<tr><td colspan="8" style="text-align:center; color: var(--text-muted); padding: 32px;">No snippets yet.</td></tr>';
    }).catch(function () {});
  }

  /* ============ TICKETS LIST ============ */
  function loadTickets() {
    var q = $('#tkSearch').value.trim();
    var status = $('#tkStatusFilter').value;
    var priority = $('#tkPriorityFilter').value;
    var url = '/tickets/admin/list?perPage=50';
    if (q) url += '&q=' + encodeURIComponent(q);
    if (status) url += '&status=' + encodeURIComponent(status);
    if (priority) url += '&priority=' + encodeURIComponent(priority);

    K.api(url).then(function (json) {
      if (!json.success) return;
      var html = json.data.items.map(function (t) {
        return '<tr>' +
          '<td><code style="font-size:11px;">' + eHTML(t.ticketNumber) + '</code></td>' +
          '<td><strong>' + eHTML(t.subject) + '</strong></td>' +
          '<td>' + eHTML(t.name) + '<div style="font-size:11px; color:var(--text-light);">' + eHTML(t.email) + '</div></td>' +
          '<td><span class="card-category">' + eHTML(t.category) + '</span></td>' +
          '<td><span class="badge badge-' + t.priority + '">' + t.priority + '</span></td>' +
          '<td><span class="badge badge-' + t.status + '">' + t.status + '</span></td>' +
          '<td style="font-size:12px; color: var(--text-muted);">' + fRel(t.createdAt) + '</td>' +
          '<td class="row-actions">' +
            '<a href="/support/ticket/' + encodeURIComponent(t.ticketNumber) + '" target="_blank" class="btn btn-sm btn-primary">Open</a>' +
          '</td>' +
        '</tr>';
      }).join('');
      $('#ticketsBody').innerHTML = html || '<tr><td colspan="8" style="text-align:center; color: var(--text-muted); padding: 32px;">No tickets found.</td></tr>';
    }).catch(function () {});
  }

  /* ============ DELETE ACTIONS ============ */
  function deleteUpdate(id) {
    if (!confirm('Delete this update permanently?')) return;
    K.api('/updates/' + id, { method: 'DELETE' }).then(function (json) {
      if (json.success) { K.ui.toast('Update deleted.', 'success'); loadUpdates(); loadStats(); }
      else K.ui.toast(json.message || 'Failed.', 'error');
    }).catch(function (err) { K.ui.toast(err.message || 'Failed.', 'error'); });
  }

  function deleteScript(id, title) {
    var hard = confirm('Permanently DELETE "' + title + '"?\n\nClick OK to permanently delete (unpublish + remove).\nClick Cancel to soft-delete (unpublish only).');
    var url = '/scripts/' + id;
    if (hard) url += '?hard=1';
    K.api(url, { method: 'DELETE' }).then(function (json) {
      if (json.success) { K.ui.toast(json.message, 'success'); loadScripts(); loadStats(); }
      else K.ui.toast(json.message || 'Failed.', 'error');
    }).catch(function (err) { K.ui.toast(err.message || 'Failed.', 'error'); });
  }

  function deleteSnippet(id) {
    var hard = confirm('Permanently DELETE this snippet?\n\nOK = permanent delete\nCancel = soft delete (unpublish)');
    var url = '/snippets/' + id;
    if (hard) url += '?hard=1';
    K.api(url, { method: 'DELETE' }).then(function (json) {
      if (json.success) { K.ui.toast(json.message, 'success'); loadSnippets(); loadStats(); }
      else K.ui.toast(json.message || 'Failed.', 'error');
    }).catch(function (err) { K.ui.toast(err.message || 'Failed.', 'error'); });
  }

  function editUpdate(id) {
    K.ui.toast('Edit form coming soon. For now, delete and recreate.', 'info');
  }

  /* ============ BOOTSTRAP ============ */
  window.KarinaAdmin = {
    deleteUpdate: deleteUpdate,
    deleteScript: deleteScript,
    deleteSnippet: deleteSnippet,
    editUpdate: editUpdate,
    loadStats: loadStats
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
