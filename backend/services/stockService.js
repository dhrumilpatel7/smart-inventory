/**
 * All code that changes product stock lives here, so stock, sales and
 * inventory transactions can never drift apart.
 */
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const InventoryTransaction = require('../models/InventoryTransaction');
const ApiError = require('../utils/ApiError');
const { runInTransaction } = require('../utils/transaction');
const { nextId } = require('../utils/idGenerator');

const opts = (session) => (session ? { session } : {});

/**
 * Atomically takes `quantity` units out of stock.
 * The filter `stock >= quantity` and the `$inc` happen in ONE database
 * operation, so two simultaneous sales can never drive stock below zero.
 */
async function decreaseStock(productId, quantity, session, compensations) {
  const product = await Product.findOneAndUpdate(
    { productId, stock: { $gte: quantity } },
    { $inc: { stock: -quantity } },
    { new: true, ...opts(session) }
  );
  if (!product) {
    const existing = await Product.findOne({ productId }).session(session);
    if (!existing) throw ApiError.notFound(`Product "${productId}" does not exist`);
    throw ApiError.conflict(
      `Insufficient stock for ${existing.name}: requested ${quantity}, only ${existing.stock} available`,
      { productId, requested: quantity, available: existing.stock }
    );
  }
  compensations.push(() => Product.updateOne({ productId }, { $inc: { stock: quantity } }));
  return product;
}

async function increaseStock(productId, quantity, session, compensations) {
  const product = await Product.findOneAndUpdate(
    { productId },
    { $inc: { stock: quantity } },
    { new: true, ...opts(session) }
  );
  if (!product) throw ApiError.notFound(`Product "${productId}" does not exist`);
  compensations.push(() => Product.updateOne({ productId }, { $inc: { stock: -quantity } }));
  return product;
}

async function createTransactionRecord({ productId, type, quantity, date }, session, compensations) {
  const transactionId = await nextId('transaction', session);
  const [transaction] = await InventoryTransaction.create([{ transactionId, productId, type, quantity, date }], opts(session));
  compensations.push(() => InventoryTransaction.deleteOne({ transactionId }));
  return transaction;
}

/**
 * Records a sale. In one MongoDB transaction:
 *   1. validate the product and check stock
 *   2. decrease products.stock
 *   3. insert the sale (totalAmount = price x quantity)
 *   4. insert an OUT inventory transaction
 * If any step fails, none of them is saved.
 */
async function recordSale({ productId, quantity, saleDate }) {
  return runInTransaction(async (session, compensations) => {
    const product = await decreaseStock(productId, quantity, session, compensations);

    const saleId = await nextId('sale', session);
    const totalAmount = Math.round(product.price * quantity * 100) / 100;
    const [sale] = await Sale.create([{ saleId, productId, quantity, totalAmount, saleDate }], opts(session));
    compensations.push(() => Sale.deleteOne({ saleId }));

    const transaction = await createTransactionRecord({ productId, type: 'OUT', quantity, date: saleDate }, session, compensations);

    return { sale, transaction, product };
  });
}

/**
 * Records a manual stock movement (IN = stock received, OUT = stock removed
 * for a reason other than a sale) and updates products.stock with it.
 */
async function recordMovement({ productId, type, quantity, date }) {
  return runInTransaction(async (session, compensations) => {
    const product = type === 'IN'
      ? await increaseStock(productId, quantity, session, compensations)
      : await decreaseStock(productId, quantity, session, compensations);
    const transaction = await createTransactionRecord({ productId, type, quantity, date }, session, compensations);
    return { transaction, product };
  });
}

module.exports = { recordSale, recordMovement, increaseStock, createTransactionRecord };
