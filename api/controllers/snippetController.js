'use strict';

const { uniqueSlug } = require('../utils/helpers');

/**
 * Snippet Controller — Community Submission & Admin Approval
 *
 * Perubahan utama:
 * - listSnippets: hanya menampilkan snippet dengan status='approved'.
 * - createSnippet (POST /api/snippets): diproteksi requireAuth.
 *   Jika user biasa → status='pending'. Jika admin → status='approved'.
 * - approveSnippet (PATCH /api/snippets/:id/approve): diproteksi requireAdmin.
 *   Mengubah status snippet dari 'pending' menjadi 'approved'.
 * - getSnippet: hanya menampilkan snippet approved (atau milik user sendiri).
 */

/**
 * GET /api/snippets/list
 * Public. Returns paginated, searchable list of APPROVED snippets only.
 *
 * Query params:
 *   page, perPage, q, language, tag, sort ('newest'|'popular'|'featured')
 */
async function listSnippets(req, res) {
  try {
    const db = req.app.get('db');
    const Snippet = db.model('Snippet');

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(50, Math.max(1, parseInt(req.query.perPage, 10) || 12));
    const q = (req.query.q || '').trim();
    const language = (req.query.language || '').trim();
    const tag = (req.query.tag || '').trim();
    const sortKey = (req.query.sort || 'newest').toLowerCase();

    // Hanya tampilkan snippet yang approved
    const filter = { status: 'approved' };
    if (language) filter.language = language;
    if (tag) filter.tags = { $regex: '^' + escapeRegex(tag) + '$', $options: 'i' };
    if (q) filter.$text = { $search: q };

    let sortOpt = { createdAt: -1 };
    if (sortKey === 'popular') sortOpt = { viewCount: -1, createdAt: -1 };
    else if (sortKey === 'copied') sortOpt = { copyCount: -1, createdAt: -1 };
    else if (sortKey === 'featured') {
      filter.isFeatured = true;
      sortOpt = { createdAt: -1 };
    }

    const skip = (page - 1) * perPage;
    const [items, total] = await Promise.all([
      Snippet.find(filter)
        .sort(sortOpt)
        .skip(skip)
        .limit(perPage)
        .select('-__v')
        .lean(),
      Snippet.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: {
        items: items,
        page: page,
        perPage: perPage,
        total: total,
        totalPages: Math.max(1, Math.ceil(total / perPage))
      }
    });
  } catch (error) {
    console.error('[Snippets] List error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch snippets.' });
  }
}

/**
 * GET /api/snippets/featured
 * Public. Returns up to `limit` featured & approved snippets (default 6).
 */
async function getFeaturedSnippets(req, res) {
  try {
    const db = req.app.get('db');
    const Snippet = db.model('Snippet');
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 6));
    const items = await Snippet.find({ status: 'approved', isFeatured: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('-__v')
      .lean();
    return res.status(200).json({ success: true, data: items });
  } catch (error) {
    console.error('[Snippets] Featured error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch featured snippets.' });
  }
}

/**
 * GET /api/snippets/:idOrSlug
 * Public. Fetch a single APPROVED snippet by id or slug. Increments view count.
 */
async function getSnippet(req, res) {
  try {
    const db = req.app.get('db');
    const Snippet = db.model('Snippet');
    const idOrSlug = req.params.idOrSlug;

    const query = idOrSlug.match(/^[0-9a-fA-F]{24}$/)
      ? { _id: idOrSlug, status: 'approved' }
      : { slug: idOrSlug.toLowerCase(), status: 'approved' };

    const snippet = await Snippet.findOne(query).select('-__v').lean();
    if (!snippet) {
      return res.status(404).json({ success: false, message: 'Snippet not found.' });
    }

    // Fire-and-forget view count increment
    Snippet.updateOne({ _id: snippet._id }, { $inc: { viewCount: 1 } }).catch(function () {});

    return res.status(200).json({ success: true, data: snippet });
  } catch (error) {
    console.error('[Snippets] Get error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch snippet.' });
  }
}

