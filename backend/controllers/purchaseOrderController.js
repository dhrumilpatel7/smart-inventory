const PurchaseOrder = require('../models/PurchaseOrder');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { pagination, positiveInt, requireString, toDateString } = require('../utils/validators');
const { nextId } = require('../utils/idGenerator');
const { runInTransaction } = require('../utils/transaction');
const { increaseStock, createTransactionRecord } = require('../services/stockService');

const { PO_STATUSES } = PurchaseOrder;
// Allowed status changes. RECEIVED and CANCELLED are final.
const TRANSITIONS = {
  PENDING: ['ORDERED', 'RECEIVED', 'CANCELLED'],
  ORDERED: ['RECEIVED', 'CANCELLED'],
  RECEIVED: [],
  CANCELLED: [],
};

async function present(orders) {
  const [products, suppliers] = await Promise.all([
    Product.find({ productId: { $in: orders.map((o) => o.productId) } }).select('productId name price').lean(),
    Supplier.find({ supplierId: { $in: orders.map((o) => o.supplierId) } }).select('supplierId name').lean(),
  ]);
  const p = new Map(products.map((x) => [x.productId, x]));
  const s = new Map(suppliers.map((x) => [x.supplierId, x]));
  return orders.map((o) => ({
    orderId: o.orderId,
    productId: o.productId,
    productName: p.get(o.productId)?.name || null,
    supplierId: o.supplierId,
    supplierName: s.get(o.supplierId)?.name || null,
    quantity: o.quantity,
    estimatedCost: p.get(o.productId) ? Math.round(p.get(o.productId).price * o.quantity * 100) / 100 : null,
    status: o.status,
    note: o.note || '',
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    receivedAt: o.receivedAt || null,
    allowedStatuses: TRANSITIONS[o.status],
  }));
}

// GET /api/purchase-orders?status=&productId=&page=&limit=
exports.list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) {
    const status = String(req.query.status).toUpperCase();
    if (!PO_STATUSES.includes(status)) throw ApiError.badRequest(`status must be one of: ${PO_STATUSES.join(', ')}`);
    filter.status = status;
  }
  if (req.query.productId) filter.productId = String(req.query.productId).trim().toUpperCase();
  const { page, limit, skip } = pagination(req.query, { defaultLimit: 50 });
  const [orders, total] = await Promise.all([
    PurchaseOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PurchaseOrder.countDocuments(filter),
  ]);
  res.json({ data: await present(orders), pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
});

// POST /api/purchase-orders   body: { productId, quantity, note? }
// The supplier is taken from the product, so an order can never point at the wrong supplier.
exports.create = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const productId = requireString(body.productId, 'productId', { max: 20 }).toUpperCase();
  const quantity = positiveInt(body.quantity, 'quantity');
  const product = await Product.findOne({ productId }).lean();
  if (!product) throw ApiError.notFound(`Product "${productId}" does not exist`);
  if (!(await Supplier.exists({ supplierId: product.supplierId }))) {
    throw ApiError.badRequest(`Supplier "${product.supplierId}" of this product does not exist`);
  }
  const order = await PurchaseOrder.create({
    orderId: await nextId('purchaseOrder'),
    productId,
    supplierId: product.supplierId,
    quantity,
    note: typeof body.note === 'string' ? body.note : undefined,
  });
  const [data] = await present([order.toObject()]);
  res.status(201).json({ message: `Purchase order ${order.orderId} created`, data });
});

// PATCH /api/purchase-orders/:id/status   body: { status }
// Marking an order RECEIVED adds the quantity to stock and writes an IN transaction.
exports.updateStatus = asyncHandler(async (req, res) => {
  const orderId = String(req.params.id).trim().toUpperCase();
  const status = String((req.body || {}).status || '').toUpperCase();
  if (!PO_STATUSES.includes(status)) throw ApiError.badRequest(`status must be one of: ${PO_STATUSES.join(', ')}`);

  const order = await PurchaseOrder.findOne({ orderId }).lean();
  if (!order) throw ApiError.notFound(`Purchase order "${req.params.id}" not found`);
  if (!TRANSITIONS[order.status].includes(status)) {
    throw ApiError.conflict(`A ${order.status} order cannot be changed to ${status}`);
  }

  const result = await runInTransaction(async (session, compensations) => {
    const o = session ? { session } : {};
    // Filtering on the old status makes the change happen at most once, even with two clicks at the same time.
    const updated = await PurchaseOrder.findOneAndUpdate(
      { orderId, status: order.status },
      { $set: { status, ...(status === 'RECEIVED' ? { receivedAt: new Date() } : {}) } },
      { new: true, ...o }
    ).lean();
    if (!updated) throw ApiError.conflict('This purchase order was changed by someone else. Refresh and try again.');
    compensations.push(() => PurchaseOrder.updateOne({ orderId }, { $set: { status: order.status }, $unset: { receivedAt: '' } }));

    let product = null;
    let transaction = null;
    if (status === 'RECEIVED') {
      product = await increaseStock(order.productId, order.quantity, session, compensations);
      const today = new Date(`${toDateString(new Date())}T00:00:00.000Z`);
      transaction = await createTransactionRecord(
        { productId: order.productId, type: 'IN', quantity: order.quantity, date: today },
        session,
        compensations
      );
    }
    return { updated, product, transaction };
  });

  const [data] = await present([result.updated]);
  res.json({
    message: status === 'RECEIVED'
      ? `Order received. Stock of ${result.product.name} is now ${result.product.stock}.`
      : `Purchase order ${orderId} is now ${status}`,
    data,
    inventoryTransaction: result.transaction
      ? { transactionId: result.transaction.transactionId, type: 'IN', quantity: result.transaction.quantity }
      : null,
  });
});
