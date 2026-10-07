// Small request-validation helpers shared by controllers.
const ApiError = require('./ApiError');

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Parses "YYYY-MM-DD" (or a full ISO string) to a Date. Date-only values become
// UTC midnight, which is how every date in the CSV datasets is stored.
function parseDate(value, field = 'date') {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' && !(value instanceof Date)) {
    throw ApiError.badRequest(`${field} must be a date (YYYY-MM-DD)`);
  }
  const d = value instanceof Date ? value : new Date(DATE_ONLY.test(value) ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(d.getTime())) throw ApiError.badRequest(`${field} must be a valid date (YYYY-MM-DD)`);
  if (typeof value === 'string' && DATE_ONLY.test(value) && d.toISOString().slice(0, 10) !== value) {
    throw ApiError.badRequest(`${field} is not a real calendar date`);
  }
  return d;
}

// Builds a { $gte, $lte } filter from ?from=&to= query params (inclusive of the whole "to" day).
function dateRange(query, field = 'date') {
  const from = parseDate(query.from, 'from');
  const to = parseDate(query.to, 'to');
  if (from && to && from > to) throw ApiError.badRequest('"from" date must not be after "to" date');
  const range = {};
  if (from) range.$gte = from;
  if (to) {
    const end = new Date(to);
    if (typeof query.to === 'string' && DATE_ONLY.test(query.to)) end.setUTCHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return Object.keys(range).length ? { [field]: range } : {};
}

function positiveInt(value, field) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
    throw ApiError.badRequest(`${field} must be a whole number greater than 0`);
  }
  return n;
}

function pagination(query, { defaultLimit = 20, maxLimit = 200 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

// Converts ?sort=field&order=asc|desc into a Mongo sort object, allowing only whitelisted fields.
// `tiebreak` (a unique field) keeps the order stable when many rows share the same sort value.
function sortSpec(query, allowed, fallback, tiebreak) {
  const requested = allowed.includes(query.sort);
  const field = requested ? query.sort : fallback.field;
  const dir = requested ? (String(query.order).toLowerCase() === 'desc' ? -1 : 1) : fallback.dir;
  const sort = { [field]: dir };
  if (tiebreak && tiebreak !== field) sort[tiebreak] = dir;
  return sort;
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function requireString(value, field, { max = 200 } = {}) {
  if (typeof value !== 'string' || !value.trim()) throw ApiError.badRequest(`${field} is required`);
  if (value.trim().length > max) throw ApiError.badRequest(`${field} is too long (max ${max} characters)`);
  return value.trim();
}

// Picks only whitelisted keys from a request body (prevents mass assignment).
function pick(body, keys) {
  const out = {};
  for (const k of keys) if (body && body[k] !== undefined) out[k] = body[k];
  return out;
}

const toDateString = (d) => new Date(d).toISOString().slice(0, 10);

module.exports = { parseDate, dateRange, positiveInt, pagination, sortSpec, escapeRegex, requireString, pick, toDateString };
