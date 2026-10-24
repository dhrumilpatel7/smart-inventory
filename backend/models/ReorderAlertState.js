const mongoose = require('mongoose');

const reorderAlertStateSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true, unique: true, index: true },
    priority: { type: String, enum: ['NONE', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'NONE', required: true },
    pendingAlert: { type: mongoose.Schema.Types.Mixed, default: null },
    lastAlertedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReorderAlertState', reorderAlertStateSchema);
