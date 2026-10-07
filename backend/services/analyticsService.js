/**
 * Every number on the dashboard and analytics pages is computed here with
 * MongoDB aggregation pipelines - nothing is hard-coded.
 */
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const Sale = require('../models/Sale');
const InventoryTransaction = require('../models/InventoryTransaction');
const { toDateString } = require('../utils/validators');

const round2 = (n) => Math.round((n || 0) * 100) / 100;

// Mongo expression that buckets a date field by day / week (Monday start) / month.
function periodExpr(field, groupBy) {
  if (groupBy === 'month') return { $dateToString: { format: '%Y-%m', date: `$${field}` } };
  if (groupBy === 'week') {
    return {
      $dateToString: {
        format: '%Y-%m-%d',
        date: { $dateTrunc: { date: `$${field}`, unit: 'week', startOfWeek: 'monday' } },
      },
    };
  }
  return { $dateToString: { format: '%Y-%m-%d', date: `$${field}` } };
}

const normalizeGroupBy = (value, fallback = 'day') => (['day', 'week', 'month'].includes(value) ? value : fallback);

// Stock status rules used everywhere: OUT (stock = 0), LOW (0 < stock <= minimumStock), OK.
const LOW_STOCK_EXPR = { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$minimumStock'] }] };
function stockStatus(product) {
  if (product.stock <= 0) return 'OUT';
  if (product.stock <= product.minimumStock) return 'LOW';
  return 'OK';
}

async function dataRange() {
  const [row] = await Sale.aggregate([{ $group: { _id: null, from: { $min: '$saleDate' }, to: { $max: '$saleDate' } } }]);
  return row ? { from: toDateString(row.from), to: toDateString(row.to) } : { from: null, to: null };
}

async function salesTotals(match = {}) {
  const [row] = await Sale.aggregate([
    { $match: match },
    { $group: { _id: null, revenue: { $sum: '$totalAmount' }, units: { $sum: '$quantity' }, orders: { $sum: 1 } } },
  ]);
  const totals = row || { revenue: 0, units: 0, orders: 0 };
  return {
    revenue: round2(totals.revenue),
    units: totals.units,
    orders: totals.orders,
    averageOrderValue: totals.orders ? round2(totals.revenue / totals.orders) : 0,
  };
}

async function salesByPeriod(match = {}, groupBy = 'day') {
  const rows = await Sale.aggregate([
    { $match: match },
    { $group: { _id: periodExpr('saleDate', groupBy), revenue: { $sum: '$totalAmount' }, units: { $sum: '$quantity' }, orders: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ period: r._id, revenue: round2(r.revenue), units: r.units, orders: r.orders }));
}

async function salesByProduct(match = {}, limit = 0) {
  const pipeline = [
    { $match: match },
    { $group: { _id: '$productId', revenue: { $sum: '$totalAmount' }, units: { $sum: '$quantity' }, orders: { $sum: 1 } } },
    { $lookup: { from: 'products', localField: '_id', foreignField: 'productId', as: 'product' } },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    { $sort: { units: -1, _id: 1 } },
  ];
  if (limit) pipeline.push({ $limit: limit });
  const rows = await Sale.aggregate(pipeline);
  return rows.map((r) => ({
    productId: r._id,
    name: r.product ? r.product.name : '(deleted product)',
    category: r.product ? r.product.category : null,
    revenue: round2(r.revenue),
    units: r.units,
    orders: r.orders,
  }));
}

async function salesByCategory(match = {}) {
  const rows = await Sale.aggregate([
    { $match: match },
    { $lookup: { from: 'products', localField: 'productId', foreignField: 'productId', as: 'product' } },
    { $unwind: '$product' },
    { $group: { _id: '$product.category', revenue: { $sum: '$totalAmount' }, units: { $sum: '$quantity' }, orders: { $sum: 1 } } },
    { $sort: { revenue: -1 } },
  ]);
  return rows.map((r) => ({ category: r._id, revenue: round2(r.revenue), units: r.units, orders: r.orders }));
}

async function salesByWeekday(match = {}) {
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const rows = await Sale.aggregate([
    { $match: match },
    { $group: { _id: { $dayOfWeek: '$saleDate' }, revenue: { $sum: '$totalAmount' }, units: { $sum: '$quantity' }, days: { $addToSet: '$saleDate' } } },
  ]);
  const byDay = new Map(rows.map((r) => [r._id, r]));
  // Monday first.
  return [2, 3, 4, 5, 6, 7, 1].map((d) => {
    const r = byDay.get(d);
    const dayCount = r ? r.days.length : 0;
    return {
      weekday: names[d - 1],
      units: r ? r.units : 0,
      revenue: r ? round2(r.revenue) : 0,
      averageUnitsPerDay: dayCount ? round2(r.units / dayCount) : 0,
    };
  });
}

async function inventorySummary() {
  const [row] = await Product.aggregate([
    {
      $group: {
        _id: null,
        totalProducts: { $sum: 1 },
        totalStockUnits: { $sum: '$stock' },
        inventoryValue: { $sum: { $multiply: ['$stock', '$price'] } },
        outOfStock: { $sum: { $cond: [{ $lte: ['$stock', 0] }, 1, 0] } },
        lowStock: { $sum: { $cond: [LOW_STOCK_EXPR, 1, 0] } },
      },
    },
  ]);
  const s = row || { totalProducts: 0, totalStockUnits: 0, inventoryValue: 0, outOfStock: 0, lowStock: 0 };
  return {
    totalProducts: s.totalProducts,
    totalStockUnits: s.totalStockUnits,
    inventoryValue: round2(s.inventoryValue),
    outOfStock: s.outOfStock,
    lowStock: s.lowStock,
    healthy: s.totalProducts - s.outOfStock - s.lowStock,
  };
}

async function productsByCategory() {
  const rows = await Product.aggregate([
    {
      $group: {
        _id: '$category',
        products: { $sum: 1 },
        stockUnits: { $sum: '$stock' },
        stockValue: { $sum: { $multiply: ['$stock', '$price'] } },
        lowOrOut: { $sum: { $cond: [{ $lte: ['$stock', '$minimumStock'] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ category: r._id, products: r.products, stockUnits: r.stockUnits, stockValue: round2(r.stockValue), lowOrOut: r.lowOrOut }));
}

// Products that are out of stock or at/below their minimum, most urgent first.
async function lowStockProducts() {
  const products = await Product.find({ $expr: { $lte: ['$stock', '$minimumStock'] } })
    .populate('supplier', 'supplierId name')
    .lean();
  return products
    .map((p) => ({
      productId: p.productId,
      name: p.name,
      category: p.category,
      stock: p.stock,
      minimumStock: p.minimumStock,
      shortfall: p.minimumStock - p.stock,
      supplierId: p.supplierId,
      supplierName: p.supplier ? p.supplier.name : null,
      status: stockStatus(p),
    }))
    .sort((a, b) => a.stock / Math.max(a.minimumStock, 1) - b.stock / Math.max(b.minimumStock, 1));
}

async function movementTotals(match = {}) {
  const rows = await InventoryTransaction.aggregate([
    { $match: match },
    { $group: { _id: '$type', units: { $sum: '$quantity' }, transactions: { $sum: 1 } } },
  ]);
  const get = (type) => rows.find((r) => r._id === type) || { units: 0, transactions: 0 };
  const inRow = get('IN');
  const outRow = get('OUT');
  return {
    inUnits: inRow.units,
    outUnits: outRow.units,
    inTransactions: inRow.transactions,
    outTransactions: outRow.transactions,
    netUnits: inRow.units - outRow.units,
    totalTransactions: inRow.transactions + outRow.transactions,
  };
}

async function movementByPeriod(match = {}, groupBy = 'month') {
  const rows = await InventoryTransaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: periodExpr('date', groupBy),
        inUnits: { $sum: { $cond: [{ $eq: ['$type', 'IN'] }, '$quantity', 0] } },
        outUnits: { $sum: { $cond: [{ $eq: ['$type', 'OUT'] }, '$quantity', 0] } },
        transactions: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ period: r._id, inUnits: r.inUnits, outUnits: r.outUnits, netUnits: r.inUnits - r.outUnits, transactions: r.transactions }));
}

async function movementByProduct(match = {}) {
  const rows = await InventoryTransaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$productId',
        inUnits: { $sum: { $cond: [{ $eq: ['$type', 'IN'] }, '$quantity', 0] } },
        outUnits: { $sum: { $cond: [{ $eq: ['$type', 'OUT'] }, '$quantity', 0] } },
        transactions: { $sum: 1 },
      },
    },
    { $lookup: { from: 'products', localField: '_id', foreignField: 'productId', as: 'product' } },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    { $sort: { outUnits: -1, _id: 1 } },
  ]);
  return rows.map((r) => ({
    productId: r._id,
    name: r.product ? r.product.name : '(deleted product)',
    category: r.product ? r.product.category : null,
    currentStock: r.product ? r.product.stock : null,
    inUnits: r.inUnits,
    outUnits: r.outUnits,
    netUnits: r.inUnits - r.outUnits,
    transactions: r.transactions,
  }));
}

