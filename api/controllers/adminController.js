'use strict';

/**
 * GET /api/admin/stats
 * Admin only. Returns aggregate dashboard statistics.
 */
async function getStats(req, res) {
  try {
    const db = req.app.get('db');
    const UpdateFile = db.model('UpdateFile');
    const Script = db.model('Script');
    const Snippet = db.model('Snippet');
    const Ticket = db.model('Ticket');

    const [
      totalUpdates,
      totalScripts,
      totalSnippets,
      totalTickets,
      openTickets,
      totalDownloads,
      totalSnippetViews,
      totalScriptViews,
      recentScripts,
      recentTickets
    ] = await Promise.all([
      UpdateFile.countDocuments({}),
      Script.countDocuments({}),
      Snippet.countDocuments({}),
      Ticket.countDocuments({}),
      Ticket.countDocuments({ status: { $in: ['open', 'in-progress'] } }),
      Script.aggregate([{ $group: { _id: null, total: { $sum: '$downloadCount' } } }]),
      Snippet.aggregate([{ $group: { _id: null, total: { $sum: '$viewCount' } } }]),
      Script.aggregate([{ $group: { _id: null, total: { $sum: '$viewCount' } } }]),
      Script.find({}).sort({ createdAt: -1 }).limit(5).select('title slug version createdAt downloadCount isPublished').lean(),
      Ticket.find({ status: { $in: ['open', 'in-progress'] } })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('ticketNumber subject priority status category name email createdAt')
        .lean()
    ]);

    return res.status(200).json({
      success: true,
      data: {
        counts: {
          updates: totalUpdates,
          scripts: totalScripts,
          snippets: totalSnippets,
          tickets: totalTickets,
          openTickets: openTickets
        },
        metrics: {
          totalDownloads: totalDownloads[0] ? totalDownloads[0].total : 0,
          totalSnippetViews: totalSnippetViews[0] ? totalSnippetViews[0].total : 0,
          totalScriptViews: totalScriptViews[0] ? totalScriptViews[0].total : 0
        },
        recent: {
          scripts: recentScripts,
          tickets: recentTickets
        }
      }
    });
  } catch (error) {
    console.error('[Admin] Stats error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch stats.' });
  }
}

/**
 * GET /api/admin/all-scripts
 * Admin only. Returns ALL scripts (including unpublished) for management.
 */
async function listAllScripts(req, res) {
  try {
    const db = req.app.get('db');
    const Script = db.model('Script');

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(50, Math.max(1, parseInt(req.query.perPage, 10) || 20));
    const q = (req.query.q || '').trim();
    const includeUnpublished = req.query.all !== 'false'; // default true

    const filter = {};
    if (!includeUnpublished) filter.isPublished = true;
    if (q) {
      filter.$or = [
        { title: { $regex: escapeRegex(q), $options: 'i' } },
        { description: { $regex: escapeRegex(q), $options: 'i' } }
      ];
    }

    const skip = (page - 1) * perPage;
    const [items, total] = await Promise.all([
      Script.find(filter).sort({ createdAt: -1 }).skip(skip).limit(perPage)
        .select('-fileContent -__v').lean(),
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
    console.error('[Admin] List scripts error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to list scripts.' });
  }
}

/**
 * GET /api/admin/all-snippets
 * Admin only. Returns ALL snippets (including unpublished) for management.
 */
async function listAllSnippets(req, res) {
  try {
    const db = req.app.get('db');
    const Snippet = db.model('Snippet');

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(50, Math.max(1, parseInt(req.query.perPage, 10) || 20));
    const q = (req.query.q || '').trim();
    const includeUnpublished = req.query.all !== 'false';

    const filter = {};
    if (!includeUnpublished) filter.isPublished = true;
    if (q) {
      filter.$or = [
        { title: { $regex: escapeRegex(q), $options: 'i' } },
        { description: { $regex: escapeRegex(q), $options: 'i' } }
      ];
    }

    const skip = (page - 1) * perPage;
    const [items, total] = await Promise.all([
      Snippet.find(filter).sort({ createdAt: -1 }).skip(skip).limit(perPage).select('-__v').lean(),
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
    console.error('[Admin] List snippets error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to list snippets.' });
  }
}

/**
 * GET /api/admin/all-updates
 * Admin only. Returns ALL updates (including unpublished).
 */
async function listAllUpdates(req, res) {
  try {
    const db = req.app.get('db');
    const UpdateFile = db.model('UpdateFile');
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(50, Math.max(1, parseInt(req.query.perPage, 10) || 20));

    const skip = (page - 1) * perPage;
    const [items, total] = await Promise.all([
      UpdateFile.find({}).sort({ isPinned: -1, createdAt: -1 }).skip(skip).limit(perPage).select('-__v').lean(),
      UpdateFile.countDocuments({})
    ]);

    return res.status(200).json({
      success: true,
      data: { items: items, page: page, perPage: perPage, total: total, totalPages: Math.max(1, Math.ceil(total / perPage)) }
    });
  } catch (error) {
    console.error('[Admin] List updates error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to list updates.' });
  }
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  getStats,
  listAllScripts,
  listAllSnippets,
  listAllUpdates
};
