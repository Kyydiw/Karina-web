'use strict';

/**
 * POST /api/updates/upload
 * Protected route. Creates a new update file/changelog entry.
 */
async function uploadUpdate(req, res) {
  try {
    const { title, version, description, changelogLink } = req.body;

    if (!title || !version || !description) {
      return res.status(400).json({
        success: false,
        message: 'Title, version, and description are required.'
      });
    }

    const db = req.app.get('db');
    const UpdateFile = db.model('UpdateFile');

    const newUpdate = await UpdateFile.create({
      title: title.trim(),
      version: version.trim(),
      description: description.trim(),
      changelogLink: (changelogLink || '').trim()
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
 * Public route. Returns the latest updates from the database.
 */
async function getLatestUpdates(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

    const db = req.app.get('db');
    const UpdateFile = db.model('UpdateFile');

    const updates = await UpdateFile
      .find()
      .sort({ createdAt: -1 })
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

module.exports = { uploadUpdate, getLatestUpdates };