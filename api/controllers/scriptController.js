'use strict';

const { uniqueSlug } = require('../utils/helpers');

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB hard limit for stored file content

/**
 * GET /api/scripts/list
 * Public. Returns paginated, searchable, filterable list of published scripts.
 *
 * Query params:
 *   page     - page number (default 1)
 *   perPage  - items per page (default 12, max 50)
 *   q        - free-text search query
 *   category - one of the category enum values
 *   tag      - filter by tag (case-insensitive)
 *   sort     - 'newest' | 'popular' | 'downloads' | 'featured' (default newest)
 */
async function listScripts(req, res) {
  try {
    const db = req.app.get('db');
    const Script = db.model('Script');

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(50, Math.max(1, parseInt(req.query.perPage, 10) || 12));
    const q = (req.query.q || '').trim();
    const category = (req.query.category || '').trim();
    const tag = (req.query.tag || '').trim();
    const sortKey = (req.query.sort || 'newest').toLowerCase();

    const filter = { isPublished: true };
    if (category) filter.category = category;
    if (tag) filter.tags = { $regex: '^' + escapeRegex(tag) + '$', $options: 'i' };
    if (q) {
      filter.$text = { $search: q };
    }

    let sortOpt = { createdAt: -1 };
    if (sortKey === 'popular') sortOpt = { viewCount: -1, createdAt: -1 };
    else if (sortKey === 'downloads') sortOpt = { downloadCount: -1, createdAt: -1 };
    else if (sortKey === 'featured') {
      filter.isFeatured = true;
      sortOpt = { createdAt: -1 };
    }

    const skip = (page - 1) * perPage;
    const [items, total] = await Promise.all([
      Script.find(filter)
        .sort(sortOpt)
        .skip(skip)
        .limit(perPage)
        .select('-fileContent -__v')
        .lean(),
      Script.countDocuments(filter)
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
    console.error('[Scripts] List error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch scripts.' });
  }
}

/**
 * GET /api/scripts/featured
 * Public. Returns up to `limit` featured scripts (default 6).
 */
async function getFeaturedScripts(req, res) {
  try {
    const db = req.app.get('db');
    const Script = db.model('Script');
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 6));
    const items = await Script.find({ isPublished: true, isFeatured: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('-fileContent -__v')
      .lean();
    return res.status(200).json({ success: true, data: items });
  } catch (error) {
    console.error('[Scripts] Featured error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch featured scripts.' });
  }
}

/**
 * GET /api/scripts/:idOrSlug
 * Public. Fetch a single script by id or slug. Increments view count.
 */
async function getScript(req, res) {
  try {
    const db = req.app.get('db');
    const Script = db.model('Script');
    const idOrSlug = req.params.idOrSlug;

    const query = idOrSlug.match(/^[0-9a-fA-F]{24}$/)
      ? { _id: idOrSlug, isPublished: true }
      : { slug: idOrSlug.toLowerCase(), isPublished: true };

    const script = await Script.findOne(query).select('-fileContent -__v').lean();
    if (!script) {
      return res.status(404).json({ success: false, message: 'Script not found.' });
    }

    // Increment view count in background (fire-and-forget, don't block response)
    Script.updateOne({ _id: script._id }, { $inc: { viewCount: 1 } }).catch(function () {});

    return res.status(200).json({ success: true, data: script });
  } catch (error) {
    console.error('[Scripts] Get error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch script.' });
  }
}

/**
 * GET /api/scripts/:idOrSlug/download
 * Public. Returns the raw file content as a download attachment.
 * Increments download count.
 */
async function downloadScript(req, res) {
  try {
    const db = req.app.get('db');
    const Script = db.model('Script');
    const idOrSlug = req.params.idOrSlug;

    const query = idOrSlug.match(/^[0-9a-fA-F]{24}$/)
      ? { _id: idOrSlug, isPublished: true }
      : { slug: idOrSlug.toLowerCase(), isPublished: true };

    const script = await Script.findOne(query).lean();
    if (!script) {
      return res.status(404).json({ success: false, message: 'Script not found.' });
    }

    // Increment download count in background
    Script.updateOne({ _id: script._id }, { $inc: { downloadCount: 1 } }).catch(function () {});

    // Set response headers for download
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="' + encodeURIComponent(script.fileName) + '"'
    );
    res.setHeader('Content-Type', script.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', Buffer.byteLength(script.fileContent, script.isBinary ? 'base64' : 'utf8'));

    if (script.isBinary) {
      return res.send(Buffer.from(script.fileContent, 'base64'));
    }
    return res.send(script.fileContent);
  } catch (error) {
    console.error('[Scripts] Download error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to download script.' });
  }
}

/**
 * POST /api/scripts/create
 * Admin only. Creates a new script entry with embedded file content.
 *
 * Body:
 *   title, version, description, longDescription, category, tags[],
 *   fileName, fileContent, isBinary, mimeType, isFeatured, isPublished,
 *   changelog, externalUrl, thumbnailUrl
 */
