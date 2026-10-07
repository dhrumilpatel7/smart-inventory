/**
 * Read-only health check of the database:  npm run verify
 * Prints collection counts, checks referential integrity, duplicate IDs and indexes.
 * Exits with code 1 if any check fails.
 */
const { connectDB, disconnectDB, supportsTransactions } = require('../config/db');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const InventoryTransaction = require('../models/InventoryTransaction');
const Forecast = require('../models/Forecast');
const PurchaseOrder = require('../models/PurchaseOrder');
const User = require('../models/User');

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` - ${detail}` : ''}`);
};

async function duplicates(Model, field) {
  const rows = await Model.aggregate([
    { $group: { _id: `$${field}`, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $count: 'duplicates' },
  ]);
  return rows.length ? rows[0].duplicates : 0;
}

async function orphans(Model, field, validIds) {
  return Model.countDocuments({ [field]: { $nin: validIds } });
}

(async () => {
  try {
    await connectDB();
    console.log(`Database: ${Sale.db.name}`);
    console.log(`Transactions supported (replica set): ${supportsTransactions()}\n`);

    console.log('Collection counts');
    const counts = {
      suppliers: await Supplier.countDocuments(),
      products: await Product.countDocuments(),
      sales: await Sale.countDocuments(),
      inventory_transactions: await InventoryTransaction.countDocuments(),
      forecasts: await Forecast.countDocuments(),
      purchase_orders: await PurchaseOrder.countDocuments(),
      users: await User.countDocuments(),
    };
    for (const [name, n] of Object.entries(counts)) console.log(`  ${name.padEnd(24)} ${n}`);

    console.log('\nRelationships');
    const supplierIds = await Supplier.distinct('supplierId');
    const productIds = await Product.distinct('productId');
    const o1 = await orphans(Product, 'supplierId', supplierIds);
    const o2 = await orphans(Sale, 'productId', productIds);
    const o3 = await orphans(InventoryTransaction, 'productId', productIds);
    check(o1 === 0, 'every product.supplierId exists in suppliers', `${o1} orphan(s)`);
    check(o2 === 0, 'every sale.productId exists in products', `${o2} orphan(s)`);
    check(o3 === 0, 'every inventory_transaction.productId exists in products', `${o3} orphan(s)`);

    console.log('\nDuplicate stable IDs');
    for (const [Model, field] of [[Supplier, 'supplierId'], [Product, 'productId'], [Sale, 'saleId'], [InventoryTransaction, 'transactionId']]) {
      const d = await duplicates(Model, field);
      check(d === 0, `${field} is unique`, `${d} duplicated value(s)`);
    }

    console.log('\nData sanity');
    const negative = await Product.countDocuments({ $or: [{ stock: { $lt: 0 } }, { price: { $lt: 0 } }] });
    check(negative === 0, 'no negative stock or price', `${negative} product(s)`);
    const [range] = await Sale.aggregate([{ $group: { _id: null, min: { $min: '$saleDate' }, max: { $max: '$saleDate' } } }]);
    if (range) console.log(`  sales date range: ${range.min.toISOString().slice(0, 10)} -> ${range.max.toISOString().slice(0, 10)}`);

    console.log('\nIndexes');
    for (const Model of [Supplier, Product, Sale, InventoryTransaction, Forecast, PurchaseOrder, User]) {
      const indexes = await Model.collection.indexes();
      const text = indexes
        .map((ix) => `${Object.keys(ix.key).join('+')}${ix.unique ? ' (unique)' : ''}`)
        .join(', ');
      console.log(`  ${Model.collection.name.padEnd(24)} ${text}`);
    }
    const has = async (Model, key, unique) =>
      (await Model.collection.indexes()).some((ix) => Object.keys(ix.key).join('+') === key && (!unique || ix.unique));
    check(await has(Supplier, 'supplierId', true), 'unique index on suppliers.supplierId');
    check(await has(Product, 'productId', true), 'unique index on products.productId');
    check(await has(Sale, 'saleId', true), 'unique index on sales.saleId');
    check(await has(InventoryTransaction, 'transactionId', true), 'unique index on inventory_transactions.transactionId');
    check(await has(Sale, 'productId+saleDate'), 'compound index on sales (productId, saleDate)');
    check(await has(InventoryTransaction, 'productId+date'), 'compound index on inventory_transactions (productId, date)');

    console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
    if (failures) process.exitCode = 1;
  } catch (err) {
    console.error('Verification failed:', err.message);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
})();
