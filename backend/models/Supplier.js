const mongoose = require('mongoose');

// Mirrors suppliers.csv: supplierId,name,email,phone,address
const supplierSchema = new mongoose.Schema(
  {
    supplierId: {
      type: String,
      required: [true, 'supplierId is required'],
      unique: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9_-]{2,20}$/, 'supplierId may contain only letters, digits, "-" and "_"'],
    },
    name: { type: String, required: [true, 'Supplier name is required'], trim: true, maxlength: 120 },
    email: {
      type: String,
      required: [true, 'Supplier email is required'],
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Supplier email is not valid'],
    },
    phone: {
      type: String,
      required: [true, 'Supplier phone is required'],
      trim: true,
      match: [/^[0-9+\-\s()]{7,20}$/, 'Supplier phone is not valid'],
    },
    address: { type: String, required: [true, 'Supplier address is required'], trim: true, maxlength: 250 },
  },
  { collection: 'suppliers', versionKey: false }
);

supplierSchema.index({ name: 1 });

module.exports = mongoose.model('Supplier', supplierSchema);
