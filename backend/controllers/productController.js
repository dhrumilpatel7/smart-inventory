const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const Sale = require('../models/Sale');
const InventoryTransaction = require('../models/InventoryTransaction');
const PurchaseOrder = require('../models/PurchaseOrder');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { pagination, sortSpec, escapeRegex, pick } = require('../utils/validators');
const { nextId } = require('../utils/idGenerator');
const { stockStatus } = require('../services/analyticsService');

const SORTABLE = ['productId', 'name', 'category', 'price', 'stock', 'minimumStock', 'supplierId'];
const normalizeId = (id) => String(id || '').trim().toUpperCase();

function present(product) {
  return {
    productId: product.productId,
    name: product.name,
    category: product.category,
    price: product.price,
    stock: product.stock,
    minimumStock: product.minimumStock,
    supplierId: product.supplierId,
    supplier: product.supplier ? { supplierId: product.supplier.supplierId, name: product.supplier.name } : null,
    stockStatus: stockStatus(product),
  };
}

async function assertSupplierExists(supplierId) {
  if (!supplierId) throw ApiError.badRequest('supplierId is required');
  if (!(await Supplier.exists({ supplierId }))) {
    throw ApiError.badRequest(`Supplier "${supplierId}" does not exist. Create the supplier first.`);
  }
}

// GET /api/products?q=&category=&supplierId=&stockStatus=low|out|ok&sort=&order=&page=&limit=
exports.list = asyncHandler(async (req, res) => {
  const { q, category, supplierId, stockStatus: status } = req.query;
  const filter = {};
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { productId: rx }, { category: rx }];
  }
  if (category) filter.category = category;
  if (supplierId) filter.supplierId = normalizeId(supplierId);
  if (status) {
    if (status === 'out') filter.stock = { $lte: 0 };
    else if (status === 'low') filter.$expr = { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$minimumStock'] }] };
    else if (status === 'ok') filter.$expr = { $gt: ['$stock', '$minimumStock'] };
    else if (status === 'attention') filter.$expr = { $lte: ['$stock', '$minimumStock'] };
    else throw ApiError.badRequest('stockStatus must be one of: low, out, ok, attention');
  }

  const { page, limit, skip } = pagination(req.query, { defaultLimit: 50 });
  const sort = sortSpec(req.query, SORTABLE, { field: 'productId', dir: 1 }, 'productId');
  const [items, total] = await Promise.all([
    Product.find(filter).sort(sort).skip(skip).limit(limit).populate('supplier', 'supplierId name').lean(),
    Product.countDocuments(filter),
  ]);
  res.json({ data: items.map(present), pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
});

// GET /api/products/categories
exports.categories = asyncHandler(async (req, res) => {
  const categories = await Product.distinct('category');
  res.json({ data: categories.sort() });
});

// GET /api/products/:id
exports.getOne = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ productId: normalizeId(req.params.id) })
    .populate('supplier', 'supplierId name email phone address')
    .lean();
  if (!product) throw ApiError.notFound(`Product "${req.params.id}" not found`);
  res.json({ data: { ...present(product), supplier: product.supplier ? { ...product.supplier, _id: undefined } : null } });
});

// POST /api/products
exports.create = asyncHandler(async (req, res) => {
  const body = pick(req.body, ['productId', 'name', 'category', 'price', 'stock', 'minimumStock', 'supplierId']);
  body.supplierId = normalizeId(body.supplierId);
  await assertSupplierExists(body.supplierId);

  if (body.productId) {
    body.productId = normalizeId(body.productId);
    if (await Product.exists({ productId: body.productId })) {
      throw ApiError.conflict(`A product with productId "${body.productId}" already exists`);
    }
  } else {
    body.productId = await nextId('product');
  }
  const created = await Product.create(body);
  const product = await Product.findById(created._id).populate('supplier', 'supplierId name').lean();
  res.status(201).json({ data: present(product) });
});

// PUT /api/products/:id
// Stock is NOT editable here: it only changes through sales, inventory
// transactions and received purchase orders, so that every change has a record.
exports.update = asyncHandler(async (req, res) => {
  const productId = normalizeId(req.params.id);
  const product = await Product.findOne({ productId });
  if (!product) throw ApiError.notFound(`Product "${req.params.id}" not found`);

  const body = pick(req.body, ['name', 'category', 'price', 'minimumStock', 'supplierId']);
  if (req.body && req.body.productId && normalizeId(req.body.productId) !== productId) {
    throw ApiError.badRequest('productId cannot be changed');
  }
  if (req.body && req.body.stock !== undefined && Number(req.body.stock) !== product.stock) {
    throw ApiError.badRequest('Stock cannot be edited directly. Record an inventory transaction (IN/OUT) instead.');
  }
  if (body.supplierId !== undefined) {
    body.supplierId = normalizeId(body.supplierId);
    await assertSupplierExists(body.supplierId);
  }
  product.set(body);
  await product.save();
  const updated = await Product.findById(product._id).populate('supplier', 'supplierId name').lean();
  res.json({ data: present(updated) });
});

// DELETE /api/products/:id   (admin only)
exports.remove = asyncHandler(async (req, res) => {
  const productId = normalizeId(req.params.id);
  const product = await Product.findOne({ productId });
  if (!product) throw ApiError.notFound(`Product "${req.params.id}" not found`);

  // Referential integrity: never leave sales / transactions pointing at a missing product.
  const [sales, transactions, orders] = await Promise.all([
    Sale.countDocuments({ productId }),
    InventoryTransaction.countDocuments({ productId }),
    PurchaseOrder.countDocuments({ productId }),
  ]);
  if (sales || transactions || orders) {
    throw ApiError.conflict(
      `${product.name} cannot be deleted because it has history: ${sales} sale(s), ${transactions} inventory transaction(s), ${orders} purchase order(s).`,
      { sales, transactions, purchaseOrders: orders }
    );
  }
  await product.deleteOne();
  res.json({ message: `Product ${productId} deleted` });
});
