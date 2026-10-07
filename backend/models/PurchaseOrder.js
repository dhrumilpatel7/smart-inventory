const mongoose = require('mongoose');

const PO_STATUSES = ['PENDING', 'ORDERED', 'RECEIVED', 'CANCELLED'];

// Created from reorder recommendations. Receiving an order adds stock and
// writes an IN inventory transaction.
const purchaseOrderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    productId: { type: String, required: [true, 'productId is required'], trim: true, uppercase: true },
    supplierId: { type: String, required: [true, 'supplierId is required'], trim: true, uppercase: true },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      validate: { validator: Number.isInteger, message: 'Quantity must be a whole number' },
    },
    status: { type: String, enum: PO_STATUSES, default: 'PENDING' },
    note: { type: String, trim: true, maxlength: 300 },
    receivedAt: Date,
  },
  { collection: 'purchase_orders', timestamps: true, versionKey: false }
);

purchaseOrderSchema.index({ productId: 1, status: 1 });
purchaseOrderSchema.index({ supplierId: 1 });
purchaseOrderSchema.index({ status: 1, createdAt: -1 });

const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);
PurchaseOrder.PO_STATUSES = PO_STATUSES;
module.exports = PurchaseOrder;