/**
 * POST /api/snippets/:idOrSlug/copy
 * Public. Increments copy count when user copies the snippet code.
 */
async function recordCopy(req, res) {
  try {
    const db = req.app.get('db');
    const Snippet = db.model('Snippet');
    const idOrSlug = req.params.idOrSlug;

    const query = idOrSlug.match(/^[0-9a-fA-F]{24}$/)
      ? { _id: idOrSlug }
      : { slug: idOrSlug.toLowerCase() };

    const result = await Snippet.updateOne(query, { $inc: { copyCount: 1 } });
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Snippet not found.' });
    }
    return res.status(200).json({ success: true, message: 'Copy recorded.' });
  } catch (error) {
    console.error('[Snippets] Copy record error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to record copy.' });
  }
}

/**
 * POST /api/snippets
 * Authenticated users (user OR admin). Community snippet submission.
 *
 * Perbedaan behavior berdasarkan role:
 * - role='user'   → status='pending', isPublished=false, isFeatured=false.
 * - role='admin'  → status='approved', isPublished=true (sama seperti sebelumnya).
 */
async function createSnippet(req, res) {
  try {
    const db = req.app.get('db');
    const Snippet = db.model('Snippet');

    const body = req.body || {};
    const title = (body.title || '').trim();
    const description = (body.description || '').trim();
    const language = (body.language || 'javascript').trim();
    const code = body.code || '';

    if (!title || !description || !code) {
      return res.status(400).json({
        success: false,
        message: 'Title, description and code are required.'
      });
    }
    if (code.length > 50000) {
      return res.status(400).json({
        success: false,
        message: 'Code is too long. Maximum 50000 characters.'
      });
    }

    const slug = await uniqueSlug(Snippet, title);

    let tags = body.tags || [];
    if (typeof tags === 'string') tags = tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    tags = tags.slice(0, 15);

    // Tentukan status berdasarkan role user
    var isAdmin = req.user && req.user.role === 'admin';
    var snippetStatus = isAdmin ? 'approved' : 'pending';

    var authorName = (req.user && req.user.displayName) || 'anonymous';

    const snippet = await Snippet.create({
      title: title,
      slug: slug,
      description: description,
      language: language,
      code: code,
      tags: tags,
      author: authorName,
      isFeatured: isAdmin ? !!body.isFeatured : false,
      isPublished: isAdmin ? (body.isPublished === false ? false : true) : false,
      status: snippetStatus,
      submittedBy: (req.user && req.user.id) || null
    });

    return res.status(201).json({
      success: true,
      message: isAdmin
        ? 'Snippet created and published successfully.'
        : 'Snippet submitted for review. It will appear after admin approval.',
      data: {
        id: snippet._id,
        slug: snippet.slug,
        title: snippet.title,
        status: snippet.status
      }
    });
  } catch (error) {
    console.error('[Snippets] Create error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to create snippet.' });
  }
}

/**
 * PATCH /api/snippets/:id/approve
 * Admin only. Mengubah status snippet dari 'pending' menjadi 'approved'.
 */
async function approveSnippet(req, res) {
  try {
    const db = req.app.get('db');
    const Snippet = db.model('Snippet');
    const id = req.params.id;

    const snippet = await Snippet.findById(id);
    if (!snippet) {
      return res.status(404).json({ success: false, message: 'Snippet not found.' });
    }

    if (snippet.status === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Snippet is already approved.'
      });
    }

    snippet.status = 'approved';
    snippet.isPublished = true;
    await snippet.save();

    console.log('[Snippets] Snippet approved:', snippet.title, '| by admin:', req.user.email);

    return res.status(200).json({
      success: true,
      message: 'Snippet approved and published.',
      data: { id: snippet._id, slug: snippet.slug, status: 'approved' }
    });
  } catch (error) {
    console.error('[Snippets] Approve error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to approve snippet.' });
  }
}

