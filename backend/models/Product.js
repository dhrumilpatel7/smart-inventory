const mongoose = require('mongoose');

const wholeNumber = { validator: Number.isInteger, message: '{PATH} must be a whole number' };

// Mirrors products.csv: productId,name,category,price,stock,minimumStock,supplierId
const productSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      required: [true, 'productId is required'],
      unique: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9_-]{2,20}$/, 'productId may contain only letters, digits, "-" and "_"'],
    },
    name: { type: String, required: [true, 'Product name is required'], trim: true, maxlength: 120 },
    category: { type: String, required: [true, 'Category is required'], trim: true, maxlength: 60 },
    price: { type: Number, required: [true, 'Price is required'], min: [0, 'Price cannot be negative'] },
    stock: {
      type: Number,
      required: [true, 'Stock is required'],
      min: [0, 'Stock cannot be negative'],
      validate: wholeNumber,
    },
    minimumStock: {
      type: Number,
      required: [true, 'Minimum stock is required'],
      min: [0, 'Minimum stock cannot be negative'],
      validate: wholeNumber,
    },
    // Business key of the supplier (suppliers.supplierId), exactly as in the CSV.
    supplierId: { type: String, required: [true, 'supplierId is required'], trim: true, uppercase: true },
  },
  {
    collection: 'products',
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

productSchema.index({ supplierId: 1 });
productSchema.index({ category: 1, name: 1 });
productSchema.index({ stock: 1 });
productSchema.index({ name: 1 });

// products.supplierId -> suppliers.supplierId
productSchema.virtual('supplier', {
  ref: 'Supplier',
  localField: 'supplierId',
  foreignField: 'supplierId',
  justOne: true,
});

module.exports = mongoose.model('Product', productSchema);
