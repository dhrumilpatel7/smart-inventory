const router = require('express').Router();
const mongoose = require('mongoose');
const { authenticate } = require('../middleware/auth');
const { supportsTransactions } = require('../config/db');
const { dashboard } = require('../controllers/dashboardController');
const { reorder } = require('../controllers/forecastController');
const inventoryRoutes = require('./inventoryRoutes');

// Public
router.get('/health', (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: connected ? 'ok' : 'database unavailable',
    database: connected ? 'connected' : 'disconnected',
    transactions: supportsTransactions(),
    time: new Date().toISOString(),
  });
});
router.use('/auth', require('./authRoutes'));

// Everything below requires a valid JWT.
router.use(authenticate);
router.get('/dashboard', dashboard);
router.use('/products', require('./productRoutes'));
router.use('/suppliers', require('./supplierRoutes'));
router.use('/sales', require('./saleRoutes'));
router.use('/inventory-transactions', inventoryRoutes.transactions);
router.use('/inventory', inventoryRoutes.inventory);
router.use('/forecasts', require('./forecastRoutes'));
router.get('/reorder', reorder);
router.use('/purchase-orders', require('./purchaseOrderRoutes'));

module.exports = router;
