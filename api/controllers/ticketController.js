'use strict';

const { generateToken, generateTicketNumber, isValidEmail } = require('../utils/helpers');

/**
 * POST /api/tickets/create
 * Public (guest). Creates a new support ticket with embedded first message.
 *
 * Body:
 *   name, email, whatsapp?, subject, description, category, priority
 */
async function createTicket(req, res) {
  try {
    const db = req.app.get('db');
    const Ticket = db.model('Ticket');

    const body = req.body || {};
    const name = (body.name || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const subject = (body.subject || '').trim();
    const description = (body.description || '').trim();
    const category = (body.category || 'general').trim();
    const priority = (body.priority || 'medium').trim();
    const whatsapp = (body.whatsapp || '').trim();

    if (!name || !email || !subject || !description) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, subject and description are required.'
      });
    }
    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ success: false, message: 'Name must be 2-80 characters.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format.' });
    }
    if (subject.length < 5 || subject.length > 200) {
      return res.status(400).json({ success: false, message: 'Subject must be 5-200 characters.' });
    }
    if (description.length < 10 || description.length > 5000) {
      return res.status(400).json({ success: false, message: 'Description must be 10-5000 characters.' });
    }

    // Generate unique ticket number (loop until collision-free)
    let ticketNumber;
    let attempts = 0;
    while (true) {
      ticketNumber = generateTicketNumber();
      const exists = await Ticket.findOne({ ticketNumber: ticketNumber }).select('_id').lean();
      if (!exists) break;
      attempts += 1;
      if (attempts > 10) {
        ticketNumber = 'TKN-' + Date.now().toString(36).toUpperCase();
        break;
      }
    }

    const accessToken = generateToken(40);
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';

    const ticket = await Ticket.create({
      ticketNumber: ticketNumber,
      subject: subject,
      description: description,
      category: category,
      priority: priority,
      status: 'open',
      name: name,
      email: email,
      whatsapp: whatsapp,
      accessToken: accessToken,
      createdIp: ip,
      createdUserAgent: ua,
      messages: [
        {
          sender: 'user',
          senderName: name,
          message: description
        }
      ]
    });

    return res.status(201).json({
      success: true,
      message: 'Ticket created successfully.',
      data: {
        id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        accessToken: accessToken,
        status: ticket.status
      }
    });
  } catch (error) {
    console.error('[Tickets] Create error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to create ticket.' });
  }
}

/**
 * GET /api/tickets/mine
 * Public. Returns all tickets matching a given email (with access token for security).
 *
 * Query: email (required), accessToken (required for each ticket verification),
 *        OR verify per ticket via /api/tickets/:id
 *
 * For simplicity, this route returns all tickets for an email — the user must
 * prove ownership by accessing individual tickets via their access token.
 */
async function listMyTickets(req, res) {
  try {
    const db = req.app.get('db');
    const Ticket = db.model('Ticket');
    const email = (req.query.email || '').trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email.' });
    }

    const tickets = await Ticket.find({ email: email })
      .sort({ createdAt: -1 })
      .select('-messages -accessToken -__v -createdIp -createdUserAgent')
      .lean();

    return res.status(200).json({ success: true, data: tickets });
  } catch (error) {
    console.error('[Tickets] List mine error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch tickets.' });
  }
}

/**
 * GET /api/tickets/:ticketNumber
 * Public if access token matches. Admin can fetch any ticket without token.
 *
 * Query: token (access token, required for non-admin requests)
 */
async function getTicket(req, res) {
  try {
    const db = req.app.get('db');
    const Ticket = db.model('Ticket');
    const ticketNumber = (req.params.ticketNumber || '').toUpperCase().trim();

    const ticket = await Ticket.findOne({ ticketNumber: ticketNumber })
      .select('-createdIp -createdUserAgent -__v')
      .lean();

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found.' });
    }

    const isAdmin = !!req.user;
    const token = (req.query.token || req.headers['x-ticket-token'] || '').trim();

    if (!isAdmin) {
      if (!token || token !== ticket.accessToken) {
        return res.status(403).json({ success: false, message: 'Invalid or missing access token.' });
      }
    }

    // Strip access token from response unless explicitly requested by admin
    if (!isAdmin) {
      delete ticket.accessToken;
    }

    return res.status(200).json({ success: true, data: ticket });
  } catch (error) {
    console.error('[Tickets] Get error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch ticket.' });
  }
}

/**
 * POST /api/tickets/:ticketNumber/reply
 * Public if access token matches. Admin can reply to any ticket.
 *
 * Body: message, (token required for non-admin), senderName?
 */
