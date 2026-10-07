const mongoose = require('mongoose');

// Mirrors sales.csv: saleId,productId,quantity,totalAmount,saleDate
const saleSchema = new mongoose.Schema(
  {
    saleId: { type: String, required: [true, 'saleId is required'], unique: true, trim: true, uppercase: true },
    productId: { type: String, required: [true, 'productId is required'], trim: true, uppercase: true },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      validate: { validator: Number.isInteger, message: 'Quantity must be a whole number' },
    },
    totalAmount: {
      type: Number,
      required: [true, 'totalAmount is required'],
      min: [0, 'totalAmount cannot be negative'],
    },
    saleDate: { type: Date, required: [true, 'saleDate is required'] },
  },
  { collection: 'sales', versionKey: false }
);

saleSchema.index({ saleDate: -1 });
// Daily demand per product (forecasting) and "sales of product X in range" queries.
saleSchema.index({ productId: 1, saleDate: 1 });

module.exports = mongoose.model('Sale', saleSchema);
