const Counter = require('../models/Counter');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const Sale = require('../models/Sale');
const InventoryTransaction = require('../models/InventoryTransaction');
const PurchaseOrder = require('../models/PurchaseOrder');

// Business ID formats, matching the CSV datasets (P001, S001, SALE00001, T00001).
const SEQUENCES = {
  product: { model: Product, field: 'productId', prefix: 'P', pad: 3 },
  supplier: { model: Supplier, field: 'supplierId', prefix: 'S', pad: 3 },
  sale: { model: Sale, field: 'saleId', prefix: 'SALE', pad: 5 },
  transaction: { model: InventoryTransaction, field: 'transactionId', prefix: 'T', pad: 5 },
  purchaseOrder: { model: PurchaseOrder, field: 'orderId', prefix: 'PO', pad: 5 },
};

const format = (name, n) => `${SEQUENCES[name].prefix}${String(n).padStart(SEQUENCES[name].pad, '0')}`;

// Highest numeric suffix currently stored for a sequence (0 if none).
async function currentMax(name) {
  const { model, field, prefix } = SEQUENCES[name];
  const [row] = await model.aggregate([
    { $match: { [field]: { $regex: `^${prefix}\\d+$` } } },
    {
      $project: {
        n: { $convert: { input: { $substrCP: [`$${field}`, prefix.length, 20] }, to: 'long', onError: 0, onNull: 0 } },
      },
    },
    { $group: { _id: null, max: { $max: '$n' } } },
  ]);
  return row ? Number(row.max) : 0;
}

// Makes every counter at least as large as the highest ID in its collection.
// Called at server start and after a CSV import.
async function syncCounters() {
  const result = {};
  for (const name of Object.keys(SEQUENCES)) {
    const max = await currentMax(name);
    const doc = await Counter.findOneAndUpdate(
      { _id: name },
      { $max: { seq: max } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    result[name] = doc.seq;
  }
  return result;
}

// Atomically reserves and returns the next ID of a sequence.
async function nextId(name, session = null) {
  const { model, field } = SEQUENCES[name];
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const doc = await Counter.findOneAndUpdate(
      { _id: name },
      { $inc: { seq: 1 } },
      { upsert: true, new: true, session }
    );
    const id = format(name, doc.seq);
    // Guards against IDs that were typed in manually (e.g. a product created as "P031").
    const taken = await model.exists({ [field]: id }).session(session);
    if (!taken) return id;
  }
  throw new Error(`Could not generate a unique ID for ${name}`);
}

module.exports = { nextId, syncCounters, SEQUENCES };