async function replyTicket(req, res) {
  try {
    const db = req.app.get('db');
    const Ticket = db.model('Ticket');
    const ticketNumber = (req.params.ticketNumber || '').toUpperCase().trim();

    const body = req.body || {};
    const message = (body.message || '').trim();

    if (!message || message.length < 1 || message.length > 5000) {
      return res.status(400).json({ success: false, message: 'Message must be 1-5000 characters.' });
    }

    const ticket = await Ticket.findOne({ ticketNumber: ticketNumber });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found.' });
    }

    const isAdmin = !!req.user;
    const token = (body.token || req.headers['x-ticket-token'] || '').trim();

    if (!isAdmin) {
      if (!token || token !== ticket.accessToken) {
        return res.status(403).json({ success: false, message: 'Invalid or missing access token.' });
      }
    }

    // If user replies and ticket was closed/resolved, reopen it
    let statusChanged = false;
    if (!isAdmin && (ticket.status === 'resolved' || ticket.status === 'closed')) {
      ticket.status = 'in-progress';
      statusChanged = true;
    }
    // If admin replies and ticket was open, mark in-progress
    if (isAdmin && ticket.status === 'open') {
      ticket.status = 'in-progress';
      statusChanged = true;
    }

    ticket.messages.push({
      sender: isAdmin ? 'admin' : 'user',
      senderName: isAdmin ? (req.user.username || 'Admin') : (ticket.name || 'User'),
      message: message
    });

    await ticket.save();

    return res.status(200).json({
      success: true,
      message: 'Reply added.',
      data: {
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        statusChanged: statusChanged,
        messageCount: ticket.messages.length
      }
    });
  } catch (error) {
    console.error('[Tickets] Reply error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to add reply.' });
  }
}

/**
 * PUT /api/tickets/:ticketNumber/status
 * Admin only. Changes ticket status.
 *
 * Body: status, internalNote?
 */
async function updateTicketStatus(req, res) {
  try {
    const db = req.app.get('db');
    const Ticket = db.model('Ticket');
    const ticketNumber = (req.params.ticketNumber || '').toUpperCase().trim();
    const body = req.body || {};
    const status = (body.status || '').trim();
    const internalNote = (body.internalNote || '').trim();

    const validStatuses = ['open', 'in-progress', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }

    const ticket = await Ticket.findOne({ ticketNumber: ticketNumber });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found.' });
    }

    const oldStatus = ticket.status;
    ticket.status = status;
    if (status === 'resolved' && !ticket.resolvedAt) ticket.resolvedAt = new Date();
    if (status === 'closed' && !ticket.closedAt) ticket.closedAt = new Date();
    if (status === 'open' || status === 'in-progress') {
      ticket.resolvedAt = null;
      ticket.closedAt = null;
    }
    if (internalNote) {
      ticket.messages.push({
        sender: 'system',
        senderName: req.user.username || 'Admin',
        message: '[Status changed from ' + oldStatus + ' to ' + status + '] ' + internalNote
      });
    }
    ticket.assignedTo = ticket.assignedTo || req.user.username;

    await ticket.save();

    return res.status(200).json({
      success: true,
      message: 'Ticket status updated.',
      data: { ticketNumber: ticket.ticketNumber, oldStatus: oldStatus, newStatus: status }
    });
  } catch (error) {
    console.error('[Tickets] Status update error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update ticket status.' });
  }
}

/**
 * GET /api/tickets/admin/list
 * Admin only. Returns all tickets, filterable and paginated.
 *
 * Query: page, perPage, status, category, priority, q (subject/email/name search)
 */
async function adminListTickets(req, res) {
  try {
    const db = req.app.get('db');
    const Ticket = db.model('Ticket');

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(50, Math.max(1, parseInt(req.query.perPage, 10) || 20));
    const status = (req.query.status || '').trim();
    const category = (req.query.category || '').trim();
    const priority = (req.query.priority || '').trim();
    const q = (req.query.q || '').trim();

    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;
    if (q) {
      filter.$or = [
        { subject: { $regex: escapeRegex(q), $options: 'i' } },
        { email: { $regex: escapeRegex(q), $options: 'i' } },
        { name: { $regex: escapeRegex(q), $options: 'i' } },
        { ticketNumber: { $regex: escapeRegex(q), $options: 'i' } }
      ];
    }

    const skip = (page - 1) * perPage;
    const [items, total] = await Promise.all([
      Ticket.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .select('-messages -accessToken -__v -createdIp -createdUserAgent')
        .lean(),
      Ticket.countDocuments(filter)
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
    console.error('[Tickets] Admin list error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch tickets.' });
  }
}

/**
 * DELETE /api/tickets/:ticketNumber
 * Admin only. Hard-deletes a ticket.
 */
async function deleteTicket(req, res) {
  try {
    const db = req.app.get('db');
    const Ticket = db.model('Ticket');
    const ticketNumber = (req.params.ticketNumber || '').toUpperCase().trim();

    const result = await Ticket.deleteOne({ ticketNumber: ticketNumber });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found.' });
    }
    return res.status(200).json({ success: true, message: 'Ticket deleted.' });
  } catch (error) {
    console.error('[Tickets] Delete error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete ticket.' });
  }
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  createTicket,
  listMyTickets,
  getTicket,
  replyTicket,
  updateTicketStatus,
  adminListTickets,
  deleteTicket
};
