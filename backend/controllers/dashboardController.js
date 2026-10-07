const asyncHandler = require('../utils/asyncHandler');
const Supplier = require('../models/Supplier');
const analytics = require('../services/analyticsService');
const forecastService = require('../services/forecastService');

// GET /api/dashboard  - everything the dashboard shows, computed live from MongoDB.
exports.dashboard = asyncHandler(async (req, res) => {
  const [stock, sales, supplierCount, range, salesByMonth, salesByCategory, productsByCategory, movement, movementByMonth, lowStock, topProducts, demand] =
    await Promise.all([
      analytics.inventorySummary(),
      analytics.salesTotals(),
      Supplier.countDocuments(),
      analytics.dataRange(),
      analytics.salesByPeriod({}, 'month'),
      analytics.salesByCategory(),
      analytics.productsByCategory(),
      analytics.movementTotals(),
      analytics.movementByPeriod({}, 'month'),
      analytics.lowStockProducts(),
      analytics.salesByProduct({}, 5),
      forecastService.totalDemandSeries({ historyDays: 60, horizon: 30 }),
    ]);

  res.json({
    generatedAt: new Date().toISOString(),
    dataRange: range,
    cards: {
      totalProducts: stock.totalProducts,
      totalSuppliers: supplierCount,
      totalSalesAmount: sales.revenue,
      totalSalesCount: sales.orders,
      totalUnitsSold: sales.units,
      lowStockItems: stock.lowStock,
      outOfStockItems: stock.outOfStock,
      inventoryValue: stock.inventoryValue,
      totalStockUnits: stock.totalStockUnits,
    },
    salesByMonth,
    salesByCategory,
    productsByCategory,
    inventoryMovement: { totals: movement, byMonth: movementByMonth },
    lowStockProducts: lowStock,
    topProducts,
    demand,
  });
});
