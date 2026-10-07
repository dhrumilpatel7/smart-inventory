const mongoose = require('mongoose');

// One document per ID sequence (sale, transaction, product, supplier, purchaseOrder).
// Used to generate the next stable business ID, e.g. SALE04801.
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String },
    seq: { type: Number, required: true, default: 0 },
  },
  { collection: 'counters', versionKey: false }
);

module.exports = mongoose.model('Counter', counterSchema);