async function createScript(req, res) {
  try {
    const db = req.app.get('db');
    const Script = db.model('Script');

    const body = req.body || {};
    const title = (body.title || '').trim();
    const version = (body.version || '').trim();
    const description = (body.description || '').trim();
    const category = (body.category || 'bot-script').trim();
    const fileName = (body.fileName || '').trim();
    const fileContent = body.fileContent || '';

    if (!title || !version || !description || !fileName || !fileContent) {
      return res.status(400).json({
        success: false,
        message: 'Title, version, description, fileName and fileContent are required.'
      });
    }

    const contentSize = Buffer.byteLength(fileContent, body.isBinary ? 'base64' : 'utf8');
    if (contentSize > MAX_FILE_SIZE) {
      return res.status(413).json({
        success: false,
        message: 'File too large. Maximum allowed size is 5 MB.'
      });
    }

    const slug = await uniqueSlug(Script, title);

    // Parse tags: accept array or comma-separated string
    let tags = body.tags || [];
    if (typeof tags === 'string') tags = tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    tags = tags.slice(0, 15);

    const script = await Script.create({
      title: title,
      slug: slug,
      version: version,
      description: description,
      longDescription: (body.longDescription || '').trim(),
      category: category,
      tags: tags,
      fileName: fileName,
      fileContent: fileContent,
      isBinary: !!body.isBinary,
      mimeType: body.mimeType || 'text/javascript',
      fileSize: contentSize,
      isFeatured: !!body.isFeatured,
      isPublished: body.isPublished === false ? false : true,
      changelog: (body.changelog || '').trim(),
      externalUrl: (body.externalUrl || '').trim(),
      thumbnailUrl: (body.thumbnailUrl || '').trim(),
      uploadedBy: req.user.username
    });

    return res.status(201).json({
      success: true,
      message: 'Script created successfully.',
      data: {
        id: script._id,
        slug: script.slug,
        title: script.title,
        version: script.version
      }
    });
  } catch (error) {
    console.error('[Scripts] Create error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to create script.' });
  }
}

/**
 * PUT /api/scripts/:id
 * Admin only. Updates an existing script.
 */
async function updateScript(req, res) {
  try {
    const db = req.app.get('db');
    const Script = db.model('Script');
    const id = req.params.id;
    const body = req.body || {};

    const script = await Script.findById(id);
    if (!script) {
      return res.status(404).json({ success: false, message: 'Script not found.' });
    }

    const updatable = [
      'title', 'version', 'description', 'longDescription', 'category',
      'fileName', 'isBinary', 'mimeType', 'isFeatured', 'isPublished',
      'changelog', 'externalUrl', 'thumbnailUrl'
    ];
    updatable.forEach(function (field) {
      if (body[field] !== undefined) {
        if (typeof body[field] === 'string') {
          script[field] = body[field].trim();
        } else {
          script[field] = body[field];
        }
      }
    });

    if (Array.isArray(body.tags)) {
      script.tags = body.tags.slice(0, 15);
    } else if (typeof body.tags === 'string') {
      script.tags = body.tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 15);
    }

    if (body.fileContent) {
      const contentSize = Buffer.byteLength(body.fileContent, body.isBinary ? 'base64' : 'utf8');
      if (contentSize > MAX_FILE_SIZE) {
        return res.status(413).json({ success: false, message: 'File too large. Max 5 MB.' });
      }
      script.fileContent = body.fileContent;
      script.fileSize = contentSize;
      script.isBinary = !!body.isBinary;
    }

    // If title changed, regenerate slug
    if (body.title && body.title.trim() !== script.title) {
      script.slug = await uniqueSlug(Script, body.title, script._id);
    }

    await script.save();

    return res.status(200).json({
      success: true,
      message: 'Script updated successfully.',
      data: { id: script._id, slug: script.slug, title: script.title }
    });
  } catch (error) {
    console.error('[Scripts] Update error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update script.' });
  }
}

/**
 * DELETE /api/scripts/:id
 * Admin only. Soft-deletes by setting isPublished=false (preserves data integrity
 * for historical download links). Hard-delete only when ?hard=1 query is provided.
 */
async function deleteScript(req, res) {
  try {
    const db = req.app.get('db');
    const Script = db.model('Script');
    const id = req.params.id;
    const hard = req.query.hard === '1' || req.query.hard === 'true';

    const script = await Script.findById(id);
    if (!script) {
      return res.status(404).json({ success: false, message: 'Script not found.' });
    }

    if (hard) {
      await Script.deleteOne({ _id: id });
    } else {
      script.isPublished = false;
      await script.save();
    }

    return res.status(200).json({
      success: true,
      message: hard ? 'Script permanently deleted.' : 'Script unpublished (soft delete).'
    });
  } catch (error) {
    console.error('[Scripts] Delete error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete script.' });
  }
}

/**
 * GET /api/scripts/categories/counts
 * Public. Returns count of scripts grouped by category, useful for filter UI.
 */
async function getCategoryCounts(req, res) {
  try {
    const db = req.app.get('db');
    const Script = db.model('Script');
    const result = await Script.aggregate([
      { $match: { isPublished: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    const counts = {};
    result.forEach(function (r) { counts[r._id] = r.count; });
    return res.status(200).json({ success: true, data: counts });
  } catch (error) {
    console.error('[Scripts] Category counts error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch category counts.' });
  }
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  listScripts,
  getFeaturedScripts,
  getScript,
  downloadScript,
  createScript,
  updateScript,
  deleteScript,
  getCategoryCounts
};