/**
 * PATCH /api/snippets/:id/reject
 * Admin only. Menolak snippet (soft-delete: set isPublished=false, status tetap pending).
 * Bisa diubah ke hard delete via query ?hard=1.
 */
async function rejectSnippet(req, res) {
  try {
    const db = req.app.get('db');
    const Snippet = db.model('Snippet');
    const id = req.params.id;
    const hard = req.query.hard === '1' || req.query.hard === 'true';

    const snippet = await Snippet.findById(id);
    if (!snippet) {
      return res.status(404).json({ success: false, message: 'Snippet not found.' });
    }

    if (hard) {
      await Snippet.deleteOne({ _id: id });
      return res.status(200).json({ success: true, message: 'Snippet permanently deleted.' });
    }

    snippet.isPublished = false;
    snippet.status = 'pending';
    await snippet.save();

    return res.status(200).json({
      success: true,
      message: 'Snippet rejected (unpublished).'
    });
  } catch (error) {
    console.error('[Snippets] Reject error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to reject snippet.' });
  }
}

/**
 * PUT /api/snippets/:id
 * Admin only. Updates an existing snippet.
 */
async function updateSnippet(req, res) {
  try {
    const db = req.app.get('db');
    const Snippet = db.model('Snippet');
    const id = req.params.id;
    const body = req.body || {};

    const snippet = await Snippet.findById(id);
    if (!snippet) {
      return res.status(404).json({ success: false, message: 'Snippet not found.' });
    }

    const updatable = ['title', 'description', 'language', 'code', 'isFeatured', 'isPublished', 'author'];
    updatable.forEach(function (field) {
      if (body[field] !== undefined) {
        if (typeof body[field] === 'string') {
          snippet[field] = body[field].trim();
        } else {
          snippet[field] = body[field];
        }
      }
    });

    if (Array.isArray(body.tags)) {
      snippet.tags = body.tags.slice(0, 15);
    } else if (typeof body.tags === 'string') {
      snippet.tags = body.tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 15);
    }

    // Jika admin mengubah status manual via update
    if (body.status && ['pending', 'approved'].indexOf(body.status) !== -1) {
      snippet.status = body.status;
      if (body.status === 'approved') snippet.isPublished = true;
    }

    if (body.title && body.title.trim() !== snippet.title) {
      snippet.slug = await uniqueSlug(Snippet, body.title, snippet._id);
    }

    await snippet.save();
    return res.status(200).json({
      success: true,
      message: 'Snippet updated successfully.',
      data: { id: snippet._id, slug: snippet.slug }
    });
  } catch (error) {
    console.error('[Snippets] Update error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update snippet.' });
  }
}

/**
 * DELETE /api/snippets/:id
 * Admin only. Soft-deletes by setting isPublished=false unless ?hard=1.
 */
async function deleteSnippet(req, res) {
  try {
    const db = req.app.get('db');
    const Snippet = db.model('Snippet');
    const id = req.params.id;
    const hard = req.query.hard === '1' || req.query.hard === 'true';

    const snippet = await Snippet.findById(id);
    if (!snippet) {
      return res.status(404).json({ success: false, message: 'Snippet not found.' });
    }

    if (hard) {
      await Snippet.deleteOne({ _id: id });
    } else {
      snippet.isPublished = false;
      await snippet.save();
    }

    return res.status(200).json({
      success: true,
      message: hard ? 'Snippet permanently deleted.' : 'Snippet unpublished.'
    });
  } catch (error) {
    console.error('[Snippets] Delete error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete snippet.' });
  }
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  listSnippets,
  getFeaturedSnippets,
  getSnippet,
  recordCopy,
  createSnippet,
  updateSnippet,
  deleteSnippet,
  approveSnippet,
  rejectSnippet
};