// One row per supplier: how many products they supply, stock held, and sales of their products.
async function supplierAnalytics() {
  const rows = await Supplier.aggregate([
    { $lookup: { from: 'products', localField: 'supplierId', foreignField: 'supplierId', as: 'products' } },
    {
      $project: {
        _id: 0,
        supplierId: 1,
        name: 1,
        address: 1,
        productCount: { $size: '$products' },
        categories: { $setUnion: ['$products.category', []] },
        stockUnits: { $sum: '$products.stock' },
        stockValue: { $sum: { $map: { input: '$products', as: 'p', in: { $multiply: ['$$p.stock', '$$p.price'] } } } },
        lowOrOut: {
          $size: { $filter: { input: '$products', as: 'p', cond: { $lte: ['$$p.stock', '$$p.minimumStock'] } } },
        },
        products: { $map: { input: '$products', as: 'p', in: { productId: '$$p.productId', name: '$$p.name', category: '$$p.category', stock: '$$p.stock', minimumStock: '$$p.minimumStock' } } },
      },
    },
    { $sort: { supplierId: 1 } },
  ]);
  const sales = await Sale.aggregate([
    { $lookup: { from: 'products', localField: 'productId', foreignField: 'productId', as: 'product' } },
    { $unwind: '$product' },
    { $group: { _id: '$product.supplierId', revenue: { $sum: '$totalAmount' }, units: { $sum: '$quantity' } } },
  ]);
  const salesBySupplier = new Map(sales.map((s) => [s._id, s]));
  return rows.map((r) => ({
    ...r,
    stockValue: round2(r.stockValue),
    unitsSold: salesBySupplier.get(r.supplierId)?.units || 0,
    revenue: round2(salesBySupplier.get(r.supplierId)?.revenue || 0),
  }));
}

