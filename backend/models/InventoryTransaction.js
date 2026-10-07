const mongoose = require('mongoose');

const TRANSACTION_TYPES = ['IN', 'OUT'];

// Mirrors inventory_transactions.csv: transactionId,productId,type,quantity,date
const inventoryTransactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: [true, 'transactionId is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    productId: { type: String, required: [true, 'productId is required'], trim: true, uppercase: true },
    type: {
      type: String,
      required: [true, 'Transaction type is required'],
      enum: { values: TRANSACTION_TYPES, message: 'Transaction type must be IN or OUT' },
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      validate: { validator: Number.isInteger, message: 'Quantity must be a whole number' },
    },
    date: { type: Date, required: [true, 'date is required'] },
  },
  { collection: 'inventory_transactions', versionKey: false }
);

inventoryTransactionSchema.index({ date: -1 });
inventoryTransactionSchema.index({ productId: 1, date: -1 });
inventoryTransactionSchema.index({ type: 1, date: -1 });

const InventoryTransaction = mongoose.model('InventoryTransaction', inventoryTransactionSchema);
InventoryTransaction.TRANSACTION_TYPES = TRANSACTION_TYPES;
module.exports = InventoryTransaction;
