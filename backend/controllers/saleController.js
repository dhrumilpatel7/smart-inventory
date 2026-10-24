const Sale = require('../models/Sale');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { pagination, sortSpec, dateRange, parseDate, positiveInt, requireString, toDateString } = require('../utils/validators');
const { recordSale } = require('../services/stockService');
const analytics = require('../services/analyticsService');
const n8nAlertService = require('../services/n8nAlertService');

const SORTABLE = ['saleId', 'productId', 'quantity', 'totalAmount', 'saleDate'];

async function withProductNames(sales) {
  const ids = [...new Set(sales.map((s) => s.productId))];
  const products = await Product.find({ productId: { $in: ids } }).select('productId name category').lean();
  const byId = new Map(products.map((p) => [p.productId, p]));
  return sales.map((s) => ({
    saleId: s.saleId,
    productId: s.productId,
    productName: byId.get(s.productId)?.name || null,
    category: byId.get(s.productId)?.category || null,
    quantity: s.quantity,
    totalAmount: s.totalAmount,
    saleDate: toDateString(s.saleDate),
  }));
}

// GET /api/sales?productId=&from=&to=&sort=&order=&page=&limit=
exports.list = asyncHandler(async (req, res) => {
  const filter = { ...dateRange(req.query, 'saleDate') };
  if (req.query.productId) filter.productId = String(req.query.productId).trim().toUpperCase();
  const { page, limit, skip } = pagination(req.query, { defaultLimit: 25 });
  const sort = sortSpec(req.query, SORTABLE, { field: 'saleDate', dir: -1 }, 'saleId');

  const [sales, total, totals] = await Promise.all([
    Sale.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Sale.countDocuments(filter),
    analytics.salesTotals(filter),
  ]);
  res.json({
    data: await withProductNames(sales),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    totals,
  });
});

// GET /api/sales/analytics?from=&to=&groupBy=day|week|month
exports.analytics = asyncHandler(async (req, res) => {
  const match = dateRange(req.query, 'saleDate');
  if (req.query.productId) match.productId = String(req.query.productId).trim().toUpperCase();
  res.json(await analytics.salesAnalytics({ match, groupBy: analytics.normalizeGroupBy(req.query.groupBy, 'day') }));
});

// GET /api/sales/:id
exports.getOne = asyncHandler(async (req, res) => {
  const sale = await Sale.findOne({ saleId: String(req.params.id).trim().toUpperCase() }).lean();
  if (!sale) throw ApiError.notFound(`Sale "${req.params.id}" not found`);
  const [data] = await withProductNames([sale]);
  res.json({ data });
});

// POST /api/sales   body: { productId, quantity, saleDate? }
// totalAmount is calculated on the server as price x quantity.
exports.create = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const productId = requireString(body.productId, 'productId', { max: 20 }).toUpperCase();
  const quantity = positiveInt(body.quantity, 'quantity');
  const today = new Date(`${toDateString(new Date())}T00:00:00.000Z`);
  const saleDate = parseDate(body.saleDate, 'saleDate') || today;
  // One day of tolerance for time zones ahead of UTC.
  if (saleDate.getTime() > today.getTime() + 24 * 60 * 60 * 1000) {
    throw ApiError.badRequest('saleDate cannot be in the future');
  }

  const { sale, transaction, product } = await recordSale({ productId, quantity, saleDate });
  n8nAlertService.checkInBackground();
  res.status(201).json({
    message: `Sale recorded. Stock of ${product.name} is now ${product.stock}.`,
    data: {
      saleId: sale.saleId,
      productId: sale.productId,
      productName: product.name,
      quantity: sale.quantity,
      totalAmount: sale.totalAmount,
      saleDate: toDateString(sale.saleDate),
    },
    inventoryTransaction: {
      transactionId: transaction.transactionId,
      productId: transaction.productId,
      type: transaction.type,
      quantity: transaction.quantity,
      date: toDateString(transaction.date),
    },
    product: { productId: product.productId, name: product.name, stock: product.stock, minimumStock: product.minimumStock },
  });
});
