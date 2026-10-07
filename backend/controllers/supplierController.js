const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const PurchaseOrder = require('../models/PurchaseOrder');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { pagination, escapeRegex, pick } = require('../utils/validators');
const { nextId } = require('../utils/idGenerator');
const { supplierAnalytics } = require('../services/analyticsService');

const SORTABLE = ['supplierId', 'name', 'email', 'address', 'productCount'];
const FIELDS = ['name', 'email', 'phone', 'address'];
const normalizeId = (id) => String(id || '').trim().toUpperCase();

// GET /api/suppliers?q=&sort=&order=&page=&limit=
exports.list = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const match = {};
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    match.$or = [{ name: rx }, { supplierId: rx }, { email: rx }, { address: rx }];
  }
  const { page, limit, skip } = pagination(req.query, { defaultLimit: 50 });
  const sortField = SORTABLE.includes(req.query.sort) ? req.query.sort : 'supplierId';
  const sortDir = String(req.query.order).toLowerCase() === 'desc' ? -1 : 1;

  const [rows, total] = await Promise.all([
    Supplier.aggregate([
      { $match: match },
      { $lookup: { from: 'products', localField: 'supplierId', foreignField: 'supplierId', as: 'products' } },
      { $addFields: { productCount: { $size: '$products' } } },
      { $project: { _id: 0, products: 0 } },
      { $sort: { [sortField]: sortDir, supplierId: 1 } },
      { $skip: skip },
      { $limit: limit },
    ]),
    Supplier.countDocuments(match),
  ]);
  res.json({ data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
});

// GET /api/suppliers/analytics
exports.analytics = asyncHandler(async (req, res) => {
  res.json({ data: await supplierAnalytics() });
});

// GET /api/suppliers/:id  - supplier with the products they supply
exports.getOne = asyncHandler(async (req, res) => {
  const supplierId = normalizeId(req.params.id);
  const supplier = await Supplier.findOne({ supplierId }).select('-_id').lean();
  if (!supplier) throw ApiError.notFound(`Supplier "${req.params.id}" not found`);
  const products = await Product.find({ supplierId })
    .sort({ productId: 1 })
    .select('-_id productId name category price stock minimumStock')
    .lean();
  res.json({ data: { ...supplier, productCount: products.length, products } });
});

// POST /api/suppliers
exports.create = asyncHandler(async (req, res) => {
  const body = pick(req.body, ['supplierId', ...FIELDS]);
  if (body.supplierId) {
    body.supplierId = normalizeId(body.supplierId);
    if (await Supplier.exists({ supplierId: body.supplierId })) {
      throw ApiError.conflict(`A supplier with supplierId "${body.supplierId}" already exists`);
    }
  } else {
    body.supplierId = await nextId('supplier');
  }
  const supplier = await Supplier.create(body);
  const { _id, ...data } = supplier.toObject();
  res.status(201).json({ data: { ...data, productCount: 0 } });
});

// PUT /api/suppliers/:id
exports.update = asyncHandler(async (req, res) => {
  const supplierId = normalizeId(req.params.id);
  const supplier = await Supplier.findOne({ supplierId });
  if (!supplier) throw ApiError.notFound(`Supplier "${req.params.id}" not found`);
  if (req.body && req.body.supplierId && normalizeId(req.body.supplierId) !== supplierId) {
    throw ApiError.badRequest('supplierId cannot be changed');
  }
  supplier.set(pick(req.body, FIELDS));
  await supplier.save();
  const { _id, ...data } = supplier.toObject();
  res.json({ data: { ...data, productCount: await Product.countDocuments({ supplierId }) } });
});

// DELETE /api/suppliers/:id   (admin only)
exports.remove = asyncHandler(async (req, res) => {
  const supplierId = normalizeId(req.params.id);
  const supplier = await Supplier.findOne({ supplierId });
  if (!supplier) throw ApiError.notFound(`Supplier "${req.params.id}" not found`);
  const [products, orders] = await Promise.all([
    Product.countDocuments({ supplierId }),
    PurchaseOrder.countDocuments({ supplierId }),
  ]);
  if (products || orders) {
    throw ApiError.conflict(
      `${supplier.name} cannot be deleted because ${products} product(s) and ${orders} purchase order(s) are linked to it. Reassign the products first.`,
      { products, purchaseOrders: orders }
    );
  }
  await supplier.deleteOne();
  res.json({ message: `Supplier ${supplierId} deleted` });
});
