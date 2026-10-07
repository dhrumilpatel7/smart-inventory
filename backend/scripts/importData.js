/**
 * Imports the four CSV datasets into MongoDB.
 *
 *   npm run import            # add missing records, never duplicate or overwrite
 *   npm run import:reset      # wipe app data first, then import (clean demo state)
 *   node scripts/importData.js --dir /path/to/csv/folder
 *
 * Safety rules:
 *  - Stable IDs from the CSVs are the keys. A record whose ID already exists in
 *    MongoDB is SKIPPED (not duplicated, not overwritten), so re-running the
 *    import never resets stock that the application has since changed.
 *  - Every row is validated with the Mongoose schema.
 *  - Relationships are checked: product -> supplier, sale -> product,
 *    inventory transaction -> product. Orphans are rejected and reported.
 *  - Nothing is silently dropped: every rejected row is listed with its reason.
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { connectDB, disconnectDB } = require('../config/db');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const InventoryTransaction = require('../models/InventoryTransaction');
const Forecast = require('../models/Forecast');
const ForecastRun = require('../models/ForecastRun');
const PurchaseOrder = require('../models/PurchaseOrder');
const Counter = require('../models/Counter');
const { syncCounters } = require('../utils/idGenerator');
const { ensureAdminUser } = require('../services/authService');

const args = process.argv.slice(2);
const RESET = args.includes('--reset');
const dirArg = args.indexOf('--dir');
const DATA_DIR = dirArg !== -1 && args[dirArg + 1]
  ? path.resolve(args[dirArg + 1])
  : path.join(__dirname, '..', '..', 'data');

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function toNumber(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function toDate(raw) {
  const text = String(raw || '').trim();
  if (!DATE_ONLY.test(text)) return undefined;
  const d = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text ? undefined : d;
}

function readCsv(file, expectedColumns) {
  const fullPath = path.join(DATA_DIR, file);
  if (!fs.existsSync(fullPath)) throw new Error(`CSV file not found: ${fullPath}`);
  const rows = parse(fs.readFileSync(fullPath), { columns: true, skip_empty_lines: true, trim: true, bom: true });
  const actual = rows.length ? Object.keys(rows[0]) : [];
  const missing = expectedColumns.filter((c) => !actual.includes(c));
  if (rows.length && missing.length) {
    throw new Error(`${file} is missing column(s): ${missing.join(', ')} (found: ${actual.join(', ')})`);
  }
  return rows;
}

/**
 * Validates and inserts one dataset.
 *   toDoc(row)      -> plain object for the Mongoose model (or throws)
 *   checkRefs(doc)  -> string describing a broken relationship, or null
 */
async function importDataset({ label, file, columns, Model, idField, toDoc, checkRefs }) {
  const stats = { file, read: 0, inserted: 0, skippedExisting: 0, invalid: 0, errors: [] };
  const rows = readCsv(file, columns);
  stats.read = rows.length;

  const reject = (line, id, reason) => {
    stats.invalid += 1;
    stats.errors.push({ line, id: id || '(no id)', reason });
  };

  const seen = new Set();
  const valid = [];
  rows.forEach((row, i) => {
    const line = i + 2; // +1 for header, +1 because lines are 1-based
    let doc;
    try {
      doc = toDoc(row);
    } catch (err) {
      return reject(line, row[idField], err.message);
    }
    const id = doc[idField];
    const validationError = new Model(doc).validateSync();
    if (validationError) {
      const reason = Object.values(validationError.errors).map((e) => e.message).join('; ');
      return reject(line, id, reason);
    }
    const normalizedId = String(id).trim().toUpperCase();
    if (seen.has(normalizedId)) return reject(line, id, `duplicate ${idField} inside ${file}`);
    const refProblem = checkRefs ? checkRefs(doc) : null;
    if (refProblem) return reject(line, id, refProblem);
    seen.add(normalizedId);
    valid.push({ ...doc, [idField]: normalizedId });
    return undefined;
  });

  // Upsert with $setOnInsert: inserts when the ID is new, does nothing when it exists.
  const BATCH = 1000;
  for (let i = 0; i < valid.length; i += BATCH) {
    const ops = valid.slice(i, i + BATCH).map((doc) => ({
      updateOne: { filter: { [idField]: doc[idField] }, update: { $setOnInsert: doc }, upsert: true },
    }));
    const result = await Model.bulkWrite(ops, { ordered: false });
    stats.inserted += result.upsertedCount;
    stats.skippedExisting += result.matchedCount;
  }
  stats.totalInDatabase = await Model.countDocuments();
  console.log(
    `${label.padEnd(24)} read ${String(stats.read).padStart(5)} | inserted ${String(stats.inserted).padStart(5)}` +
      ` | already existed ${String(stats.skippedExisting).padStart(5)} | invalid ${String(stats.invalid).padStart(3)}` +
      ` | now in DB ${stats.totalInDatabase}`
  );
  return { stats, ids: seen };
}

