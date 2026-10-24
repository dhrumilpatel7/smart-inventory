const InventoryTransaction = require('../models/InventoryTransaction');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { pagination, sortSpec, dateRange, parseDate, positiveInt, requireString, toDateString } = require('../utils/validators');
const { recordMovement } = require('../services/stockService');
const analytics = require('../services/analyticsService');
const n8nAlertService = require('../services/n8nAlertService');

const SORTABLE = ['transactionId', 'productId', 'type', 'quantity', 'date'];
const { TRANSACTION_TYPES } = InventoryTransaction;

function buildFilter(query) {
  const filter = { ...dateRange(query, 'date') };
  if (query.productId) filter.productId = String(query.productId).trim().toUpperCase();
  if (query.type) {
    const type = String(query.type).trim().toUpperCase();
    if (!TRANSACTION_TYPES.includes(type)) throw ApiError.badRequest('type must be IN or OUT');
    filter.type = type;
  }
  return filter;
}

const present = (t, names) => ({
  transactionId: t.transactionId,
  productId: t.productId,
  productName: names.get(t.productId) || null,
  type: t.type,
  quantity: t.quantity,
  date: toDateString(t.date),
});

// GET /api/inventory-transactions?productId=&type=IN|OUT&from=&to=&sort=&order=&page=&limit=
exports.list = asyncHandler(async (req, res) => {
  const filter = buildFilter(req.query);
  const { page, limit, skip } = pagination(req.query, { defaultLimit: 25 });
  const sort = sortSpec(req.query, SORTABLE, { field: 'date', dir: -1 }, 'transactionId');

  const [rows, total, summary] = await Promise.all([
    InventoryTransaction.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    InventoryTransaction.countDocuments(filter),
    analytics.movementTotals(filter),
  ]);
  const products = await Product.find({ productId: { $in: [...new Set(rows.map((r) => r.productId))] } }).select('productId name').lean();
  const names = new Map(products.map((p) => [p.productId, p.name]));
  res.json({
    data: rows.map((t) => present(t, names)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    summary,
  });
});

// GET /api/inventory-transactions/:id
exports.getOne = asyncHandler(async (req, res) => {
  const t = await InventoryTransaction.findOne({ transactionId: String(req.params.id).trim().toUpperCase() }).lean();
  if (!t) throw ApiError.notFound(`Inventory transaction "${req.params.id}" not found`);
  const product = await Product.findOne({ productId: t.productId }).select('productId name').lean();
  res.json({ data: present(t, new Map(product ? [[product.productId, product.name]] : [])) });
});

// POST /api/inventory-transactions   body: { productId, type: IN|OUT, quantity, date? }
// Updates products.stock and writes the transaction atomically.
exports.create = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const productId = requireString(body.productId, 'productId', { max: 20 }).toUpperCase();
  const type = String(body.type || '').trim().toUpperCase();
  if (!TRANSACTION_TYPES.includes(type)) throw ApiError.badRequest('type must be IN or OUT');
  const quantity = positiveInt(body.quantity, 'quantity');
  const today = new Date(`${toDateString(new Date())}T00:00:00.000Z`);
  const date = parseDate(body.date, 'date') || today;
  if (date.getTime() > today.getTime() + 24 * 60 * 60 * 1000) throw ApiError.badRequest('date cannot be in the future');

  const { transaction, product } = await recordMovement({ productId, type, quantity, date });
  n8nAlertService.checkInBackground();
  res.status(201).json({
    message: `Stock ${type === 'IN' ? 'added' : 'removed'}. Stock of ${product.name} is now ${product.stock}.`,
    data: present(transaction, new Map([[product.productId, product.name]])),
    product: { productId: product.productId, name: product.name, stock: product.stock, minimumStock: product.minimumStock },
  });
});

// GET /api/inventory/analytics?from=&to=&groupBy=day|week|month
exports.analytics = asyncHandler(async (req, res) => {
  const match = buildFilter(req.query);
  res.json(await analytics.inventoryAnalytics({ match, groupBy: analytics.normalizeGroupBy(req.query.groupBy, 'month') }));
});
