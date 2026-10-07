const express = require('express');
const controller = require('../controllers/inventoryController');

// /api/inventory-transactions
const transactions = express.Router();
transactions.get('/', controller.list);
transactions.get('/:id', controller.getOne);
transactions.post('/', controller.create);

// /api/inventory
const inventory = express.Router();
inventory.get('/analytics', controller.analytics);

module.exports = { transactions, inventory };