async function main() {
  console.log(`CSV folder : ${DATA_DIR}`);
  await connectDB();
  console.log(`Database   : ${Sale.db.name}${RESET ? '   (--reset: existing app data will be deleted)' : ''}\n`);

  if (RESET) {
    await Promise.all(
      [Supplier, Product, Sale, InventoryTransaction, Forecast, ForecastRun, PurchaseOrder, Counter].map((M) =>
        M.deleteMany({})
      )
    );
  }
  // Make sure unique indexes exist and drop any obsolete indexes from earlier schemas.
  await Promise.all(
    [Supplier, Product, Sale, InventoryTransaction, Forecast, ForecastRun, PurchaseOrder].map(async (M) => {
      await M.init();
      try {
        await M.syncIndexes();
      } catch (err) {
        // collection might be newly created
      }
    })
  );

  // Proactively drop any legacy 'sku' index if present in products collection
  try {
    const pIndexes = await Product.collection.indexes();
    for (const idx of pIndexes) {
      if (idx.name === 'sku_1' || (idx.key && idx.key.sku !== undefined)) {
        console.log(`Dropping obsolete index "${idx.name}" from products collection...`);
        await Product.collection.dropIndex(idx.name);
      }
    }
  } catch (err) {
    // collection might not exist yet
  }

  const all = [];

  const suppliers = await importDataset({
    label: 'suppliers',
    file: 'suppliers.csv',
    columns: ['supplierId', 'name', 'email', 'phone', 'address'],
    Model: Supplier,
    idField: 'supplierId',
    toDoc: (r) => ({ supplierId: r.supplierId, name: r.name, email: r.email, phone: r.phone, address: r.address }),
  });
  all.push(suppliers.stats);
  // Relationship checks use what is actually in MongoDB after each step.
  const supplierIds = new Set(await Supplier.distinct('supplierId'));

  const products = await importDataset({
    label: 'products',
    file: 'products.csv',
    columns: ['productId', 'name', 'category', 'price', 'stock', 'minimumStock', 'supplierId'],
    Model: Product,
    idField: 'productId',
    toDoc: (r) => ({
      productId: r.productId,
      name: r.name,
      category: r.category,
      price: toNumber(r.price),
      stock: toNumber(r.stock),
      minimumStock: toNumber(r.minimumStock),
      supplierId: String(r.supplierId || '').trim().toUpperCase(),
    }),
    checkRefs: (d) => (supplierIds.has(d.supplierId) ? null : `supplierId "${d.supplierId}" does not exist in suppliers`),
  });
  all.push(products.stats);
  const productIds = new Set(await Product.distinct('productId'));
  const productRef = (d) => (productIds.has(d.productId) ? null : `productId "${d.productId}" does not exist in products`);

  const sales = await importDataset({
    label: 'sales',
    file: 'sales.csv',
    columns: ['saleId', 'productId', 'quantity', 'totalAmount', 'saleDate'],
    Model: Sale,
    idField: 'saleId',
    toDoc: (r) => {
      const saleDate = toDate(r.saleDate);
      if (!saleDate) throw new Error(`saleDate "${r.saleDate}" is not a valid YYYY-MM-DD date`);
      return {
        saleId: r.saleId,
        productId: String(r.productId || '').trim().toUpperCase(),
        quantity: toNumber(r.quantity),
        totalAmount: toNumber(r.totalAmount),
        saleDate,
      };
    },
    checkRefs: productRef,
  });
  all.push(sales.stats);

  const transactions = await importDataset({
    label: 'inventory_transactions',
    file: 'inventory_transactions.csv',
    columns: ['transactionId', 'productId', 'type', 'quantity', 'date'],
    Model: InventoryTransaction,
    idField: 'transactionId',
    toDoc: (r) => {
      const date = toDate(r.date);
      if (!date) throw new Error(`date "${r.date}" is not a valid YYYY-MM-DD date`);
      return {
        transactionId: r.transactionId,
        productId: String(r.productId || '').trim().toUpperCase(),
        type: String(r.type || '').trim().toUpperCase(),
        quantity: toNumber(r.quantity),
        date,
      };
    },
    checkRefs: productRef,
  });
  all.push(transactions.stats);

  const counters = await syncCounters();
  const admin = await ensureAdminUser();

  console.log('\nID counters synced:', JSON.stringify(counters));
  console.log(admin.created ? `Admin user created: ${admin.email}` : `Admin user: ${admin.reason}`);

  const totalInvalid = all.reduce((sum, s) => sum + s.invalid, 0);
  if (totalInvalid > 0) {
    console.log(`\n${totalInvalid} record(s) were REJECTED:`);
    for (const s of all) {
      for (const e of s.errors.slice(0, 25)) console.log(`  ${s.file} line ${e.line} [${e.id}]: ${e.reason}`);
      if (s.errors.length > 25) console.log(`  ${s.file}: ...and ${s.errors.length - 25} more`);
    }
    process.exitCode = 2;
  } else {
    console.log('\nImport finished with no invalid records.');
  }
}

main()
  .catch((err) => {
    console.error('\nImport failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
