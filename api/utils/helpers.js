'use strict';

/**
 * Convert a string into a URL-safe slug.
 * "Hello World! v2.0" -> "hello-world-v2-0"
 */
function slugify(input) {
  if (!input) return '';
  return String(input)
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')   // remove non-alphanumeric except space/hyphen
    .replace(/\s+/g, '-')            // collapse whitespace -> single hyphen
    .replace(/-+/g, '-')             // collapse multiple hyphens
    .replace(/^-+|-+$/g, '');        // trim leading/trailing hyphens
}

/**
 * Generate a unique slug by appending a short suffix if the slug already exists.
 * @param {mongoose.Model} Model - the mongoose model to check against
 * @param {string} base - the desired slug base
 * @param {string=} excludeId - an optional document id to exclude from the conflict check
 * @returns {Promise<string>} a unique slug
 */
async function uniqueSlug(Model, base, excludeId) {
  const slug = slugify(base) || 'untitled-' + Date.now().toString(36);
  let candidate = slug;
  let counter = 1;
  while (true) {
    const query = { slug: candidate };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await Model.findOne(query).select('_id').lean();
    if (!existing) return candidate;
    counter += 1;
    candidate = slug + '-' + counter;
    if (counter > 1000) {
      return slug + '-' + Date.now().toString(36);
    }
  }
}

/**
 * Generate a random alphanumeric token of given length.
 */
function generateToken(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < (length || 32); i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

/**
 * Generate a human-readable ticket number like "TKN-2026-AB12CD".
 */
function generateTicketNumber() {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return 'TKN-' + year + '-' + rand.padEnd(6, 'X');
}

/**
 * Basic email format validation.
 */
function isValidEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase());
}

/**
 * Escape HTML in a string to prevent XSS when interpolating user content.
 */
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build a pagination object from a Mongoose query result.
 */
function paginate(arr, page, perPage, total) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  return {
    items: arr,
    total: total,
    perPage: perPage,
    currentPage: currentPage,
    totalPages: totalPages,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1
  };
}

module.exports = {
  slugify,
  uniqueSlug,
  generateToken,
  generateTicketNumber,
  isValidEmail,
  escapeHTML,
  paginate
};
