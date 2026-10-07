/**
 * Reorder recommendations. This is plain, transparent business logic in
 * Node.js - deliberately separate from the ML model, which only supplies the
 * predicted demand.
 *
 *   Safety Stock     = Z x (std. deviation of daily demand) x sqrt(lead time in days)
 *   Reorder Quantity = Predicted Demand + Safety Stock - Current Stock - On Order
 *   (if the result is negative, the reorder quantity is 0)
 *
 * Z, the lead time and the look-back window are configurable in backend/.env.
 */
const env = require('../config/env');
const Product = require('../models/Product');
const PurchaseOrder = require('../models/PurchaseOrder');
const ApiError = require('../utils/ApiError');
const forecastService = require('./forecastService');
const { demandStats } = require('./demandService');
const { stockStatus } = require('./analyticsService');

const round2 = (n) => Math.round(n * 100) / 100;

function settings() {
  return {
    safetyZ: env.reorder.safetyZ,
    leadTimeDays: env.reorder.leadTimeDays,
    safetyWindowDays: env.reorder.safetyWindowDays,
    formula: 'Reorder Quantity = Predicted Demand + Safety Stock - Current Stock - On Order (minimum 0)',
    safetyStockFormula: 'Safety Stock = Z x standard deviation of daily demand x sqrt(lead time in days)',
  };
}

function buildReason({ p, horizon, forecastAvailable, forecastDemand, safetyStock, onOrder, reorderQuantity }) {
  const parts = [];
  if (p.stock <= 0) parts.push('The product is out of stock.');
  else if (p.stock <= p.minimumStock) parts.push(`Current stock (${p.stock}) is at or below the minimum stock level (${p.minimumStock}).`);

  if (!forecastAvailable) {
    parts.push('No demand forecast is available for this product, so predicted demand is taken as 0.');
  }
  const need = forecastDemand + safetyStock;
  const available = p.stock + onOrder;
  if (reorderQuantity > 0) {
    parts.push(
      `Expected demand for the next ${horizon} days is ${forecastDemand} units; with ${safetyStock} units of safety stock ` +
        `that is ${need} units needed, but only ${available} are available` +
        `${onOrder > 0 ? ` (${p.stock} in stock + ${onOrder} on order)` : ''}. Order ${reorderQuantity} units to cover the gap.`
    );
  } else {
    parts.push(
      `Available stock (${available}${onOrder > 0 ? `, including ${onOrder} on order` : ''}) covers the expected demand of ` +
        `${forecastDemand} units for the next ${horizon} days plus ${safetyStock} units of safety stock, so no order is needed now.`
    );
  }
  return parts.join(' ');
}

async function recommendations({ horizon = 7 } = {}) {
  if (!forecastService.HORIZONS.includes(horizon)) {
    throw ApiError.badRequest(`horizon must be one of: ${forecastService.HORIZONS.join(', ')}`);
  }
  const cfg = settings();

  const [products, totals, { stats }, openOrders, run] = await Promise.all([
    Product.find().sort({ productId: 1 }).populate('supplier', 'supplierId name email phone').lean(),
    forecastService.totalsByProduct(),
    demandStats(cfg.safetyWindowDays),
    PurchaseOrder.aggregate([
      { $match: { status: { $in: ['PENDING', 'ORDERED'] } } },
      { $group: { _id: '$productId', quantity: { $sum: '$quantity' }, orders: { $sum: 1 } } },
    ]),
    forecastService.latestRun(),
  ]);
  const onOrderByProduct = new Map(openOrders.map((o) => [o._id, o]));

  const items = products.map((p) => {
    const forecast = totals.get(p.productId);
    const forecastAvailable = Boolean(forecast);
    const forecastRaw = forecastAvailable ? forecast[horizon] : 0;
    // Whole units: you cannot order a fraction of a product, so round demand up.
    const forecastDemand = Math.ceil(forecastRaw - 1e-9);

    const stat = stats.get(p.productId) || { mean: 0, stdDev: 0 };
    const safetyStock = Math.ceil(cfg.safetyZ * stat.stdDev * Math.sqrt(cfg.leadTimeDays) - 1e-9);

    const onOrder = onOrderByProduct.get(p.productId)?.quantity || 0;
    const reorderQuantity = Math.max(0, forecastDemand + safetyStock - p.stock - onOrder);
    const status = stockStatus(p);

    let priority = 'NONE';
    if (reorderQuantity > 0) {
      if (status === 'OUT') priority = 'CRITICAL';
      else if (status === 'LOW' || p.stock < forecastDemand) priority = 'HIGH';
      else priority = 'MEDIUM';
    }

    return {
      productId: p.productId,
      name: p.name,
      category: p.category,
      price: p.price,
      currentStock: p.stock,
      minimumStock: p.minimumStock,
      stockStatus: status,
      forecastAvailable,
      forecastDemand,
      forecastDemandExact: round2(forecastRaw),
      averageDailyDemand: round2(stat.mean),
      dailyDemandStdDev: round2(stat.stdDev),
      safetyStock,
      onOrder,
      reorderQuantity,
      estimatedCost: round2(reorderQuantity * p.price),
      needsReorder: reorderQuantity > 0,
      priority,
      supplierId: p.supplierId,
      supplierName: p.supplier ? p.supplier.name : null,
      supplierEmail: p.supplier ? p.supplier.email : null,
      supplierPhone: p.supplier ? p.supplier.phone : null,
      calculation: `${forecastDemand} + ${safetyStock} - ${p.stock}${onOrder ? ` - ${onOrder}` : ''} = ${forecastDemand + safetyStock - p.stock - onOrder}`,
      reason: buildReason({ p, horizon, forecastAvailable, forecastDemand, safetyStock, onOrder, reorderQuantity }),
    };
  });

  const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, NONE: 3 };
  items.sort((a, b) => rank[a.priority] - rank[b.priority] || b.reorderQuantity - a.reorderQuantity || a.productId.localeCompare(b.productId));

  const needing = items.filter((i) => i.needsReorder);
  return {
    horizon,
    settings: cfg,
    forecast: {
      available: Boolean(run) && totals.size > 0,
      stale: await forecastService.isStale(run),
      model: run ? run.model : null,
      generatedAt: run ? run.createdAt : null,
      forecastStartDate: run ? run.forecastStartDate : null,
    },
    summary: {
      totalProducts: items.length,
      productsNeedingReorder: needing.length,
      totalUnitsToOrder: needing.reduce((sum, i) => sum + i.reorderQuantity, 0),
      estimatedCost: round2(needing.reduce((sum, i) => sum + i.estimatedCost, 0)),
      critical: needing.filter((i) => i.priority === 'CRITICAL').length,
      high: needing.filter((i) => i.priority === 'HIGH').length,
    },
    items,
  };
}

module.exports = { recommendations, settings };
