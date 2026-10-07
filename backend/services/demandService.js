/**
 * Historical daily demand (units sold per day), computed from the sales
 * collection. Shared by the forecast, reorder and dashboard code.
 *
 * "Trading days" are the dates on which at least one sale (of any product) was
 * recorded. A product with no sale on a trading day has demand 0 for that day.
 * The current day is left out because it is not finished yet (its sales so far
 * are not a full day of demand). These are the same rules the Python pipeline uses.
 */
const Sale = require('../models/Sale');
const { toDateString } = require('../utils/validators');

// All finished trading days, oldest first, as "YYYY-MM-DD" strings.
async function tradingDays() {
  const today = new Date(`${toDateString(new Date())}T00:00:00.000Z`);
  const rows = await Sale.aggregate([
    { $match: { saleDate: { $lt: today } } },
    { $group: { _id: '$saleDate' } },
    { $sort: { _id: 1 } },
  ]);
  return [...new Set(rows.map((r) => toDateString(r._id)))];
}

// Sale-date filter for "from the first day of the window up to (not including) today".
function windowMatch(window) {
  return {
    $gte: new Date(`${window[0]}T00:00:00.000Z`),
    $lt: new Date(`${toDateString(new Date())}T00:00:00.000Z`),
  };
}

// Units sold per day for one product (or for all products together when productId is null).
// Returns [{ date, units }] for the last `days` trading days, zero-filled.
async function dailyDemand({ productId = null, days = 60 } = {}) {
  const all = await tradingDays();
  const window = all.slice(-days);
  if (!window.length) return [];
  const match = { saleDate: windowMatch(window) };
  if (productId) match.productId = productId;
  const rows = await Sale.aggregate([
    { $match: match },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } }, units: { $sum: '$quantity' } } },
  ]);
  const byDate = new Map(rows.map((r) => [r._id, r.units]));
  return window.map((date) => ({ date, units: byDate.get(date) || 0 }));
}

// Per-product demand statistics over the last `days` trading days:
// Map(productId -> { mean, stdDev, total, days })
async function demandStats(days) {
  const all = await tradingDays();
  const window = all.slice(-days);
  const stats = new Map();
  if (!window.length) return { stats, window };
  const rows = await Sale.aggregate([
    { $match: { saleDate: windowMatch(window) } },
    {
      $group: {
        _id: { productId: '$productId', date: { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } } },
        units: { $sum: '$quantity' },
      },
    },
    { $group: { _id: '$_id.productId', values: { $push: '$units' } } },
  ]);
  const n = window.length;
  for (const row of rows) {
    // Days without a sale are zeros and must be counted in the mean and deviation.
    const values = row.values.concat(new Array(Math.max(0, n - row.values.length)).fill(0));
    const total = values.reduce((a, b) => a + b, 0);
    const mean = total / n;
    const variance = n > 1 ? values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (n - 1) : 0;
    stats.set(row._id, { mean, stdDev: Math.sqrt(variance), total, days: n });
  }
  return { stats, window };
}

module.exports = { tradingDays, dailyDemand, demandStats };