async function salesAnalytics({ match = {}, groupBy = 'day' } = {}) {
  const [totals, byPeriod, byProduct, byCategory, byWeekday, range] = await Promise.all([
    salesTotals(match),
    salesByPeriod(match, groupBy),
    salesByProduct(match),
    salesByCategory(match),
    salesByWeekday(match),
    dataRange(),
  ]);
  return {
    dataRange: range,
    groupBy,
    totals,
    byPeriod,
    byProduct,
    byCategory,
    byWeekday,
    topProducts: byProduct.slice(0, 10),
    slowestProducts: byProduct.slice(-5).reverse(),
  };
}

async function inventoryAnalytics({ match = {}, groupBy = 'month' } = {}) {
  const [summary, totals, byPeriod, byProduct, byCategory, lowStock, suppliers] = await Promise.all([
    inventorySummary(),
    movementTotals(match),
    movementByPeriod(match, groupBy),
    movementByProduct(match),
    productsByCategory(),
    lowStockProducts(),
    supplierAnalytics(),
  ]);
  return {
    groupBy,
    stock: summary,
    movement: totals,
    movementByPeriod: byPeriod,
    movementByProduct: byProduct,
    byCategory,
    lowStockProducts: lowStock,
    suppliers: suppliers.map(({ products, ...rest }) => rest),
  };
}

module.exports = {
  normalizeGroupBy,
  stockStatus,
  dataRange,
  salesTotals,
  salesByPeriod,
  salesByProduct,
  salesByCategory,
  inventorySummary,
  productsByCategory,
  lowStockProducts,
  movementTotals,
  movementByPeriod,
  supplierAnalytics,
  salesAnalytics,
  inventoryAnalytics,
};
