'use strict';

/**
 * POST /api/updates/upload
 * Protected route. Creates a new update file/changelog entry.
 */
async function uploadUpdate(req, res) {
  try {
    const body = req.body || {};
    const title = (body.title || '').trim();
    const version = (body.version || '').trim();
    const description = (body.description || '').trim();
    const changelogLink = (body.changelogLink || '').trim();
    const category = (body.category || 'feature').trim();
    const isPinned = !!body.isPinned;
    const isPublished = body.isPublished === false ? false : true;

    if (!title || !version || !description) {
      return res.status(400).json({
        success: false,
        message: 'Title, version, and description are required.'
      });
    }

    let tags = body.tags || [];
    if (typeof tags === 'string') tags = tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    tags = tags.slice(0, 15);

    const db = req.app.get('db');
    const UpdateFile = db.model('UpdateFile');

    const newUpdate = await UpdateFile.create({
      title: title,
      version: version,
      description: description,
      changelogLink: changelogLink,
      category: category,
      isPinned: isPinned,
      isPublished: isPublished,
      tags: tags
    });

    res.status(201).json({
      success: true,
      message: 'Update created successfully.',
      data: {
        id: newUpdate._id,
        title: newUpdate.title,
        version: newUpdate.version,
        description: newUpdate.description,
        changelogLink: newUpdate.changelogLink,
        category: newUpdate.category,
        isPinned: newUpdate.isPinned,
        isPublished: newUpdate.isPublished,
        tags: newUpdate.tags,
        createdAt: newUpdate.createdAt
      }
    });
  } catch (error) {
    console.error('[Updates] Upload error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Internal server error while creating update.'
    });
  }
}

/**
 * GET /api/updates/latest
 * Public route. Returns the latest published updates from the database.
 * Pinned updates are returned first.
 *
 * Query: limit (default 10, max 50)
 */
async function getLatestUpdates(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

    const db = req.app.get('db');
    const UpdateFile = db.model('UpdateFile');

    const updates = await UpdateFile
      .find({ isPublished: true })
      .sort({ isPinned: -1, createdAt: -1 })
      .limit(limit)
      .select('-__v')
      .lean();

    res.status(200).json({
      success: true,
      data: updates
    });
  } catch (error) {
    console.error('[Updates] Fetch latest error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching updates.'
    });
  }
}

/**
 * GET /api/updates/all
 * Public route. Returns paginated list of all published updates.
 *
 * Query: page, perPage, q, category
 */
async function getAllUpdates(req, res) {
  try {
    const db = req.app.get('db');
    const UpdateFile = db.model('UpdateFile');

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(50, Math.max(1, parseInt(req.query.perPage, 10) || 12));
    const q = (req.query.q || '').trim();
    const category = (req.query.category || '').trim();

    const filter = { isPublished: true };
    if (category) filter.category = category;
    if (q) {
      filter.$or = [
        { title: { $regex: escapeRegex(q), $options: 'i' } },
        { description: { $regex: escapeRegex(q), $options: 'i' } }
      ];
    }

    const skip = (page - 1) * perPage;
    const [items, total] = await Promise.all([
      UpdateFile.find(filter).sort({ isPinned: -1, createdAt: -1 }).skip(skip).limit(perPage).select('-__v').lean(),
      UpdateFile.countDocuments(filter)
    ]);

    res.status(200).json({
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
    console.error('[Updates] Fetch all error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch updates.' });
  }
}

/**
 * GET /api/updates/:id
 * Public. Returns a single update by id.
 */
async function getUpdate(req, res) {
  try {
    const db = req.app.get('db');
    const UpdateFile = db.model('UpdateFile');
    const id = req.params.id;

    const update = await UpdateFile.findOne({ _id: id, isPublished: true }).select('-__v').lean();
    if (!update) {
      return res.status(404).json({ success: false, message: 'Update not found.' });
    }
    return res.status(200).json({ success: true, data: update });
  } catch (error) {
    console.error('[Updates] Get error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch update.' });
  }
}

/**
 * PUT /api/updates/:id
 * Admin only. Updates an existing update entry.
 */
async function updateUpdate(req, res) {
  try {
    const db = req.app.get('db');
    const UpdateFile = db.model('UpdateFile');
    const id = req.params.id;
    const body = req.body || {};

    const update = await UpdateFile.findById(id);
    if (!update) {
      return res.status(404).json({ success: false, message: 'Update not found.' });
    }

    const updatable = ['title', 'version', 'description', 'changelogLink', 'category', 'isPinned', 'isPublished'];
    updatable.forEach(function (field) {
      if (body[field] !== undefined) {
        if (typeof body[field] === 'string') {
          update[field] = body[field].trim();
        } else {
          update[field] = body[field];
        }
      }
    });

    if (Array.isArray(body.tags)) {
      update.tags = body.tags.slice(0, 15);
    } else if (typeof body.tags === 'string') {
      update.tags = body.tags.split(',').map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 15);
    }

    await update.save();

    return res.status(200).json({
      success: true,
      message: 'Update saved.',
      data: { id: update._id, title: update.title }
    });
  } catch (error) {
    console.error('[Updates] Update error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update.' });
  }
}

/**
 * DELETE /api/updates/:id
 * Admin only. Hard-deletes an update.
 */
async function deleteUpdate(req, res) {
  try {
    const db = req.app.get('db');
    const UpdateFile = db.model('UpdateFile');
    const id = req.params.id;

    const result = await UpdateFile.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Update not found.' });
    }
    return res.status(200).json({ success: true, message: 'Update deleted.' });
  } catch (error) {
    console.error('[Updates] Delete error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete update.' });
  }
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  uploadUpdate,
  getLatestUpdates,
  getAllUpdates,
  getUpdate,
  updateUpdate,
  deleteUpdate
};
