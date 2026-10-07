/**
 * End-to-end API test:  npm test
 *
 * Uses a SEPARATE database (<your db>_test), so the real application data is
 * never touched. The test database is created from the four CSV files, the
 * whole flow is exercised through real HTTP requests (including the Python ML
 * pipeline), and the test database is dropped at the end.
 */
const path = require('path');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Point this process (and the import child process) at the test database BEFORE loading the app.
const realUri = process.env.MONGODB_URI || '';
const TEST_URI = realUri.replace(/\/([^/?]+)(\?|$)/, (m, db, tail) => `/${db}_test${tail}`);
if (!realUri || TEST_URI === realUri) {
  console.error('MONGODB_URI must include a database name, e.g. mongodb://127.0.0.1:27017/smart_inventory');
  process.exit(1);
}
process.env.MONGODB_URI = TEST_URI;
process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'TestAdmin#2026';

const mongoose = require('mongoose');
const env = require('../config/env');
const app = require('../app');
const { connectDB, disconnectDB } = require('../config/db');
const { ensureAdminUser } = require('../services/authService');
const { syncCounters } = require('../utils/idGenerator');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const InventoryTransaction = require('../models/InventoryTransaction');
const Forecast = require('../models/Forecast');

let base;
let token;
let passed = 0;
const failures = [];

async function api(method, url, body, { auth = true, authToken } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${authToken || token}`;
  const res = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch (e) { /* no body */ }
  return { status: res.status, body: json };
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures.push({ name, error: err.message });
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

async function main() {
  await connectDB();
  expect(mongoose.connection.name.endsWith('_test'), 'refusing to run: not a test database');
  await mongoose.connection.dropDatabase();
  await ensureAdminUser();
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
  console.log(`Test database: ${mongoose.connection.name}   API: ${base}`);

  // ------------------------------------------------------------------ auth
  section('Authentication');
  await test('health endpoint is public', async () => {
    const r = await api('GET', '/health', undefined, { auth: false });
    expect(r.status === 200 && r.body.database === 'connected', `got ${r.status}`);
  });
  await test('protected route without token -> 401', async () => {
    const r = await api('GET', '/products', undefined, { auth: false });
    expect(r.status === 401, `got ${r.status}`);
  });
  await test('protected route with a forged token -> 401', async () => {
    const r = await api('GET', '/products', undefined, { authToken: 'not.a.real.token' });
    expect(r.status === 401, `got ${r.status}`);
  });
  await test('login with wrong password -> 401', async () => {
    const r = await api('POST', '/auth/login', { email: 'admin@test.local', password: 'wrong-password' }, { auth: false });
    expect(r.status === 401 && r.body.error.message === 'Invalid email or password', `got ${r.status}`);
  });
  await test('login with unknown email -> 401 (same message)', async () => {
    const r = await api('POST', '/auth/login', { email: 'nobody@test.local', password: 'whatever123' }, { auth: false });
    expect(r.status === 401 && r.body.error.message === 'Invalid email or password', `got ${r.status}`);
  });
  await test('login with missing fields -> 400', async () => {
    const r = await api('POST', '/auth/login', { email: 'admin@test.local' }, { auth: false });
    expect(r.status === 400, `got ${r.status}`);
  });
  await test('admin login -> 200 with JWT, no password in response', async () => {
    const r = await api('POST', '/auth/login', { email: 'admin@test.local', password: 'TestAdmin#2026' }, { auth: false });
    expect(r.status === 200 && r.body.token && r.body.user.role === 'admin', `got ${r.status}`);
    expect(!JSON.stringify(r.body).includes('passwordHash'), 'password hash leaked');
    token = r.body.token;
  });
  await test('password is stored as a bcrypt hash', async () => {
    const user = await mongoose.connection.collection('users').findOne({ email: 'admin@test.local' });
    expect(/^\$2[aby]\$\d{2}\$/.test(user.passwordHash) && !user.password, 'not a bcrypt hash');
  });
  let staffToken;
  await test('register a new user -> 201 (role staff)', async () => {
    const r = await api('POST', '/auth/register', { name: 'Staff User', email: 'staff@test.local', password: 'StaffPass#1' }, { auth: false });
    expect(r.status === 201 && r.body.user.role === 'staff', `got ${r.status} ${JSON.stringify(r.body)}`);
    staffToken = r.body.token;
  });
  await test('register with the same email -> 409', async () => {
    const r = await api('POST', '/auth/register', { name: 'Dup', email: 'staff@test.local', password: 'StaffPass#1' }, { auth: false });
    expect(r.status === 409, `got ${r.status}`);
  });
  await test('register with a short password -> 400', async () => {
    const r = await api('POST', '/auth/register', { name: 'Weak', email: 'weak@test.local', password: '123' }, { auth: false });
    expect(r.status === 400, `got ${r.status}`);
  });
  await test('GET /auth/me returns the logged-in user', async () => {
    const r = await api('GET', '/auth/me');
    expect(r.status === 200 && r.body.user.email === 'admin@test.local', `got ${r.status}`);
  });

  // ------------------------------------------------------ empty database
  section('Empty database (before import)');
  await test('dashboard works with no data (all zeros, no crash)', async () => {
    const r = await api('GET', '/dashboard');
    expect(r.status === 200 && r.body.cards.totalProducts === 0 && r.body.cards.totalSalesAmount === 0, `got ${r.status}`);
    expect(r.body.demand.available === false && r.body.salesByDay.length === 0, 'expected empty series');
  });
  await test('forecast list is empty, status says not available', async () => {
    const list = await api('GET', '/forecasts');
    const status = await api('GET', '/forecasts/status');
    expect(list.status === 200 && list.body.count === 0, `list got ${list.status}`);
    expect(status.body.available === false, 'status should be unavailable');
  });
  await test('running the ML forecast with no sales -> 422 EMPTY_DATA (from Python)', async () => {
    const r = await api('POST', '/forecasts/run');
    expect(r.status === 422 && r.body.error.details.code === 'EMPTY_DATA', `got ${r.status} ${JSON.stringify(r.body)}`);
  });

  // --------------------------------------------------------------- import
  section('CSV import');
  await test('import script loads the four CSV files', async () => {
    const run = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'importData.js')], {
      env: process.env, encoding: 'utf8',
    });
    expect(run.status === 0, `import exited with ${run.status}: ${run.stdout}${run.stderr}`);
  });
  await test('imported counts: 8 suppliers, 30 products, 4800 sales, 4980 transactions', async () => {
    const db = mongoose.connection;
    const counts = await Promise.all(['suppliers', 'products', 'sales', 'inventory_transactions'].map((c) => db.collection(c).countDocuments()));
    expect(counts.join(',') === '8,30,4800,4980', `got ${counts.join(',')}`);
  });
  await test('re-running the import creates no duplicates', async () => {
    const run = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'importData.js')], { env: process.env, encoding: 'utf8' });
    expect(run.status === 0, 'second import failed');
    expect(await Sale.countDocuments() === 4800 && await Product.countDocuments() === 30, 'counts changed');
  });
  await test('a CSV with bad rows is rejected row-by-row and reported (not silently dropped)', async () => {
    const fs = require('fs');
    const os = require('os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-csv-'));
    const dataDir = path.join(__dirname, '..', '..', 'data');
    for (const f of ['suppliers.csv', 'inventory_transactions.csv']) fs.copyFileSync(path.join(dataDir, f), path.join(dir, f));
    fs.writeFileSync(path.join(dir, 'products.csv'),
      'productId,name,category,price,stock,minimumStock,supplierId\nP901,Orphan Product,Test,100,5,1,S999\nP902,Negative Price,Test,-5,5,1,S001\n');
    fs.writeFileSync(path.join(dir, 'sales.csv'),
      'saleId,productId,quantity,totalAmount,saleDate\nSALE90001,P999,2,100,2026-01-01\nSALE90002,P001,0,100,2026-01-01\nSALE90003,P001,2,100,not-a-date\n');
    const run = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'importData.js'), '--dir', dir], { env: process.env, encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
    expect(run.status === 2, `expected exit code 2, got ${run.status}`);
    for (const text of ['supplierId "S999" does not exist', 'Price cannot be negative', 'productId "P999" does not exist', 'Quantity must be at least 1', 'not a valid YYYY-MM-DD']) {
      expect(run.stdout.includes(text), `report is missing: ${text}`);
    }
    expect(await Product.countDocuments() === 30 && await Sale.countDocuments() === 4800, 'invalid rows were inserted');
  });
  await syncCounters();

  // ------------------------------------------------------------ dashboard
  section('Dashboard and analytics (real data)');
  let dashboardBefore;
  await test('dashboard totals equal the CSV totals', async () => {
    const r = await api('GET', '/dashboard');
    dashboardBefore = r.body;
    const c = r.body.cards;
    expect(r.status === 200, `got ${r.status}`);
    expect(c.totalProducts === 30 && c.totalSuppliers === 8 && c.totalSalesCount === 4800, JSON.stringify(c));
    expect(c.totalUnitsSold === 16600 && c.totalSalesAmount === 28486800, JSON.stringify(c));
    expect(c.lowStockItems === 1 && c.outOfStockItems === 0 && c.inventoryValue === 1309170, JSON.stringify(c));
    expect(r.body.salesByDay.length === 181 && r.body.salesByCategory.length === 5, 'series lengths');
    expect(r.body.inventoryMovement.totals.inTransactions === 180 && r.body.inventoryMovement.totals.outTransactions === 4800, 'movement');
    expect(r.body.lowStockProducts.length === 1 && r.body.lowStockProducts[0].productId === 'P005', 'low stock table');
  });
  await test('sales analytics: date filter and monthly grouping', async () => {
    const r = await api('GET', '/sales/analytics?from=2026-03-01&to=2026-03-31&groupBy=month');
    expect(r.status === 200 && r.body.byPeriod.length === 1 && r.body.byPeriod[0].units === 3031, JSON.stringify(r.body.byPeriod));
  });
  await test('sales analytics with from > to -> 400', async () => {
    const r = await api('GET', '/sales/analytics?from=2026-05-01&to=2026-01-01');
    expect(r.status === 400, `got ${r.status}`);
  });
  await test('inventory analytics and supplier analytics', async () => {
    const inv = await api('GET', '/inventory/analytics');
    const sup = await api('GET', '/suppliers/analytics');
    expect(inv.status === 200 && inv.body.movement.outUnits === 16600 && inv.body.movementByPeriod.length === 6, 'inventory analytics');
    expect(sup.status === 200 && sup.body.data.length === 8 && sup.body.data.reduce((s, x) => s + x.productCount, 0) === 30, 'supplier analytics');
  });

  // ------------------------------------------------------------- products
  section('Products');
  await test('list with search, category filter, sorting and pagination', async () => {
    const search = await api('GET', '/products?q=ssd');
    expect(search.body.data.length === 3, `search got ${search.body.data.length}`);
    const cat = await api('GET', '/products?category=Networking&sort=price&order=desc');
    expect(cat.body.data.length === 3 && cat.body.data[0].price >= cat.body.data[1].price, 'category/sort');
    const page = await api('GET', '/products?limit=10&page=3');
    expect(page.body.data.length === 10 && page.body.pagination.pages === 3 && page.body.data[0].productId === 'P021', 'pagination');
    const low = await api('GET', '/products?stockStatus=low');
    expect(low.body.data.length === 1 && low.body.data[0].stockStatus === 'LOW', 'stock filter');
  });
  await test('get one product includes its supplier', async () => {
    const r = await api('GET', '/products/P001');
    expect(r.status === 200 && r.body.data.supplier.name === 'Tech Supplies Pvt Ltd', JSON.stringify(r.body));
  });
  await test('unknown product -> 404', async () => {
    const r = await api('GET', '/products/P999');
    expect(r.status === 404, `got ${r.status}`);
  });
  await test('create product (auto ID P031) -> 201', async () => {
    const r = await api('POST', '/products', { name: 'Test Trackball', category: 'Electronics', price: 1500, stock: 3, minimumStock: 2, supplierId: 'S001' });
    expect(r.status === 201 && r.body.data.productId === 'P031', `got ${r.status} ${JSON.stringify(r.body)}`);
  });
  await test('create product with a duplicate productId -> 409', async () => {
    const r = await api('POST', '/products', { productId: 'P001', name: 'Dup', category: 'X', price: 1, stock: 1, minimumStock: 1, supplierId: 'S001' });
    expect(r.status === 409, `got ${r.status}`);
  });
  await test('create product with a missing supplier -> 400 (no orphan created)', async () => {
    const r = await api('POST', '/products', { name: 'Orphan', category: 'X', price: 1, stock: 1, minimumStock: 1, supplierId: 'S999' });
    expect(r.status === 400 && /does not exist/.test(r.body.error.message), `got ${r.status}`);
    expect(!(await Product.exists({ name: 'Orphan' })), 'orphan product was created');
  });
  await test('create product with negative price / fractional stock / no name -> 400', async () => {
    const a = await api('POST', '/products', { name: 'Bad', category: 'X', price: -5, stock: 1, minimumStock: 1, supplierId: 'S001' });
    const b = await api('POST', '/products', { name: 'Bad', category: 'X', price: 5, stock: 1.5, minimumStock: 1, supplierId: 'S001' });
    const c = await api('POST', '/products', { category: 'X', price: 5, stock: 1, minimumStock: 1, supplierId: 'S001' });
    expect(a.status === 400 && b.status === 400 && c.status === 400, `got ${a.status},${b.status},${c.status}`);
  });
  await test('update product; direct stock edit is refused', async () => {
    const ok = await api('PUT', '/products/P031', { price: 1600, minimumStock: 4 });
    expect(ok.status === 200 && ok.body.data.price === 1600 && ok.body.data.stockStatus === 'LOW', JSON.stringify(ok.body));
    const bad = await api('PUT', '/products/P031', { stock: 500 });
    expect(bad.status === 400, `stock edit got ${bad.status}`);
    const sup = await api('PUT', '/products/P031', { supplierId: 'S404' });
    expect(sup.status === 400, `bad supplier got ${sup.status}`);
  });
  await test('delete product: staff -> 403, product with history -> 409, unused product -> 200', async () => {
    const staff = await api('DELETE', '/products/P031', undefined, { authToken: staffToken });
    expect(staff.status === 403, `staff got ${staff.status}`);
    const history = await api('DELETE', '/products/P001');
    expect(history.status === 409, `history got ${history.status}`);
    const ok = await api('DELETE', '/products/P031');
    expect(ok.status === 200 && !(await Product.exists({ productId: 'P031' })), `delete got ${ok.status}`);
  });

  // ------------------------------------------------------------ suppliers
  section('Suppliers');
  await test('list suppliers with product counts', async () => {
    const r = await api('GET', '/suppliers');
    expect(r.status === 200 && r.body.data.length === 8, `got ${r.status}`);
    expect(r.body.data.find((s) => s.supplierId === 'S003').productCount === 5, 'product count for S003');
  });
  await test('create / duplicate / invalid email / update / delete supplier', async () => {
    const created = await api('POST', '/suppliers', { name: 'New Supplier', email: 'new@example.com', phone: '9000000001', address: 'Surat, Gujarat' });
    expect(created.status === 201 && created.body.data.supplierId === 'S009', `create got ${created.status} ${JSON.stringify(created.body)}`);
    const dup = await api('POST', '/suppliers', { supplierId: 'S001', name: 'Dup', email: 'd@example.com', phone: '9000000002', address: 'X' });
    expect(dup.status === 409, `dup got ${dup.status}`);
    const bad = await api('POST', '/suppliers', { name: 'Bad', email: 'not-an-email', phone: '9000000003', address: 'X' });
    expect(bad.status === 400, `bad email got ${bad.status}`);
    const upd = await api('PUT', '/suppliers/S009', { phone: '9111111111' });
    expect(upd.status === 200 && upd.body.data.phone === '9111111111', 'update');
    const linked = await api('DELETE', '/suppliers/S001');
    expect(linked.status === 409, `delete linked got ${linked.status}`);
    const del = await api('DELETE', '/suppliers/S009');
    expect(del.status === 200, `delete got ${del.status}`);
    const gone = await api('GET', '/suppliers/S009');
    expect(gone.status === 404, `after delete got ${gone.status}`);
  });

  // ---------------------------------------------------------------- sales
  section('Sales -> stock -> inventory transaction');
  let newSale;
  await test('record a sale: sale saved, stock decreases in MongoDB, OUT transaction created', async () => {
    const before = await Product.findOne({ productId: 'P001' }).lean();
    const r = await api('POST', '/sales', { productId: 'P001', quantity: 5, saleDate: '2026-06-30' });
    expect(r.status === 201, `got ${r.status} ${JSON.stringify(r.body)}`);
    newSale = r.body;
    const after = await Product.findOne({ productId: 'P001' }).lean();
    expect(after.stock === before.stock - 5, `stock ${before.stock} -> ${after.stock}`);
    const sale = await Sale.findOne({ saleId: r.body.data.saleId }).lean();
    expect(sale && sale.quantity === 5 && sale.totalAmount === 5 * before.price, 'sale document / totalAmount = price x quantity');
    expect(r.body.data.saleId === 'SALE04801', `sale id ${r.body.data.saleId}`);
    const tx = await InventoryTransaction.findOne({ transactionId: r.body.inventoryTransaction.transactionId }).lean();
    expect(tx && tx.type === 'OUT' && tx.quantity === 5 && tx.productId === 'P001', 'OUT transaction');
    expect(tx.transactionId === 'T04981', `transaction id ${tx.transactionId}`);
  });
  await test('the new sale and its OUT transaction appear in the list APIs', async () => {
    const sales = await api('GET', '/sales?productId=P001&limit=1');
    expect(sales.body.data[0].saleId === newSale.data.saleId, 'sale not first in list');
    const tx = await api('GET', '/inventory-transactions?productId=P001&type=OUT&limit=1');
    expect(tx.body.data[0].transactionId === newSale.inventoryTransaction.transactionId, 'transaction not first in list');
    const one = await api('GET', `/sales/${newSale.data.saleId}`);
    expect(one.status === 200 && one.body.data.productName === 'Wireless Mouse', 'get one sale');
  });
  await test('dashboard and analytics reflect the sale', async () => {
    const r = await api('GET', '/dashboard');
    const b = dashboardBefore.cards;
    const c = r.body.cards;
    expect(c.totalSalesCount === b.totalSalesCount + 1 && c.totalUnitsSold === b.totalUnitsSold + 5, 'sales cards');
    expect(c.totalSalesAmount === b.totalSalesAmount + 5 * 599, 'revenue card');
    expect(c.inventoryValue === b.inventoryValue - 5 * 599 && c.totalStockUnits === b.totalStockUnits - 5, 'inventory value');
    expect(r.body.inventoryMovement.totals.outTransactions === 4801, 'movement totals');
  });
  await test('sale for an unknown product -> 404, nothing written', async () => {
    const r = await api('POST', '/sales', { productId: 'P999', quantity: 1 });
    expect(r.status === 404 && await Sale.countDocuments() === 4801, `got ${r.status}`);
  });
  await test('sale larger than stock -> 409, stock unchanged, nothing written', async () => {
    const before = await Product.findOne({ productId: 'P005' }).lean();
    const r = await api('POST', '/sales', { productId: 'P005', quantity: before.stock + 1 });
    const after = await Product.findOne({ productId: 'P005' }).lean();
    expect(r.status === 409 && /Insufficient stock/.test(r.body.error.message), `got ${r.status}`);
    expect(after.stock === before.stock, 'stock changed');
    expect(await Sale.countDocuments() === 4801 && await InventoryTransaction.countDocuments() === 4981, 'documents were written');
  });
  await test('invalid quantities (0, negative, decimal, text, missing) -> 400', async () => {
    for (const quantity of [0, -3, 2.5, 'abc', undefined, null]) {
      const r = await api('POST', '/sales', { productId: 'P001', quantity });
      expect(r.status === 400, `quantity ${quantity} got ${r.status}`);
    }
  });
  await test('invalid / future sale date -> 400', async () => {
    const a = await api('POST', '/sales', { productId: 'P001', quantity: 1, saleDate: '2026-02-31' });
    const b = await api('POST', '/sales', { productId: 'P001', quantity: 1, saleDate: '2999-01-01' });
    expect(a.status === 400 && b.status === 400, `got ${a.status},${b.status}`);
  });
  await test('two simultaneous sales competing for the last units: exactly one succeeds, stock never negative', async () => {
    const before = await Product.findOne({ productId: 'P019' }).lean(); // stock 8
    const [a, b] = await Promise.all([
      api('POST', '/sales', { productId: 'P019', quantity: before.stock - 1, saleDate: '2026-06-30' }),
      api('POST', '/sales', { productId: 'P019', quantity: before.stock - 1, saleDate: '2026-06-30' }),
    ]);
    const statuses = [a.status, b.status].sort().join(',');
    const after = await Product.findOne({ productId: 'P019' }).lean();
    expect(statuses === '201,409', `statuses ${statuses}`);
    expect(after.stock === 1, `stock is ${after.stock}`);
    expect(await Sale.countDocuments() === 4802 && await InventoryTransaction.countDocuments() === 4982, 'exactly one sale + one transaction expected');
  });
  await test('a failure in the middle of a sale rolls everything back (transaction)', async () => {
    const before = await Product.findOne({ productId: 'P002' }).lean();
    const original = InventoryTransaction.create;
    InventoryTransaction.create = async () => { throw new Error('simulated crash while writing the inventory transaction'); };
    let r;
    try {
      r = await api('POST', '/sales', { productId: 'P002', quantity: 2 });
    } finally {
      InventoryTransaction.create = original;
    }
    const after = await Product.findOne({ productId: 'P002' }).lean();
    expect(r.status === 500 && r.body.error.message === 'Internal server error', `got ${r.status} ${JSON.stringify(r.body)}`);
    expect(after.stock === before.stock, `stock changed ${before.stock} -> ${after.stock}`);
    expect(await Sale.countDocuments() === 4802, 'sale was saved despite the failure');
  });

  // ------------------------------------------------- inventory transactions
  section('Inventory transactions');
  await test('filters: product, type, date range', async () => {
    const r = await api('GET', '/inventory-transactions?productId=P001&type=IN&from=2026-01-01&to=2026-03-31');
    expect(r.status === 200 && r.body.pagination.total === 3 && r.body.data.every((t) => t.type === 'IN' && t.productId === 'P001'), JSON.stringify(r.body.pagination));
    expect(r.body.summary.inUnits === 68 + 71 + 52, `summary ${JSON.stringify(r.body.summary)}`);
  });
  await test('IN transaction increases stock; OUT decreases it', async () => {
    const before = await Product.findOne({ productId: 'P005' }).lean();
    const inn = await api('POST', '/inventory-transactions', { productId: 'P005', type: 'IN', quantity: 20 });
    expect(inn.status === 201 && inn.body.product.stock === before.stock + 20, `IN got ${inn.status}`);
    const out = await api('POST', '/inventory-transactions', { productId: 'P005', type: 'out', quantity: 4 });
    expect(out.status === 201 && out.body.product.stock === before.stock + 16, `OUT got ${out.status}`);
    const one = await api('GET', `/inventory-transactions/${out.body.data.transactionId}`);
    expect(one.status === 200 && one.body.data.type === 'OUT', 'get one');
    expect((await Product.findOne({ productId: 'P005' }).lean()).stock === before.stock + 16, 'database stock');
  });
  await test('invalid transactions -> 400/404/409 and no stock change', async () => {
    const before = await Product.findOne({ productId: 'P005' }).lean();
    const badType = await api('POST', '/inventory-transactions', { productId: 'P005', type: 'TRANSFER', quantity: 1 });
    const noType = await api('POST', '/inventory-transactions', { productId: 'P005', quantity: 1 });
    const badQty = await api('POST', '/inventory-transactions', { productId: 'P005', type: 'IN', quantity: -4 });
    const badProduct = await api('POST', '/inventory-transactions', { productId: 'NOPE', type: 'IN', quantity: 1 });
    const tooMuch = await api('POST', '/inventory-transactions', { productId: 'P005', type: 'OUT', quantity: 100000 });
    const badFilter = await api('GET', '/inventory-transactions?type=SIDEWAYS');
    const badDate = await api('GET', '/inventory-transactions?from=yesterday');
    const missing = await api('GET', '/inventory-transactions/T99999');
    expect(badType.status === 400 && noType.status === 400 && badQty.status === 400, `validation ${badType.status},${noType.status},${badQty.status}`);
    expect(badProduct.status === 404 && tooMuch.status === 409, `product/stock ${badProduct.status},${tooMuch.status}`);
    expect(badFilter.status === 400 && badDate.status === 400 && missing.status === 404, `filters ${badFilter.status},${badDate.status},${missing.status}`);
    expect((await Product.findOne({ productId: 'P005' }).lean()).stock === before.stock, 'stock changed');
  });

  // ------------------------------------------------------------ API errors
  section('API error handling');
  await test('unknown route -> 404 JSON, malformed JSON body -> 400', async () => {
    const nf = await api('GET', '/does-not-exist');
    expect(nf.status === 404 && nf.body.error.message, `got ${nf.status}`);
    const res = await fetch(`${base}/sales`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{bad json' });
    expect(res.status === 400, `malformed json got ${res.status}`);
  });
  await test('NoSQL-injection style login payload is rejected', async () => {
    const r = await api('POST', '/auth/login', { email: { $gt: '' }, password: { $gt: '' } }, { auth: false });
    expect(r.status === 400, `got ${r.status}`);
  });

  // ---------------------------------------------------------- ML failures
  section('Machine learning (Node -> Python -> Node)');
  const realScript = env.ml.scriptPath;
  const realPython = env.ml.pythonPath;
  const realTimeout = env.ml.timeoutMs;
  await test('Python crash is handled -> 502, no forecast stored', async () => {
    const fs = require('fs');
    const os = require('os');
    const broken = path.join(os.tmpdir(), `broken-forecast-${process.pid}.py`);
    fs.writeFileSync(broken, 'import sys\nraise RuntimeError("simulated crash")\n');
    env.ml.scriptPath = broken;
    const r = await api('POST', '/forecasts/run');
    env.ml.scriptPath = realScript;
    fs.unlinkSync(broken);
    expect(r.status === 502 && r.body.error.details.code === 'ML_PROCESS_FAILED', `got ${r.status} ${JSON.stringify(r.body)}`);
    expect(!/Traceback|RuntimeError/.test(JSON.stringify(r.body)), 'stack trace leaked to the client');
    expect(await Forecast.countDocuments() === 0, 'forecasts were stored');
  });
  await test('Python printing invalid JSON is handled -> 502', async () => {
    const fs = require('fs');
    const os = require('os');
    const garbage = path.join(os.tmpdir(), `garbage-forecast-${process.pid}.py`);
    fs.writeFileSync(garbage, 'print("this is not json")\n');
    env.ml.scriptPath = garbage;
    const r = await api('POST', '/forecasts/run');
    env.ml.scriptPath = realScript;
    fs.unlinkSync(garbage);
    expect(r.status === 502, `got ${r.status}`);
  });
  await test('missing Python executable is handled -> 500 with a helpful message', async () => {
    env.ml.pythonPath = '/nonexistent/python';
    const r = await api('POST', '/forecasts/run');
    env.ml.pythonPath = realPython;
    expect(r.status === 500 && r.body.error.details.code === 'PYTHON_NOT_AVAILABLE', `got ${r.status} ${JSON.stringify(r.body)}`);
  });
  await test('Python timeout is handled -> 504', async () => {
    env.ml.timeoutMs = 50;
    const r = await api('POST', '/forecasts/run');
    env.ml.timeoutMs = realTimeout;
    expect(r.status === 504 && r.body.error.details.code === 'TIMEOUT', `got ${r.status} ${JSON.stringify(r.body)}`);
  });
  await test('failed runs are logged; forecast page data is an empty state, not an error', async () => {
    const runs = await api('GET', '/forecasts/runs');
    expect(runs.body.data.length >= 4 && runs.body.data.every((x) => x.status === 'FAILED'), 'failed runs not recorded');
    const p = await api('GET', '/forecasts/product/P001');
    expect(p.status === 200 && p.body.available === false && p.body.forecast.length === 0 && p.body.history.length > 0, 'empty state');
    const reorder = await api('GET', '/reorder');
    expect(reorder.status === 200 && reorder.body.forecast.available === false, 'reorder without forecast');
  });

  let run;
  await test('run the real forecast -> 201, model selected, metrics present', async () => {
    const r = await api('POST', '/forecasts/run');
    expect(r.status === 201, `got ${r.status} ${JSON.stringify(r.body)}`);
    run = r.body.run;
    expect(['Linear Regression', 'Random Forest', 'Gradient Boosting'].includes(run.model), `model ${run.model}`);
    for (const k of ['mae', 'rmse', 'mape']) expect(typeof run.metrics[k] === 'number' && run.metrics[k] >= 0, `metric ${k} = ${run.metrics[k]}`);
    expect(run.modelComparison.length === 4 && run.modelComparison.filter((m) => m.selected).length === 1, 'model comparison');
    expect(run.split.method.startsWith('chronological'), 'split method');
    expect(run.split.train.endDate < run.split.validation.startDate && run.split.validation.endDate < run.split.test.startDate, 'split is not chronological');
    expect(run.dataSummary.salesRecords === 4802 && run.dataSummary.products === 30, `data summary ${JSON.stringify(run.dataSummary)}`);
  });
  await test('forecasts are stored in MongoDB: 30 products x 30 days, all after the last sale date', async () => {
    expect(await Forecast.countDocuments() === 900, `stored ${await Forecast.countDocuments()}`);
    const lastSale = (await Sale.findOne().sort({ saleDate: -1 }).lean()).saleDate;
    const earliest = (await Forecast.findOne().sort({ forecastDate: 1 }).lean()).forecastDate;
    expect(earliest.getTime() === lastSale.getTime() + 86400000, `first forecast date ${earliest.toISOString()}`);
    expect(!(await Forecast.exists({ predictedDemand: { $lt: 0 } })), 'negative forecast');
    expect((await Forecast.distinct('runId')).join() === run.runId, 'run id');
  });
  await test('forecast API: 7 and 30 day horizons, per-product metrics', async () => {
    const d7 = await api('GET', '/forecasts?productId=P001&horizon=7');
    const d30 = await api('GET', '/forecasts?productId=P001&horizon=30');
    expect(d7.body.count === 7 && d30.body.count === 30, `counts ${d7.body.count}, ${d30.body.count}`);
    const row = d7.body.data[0];
    expect(row.productId === 'P001' && row.forecastDate === '2026-07-01' && typeof row.predictedDemand === 'number', JSON.stringify(row));
    expect(typeof row.metrics.mae === 'number' && typeof row.metrics.rmse === 'number', 'per-product metrics');
    const all = await api('GET', '/forecasts?horizon=7');
    expect(all.body.count === 210, `all products x 7 days = ${all.body.count}`);
    const bad = await api('GET', '/forecasts?horizon=abc');
    expect(bad.status === 400, `bad horizon got ${bad.status}`);
  });
  await test('product forecast endpoint: history + forecast + hold-out comparison', async () => {
    const r = await api('GET', '/forecasts/product/P016?horizon=30&historyDays=60');
    expect(r.status === 200 && r.body.available && r.body.history.length === 60 && r.body.forecast.length === 30, 'lengths');
    expect(r.body.history[r.body.history.length - 1].date < r.body.forecast[0].date, 'forecast must start after history');
    expect(r.body.backtest.length === 30 && r.body.model === run.model, 'backtest/model');
    // History must equal a direct database aggregation.
    const [agg] = await Sale.aggregate([{ $match: { productId: 'P016', saleDate: new Date('2026-06-30T00:00:00Z') } }, { $group: { _id: null, u: { $sum: '$quantity' } } }]);
    expect(r.body.history[59].units === agg.u, 'history does not match the database');
    const missing = await api('GET', '/forecasts/product/P999');
    expect(missing.status === 404, `missing product got ${missing.status}`);
  });
  await test('a product with no sales history gets a clear "no forecast" answer', async () => {
    const created = await api('POST', '/products', { productId: 'P777', name: 'Brand New Item', category: 'Electronics', price: 100, stock: 0, minimumStock: 5, supplierId: 'S001' });
    expect(created.status === 201, `create got ${created.status}`);
    const r = await api('GET', '/forecasts/product/P777');
    expect(r.status === 200 && r.body.available === false && /no sales history/.test(r.body.reason), JSON.stringify(r.body.reason));
  });
  await test('forecast is marked stale after a new sale', async () => {
    const before = await api('GET', '/forecasts/status');
    expect(before.body.available === true && before.body.stale === false, `before: ${JSON.stringify({ a: before.body.available, s: before.body.stale })}`);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await api('POST', '/sales', { productId: 'P004', quantity: 1, saleDate: '2026-06-30' });
    const after = await api('GET', '/forecasts/status');
    expect(after.body.stale === true, 'should be stale');
  });

  await test("today's sales are not used as a full day of demand (unfinished day is excluded)", async () => {
    const sale = await api('POST', '/sales', { productId: 'P004', quantity: 2 }); // saleDate defaults to today
    expect(sale.status === 201, `sale got ${sale.status}`);
    const r = await api('POST', '/forecasts/run');
    expect(r.status === 201, `run got ${r.status} ${JSON.stringify(r.body)}`);
    const summary = r.body.run.dataSummary;
    expect(summary.incompleteDayRecordsExcluded === 1 && summary.endDate === '2026-06-30', JSON.stringify(summary));
    const first = (await Forecast.findOne().sort({ forecastDate: 1 }).lean()).forecastDate.toISOString().slice(0, 10);
    expect(first === '2026-07-01', `forecast starts ${first}`);
    const p = await api('GET', '/forecasts/product/P004?historyDays=60');
    expect(p.body.history[59].date === '2026-06-30' && p.body.stale === false, 'history should end on the last finished day');
  });

  // --------------------------------------------------------------- reorder
  section('Reorder recommendations and purchase orders');
  let item;
  await test('reorder quantity = forecast + safety stock - current stock - on order (min 0), using live stock', async () => {
    const r = await api('GET', '/reorder?horizon=7');
    expect(r.status === 200 && r.body.items.length === 31 && r.body.forecast.available, `got ${r.status}`);
    const products = new Map((await Product.find().lean()).map((p) => [p.productId, p]));
    for (const i of r.body.items) {
      expect(i.currentStock === products.get(i.productId).stock, `${i.productId} stock is not live`);
      const expected = Math.max(0, i.forecastDemand + i.safetyStock - i.currentStock - i.onOrder);
      expect(i.reorderQuantity === expected, `${i.productId}: ${i.reorderQuantity} != ${expected}`);
      expect(i.reason && i.reason.length > 20, `${i.productId} has no reason`);
    }
    const p019 = r.body.items.find((i) => i.productId === 'P019');
    expect(p019.currentStock === 1 && p019.needsReorder && p019.stockStatus === 'LOW', JSON.stringify(p019));
    const fresh = r.body.items.find((i) => i.productId === 'P777');
    expect(fresh.forecastAvailable === false && fresh.priority === 'NONE' && fresh.stockStatus === 'OUT', JSON.stringify(fresh));
    // Forecast demand must be the sum of the stored ML forecasts.
    const rows = await Forecast.find({ productId: 'P019', dayAhead: { $lte: 7 } }).lean();
    const sum = rows.reduce((s, x) => s + x.predictedDemand, 0);
    expect(p019.forecastDemand === Math.ceil(sum - 1e-9), `forecast demand ${p019.forecastDemand} vs ${sum}`);
    item = p019;
    const r30 = await api('GET', '/reorder?horizon=30');
    expect(r30.body.items.find((i) => i.productId === 'P019').forecastDemand > p019.forecastDemand, '30-day demand should exceed 7-day demand');
    const bad = await api('GET', '/reorder?horizon=13');
    expect(bad.status === 400, `bad horizon got ${bad.status}`);
  });
  await test('purchase order: create -> on order reduces recommendation -> receive adds stock + IN transaction', async () => {
    const created = await api('POST', '/purchase-orders', { productId: 'P019', quantity: item.reorderQuantity });
    expect(created.status === 201 && created.body.data.status === 'PENDING' && created.body.data.supplierId === 'S004', JSON.stringify(created.body));
    const orderId = created.body.data.orderId;
    const mid = await api('GET', '/reorder?horizon=7');
    const midItem = mid.body.items.find((i) => i.productId === 'P019');
    expect(midItem.onOrder === item.reorderQuantity && midItem.reorderQuantity === 0, JSON.stringify(midItem));

    const ordered = await api('PATCH', `/purchase-orders/${orderId}/status`, { status: 'ORDERED' });
    expect(ordered.status === 200 && ordered.body.data.status === 'ORDERED', `ordered got ${ordered.status}`);
    const txBefore = await InventoryTransaction.countDocuments();
    const received = await api('PATCH', `/purchase-orders/${orderId}/status`, { status: 'RECEIVED' });
    expect(received.status === 200 && received.body.inventoryTransaction.type === 'IN', `received got ${received.status}`);
    expect((await Product.findOne({ productId: 'P019' }).lean()).stock === 1 + item.reorderQuantity, 'stock after receiving');
    expect(await InventoryTransaction.countDocuments() === txBefore + 1, 'IN transaction count');
    const again = await api('PATCH', `/purchase-orders/${orderId}/status`, { status: 'RECEIVED' });
    const cancel = await api('PATCH', `/purchase-orders/${orderId}/status`, { status: 'CANCELLED' });
    expect(again.status === 409 && cancel.status === 409, `double receive ${again.status}, cancel ${cancel.status}`);
    expect((await Product.findOne({ productId: 'P019' }).lean()).stock === 1 + item.reorderQuantity, 'stock was added twice');
  });
  await test('purchase order validation', async () => {
    const a = await api('POST', '/purchase-orders', { productId: 'P999', quantity: 5 });
    const b = await api('POST', '/purchase-orders', { productId: 'P001', quantity: 0 });
    const c = await api('PATCH', '/purchase-orders/PO99999/status', { status: 'ORDERED' });
    const d = await api('GET', '/purchase-orders?status=BOGUS');
    expect(a.status === 404 && b.status === 400 && c.status === 404 && d.status === 400, `${a.status},${b.status},${c.status},${d.status}`);
  });
  await test('dashboard demand chart data: history then forecast, from stored forecasts', async () => {
    const r = await api('GET', '/dashboard');
    const d = r.body.demand;
    expect(d.available && d.history.length === 60 && d.forecast.length === 30, 'lengths');
    const [agg] = await Forecast.aggregate([{ $match: { dayAhead: 1 } }, { $group: { _id: null, u: { $sum: '$predictedDemand' } } }]);
    expect(Math.abs(d.forecast[0].units - agg.u) < 0.02, 'forecast total does not match stored forecasts');
  });

  // ------------------------------------------------------------- integrity
  section('Database integrity after all tests');
  await test('no orphan records, no duplicate IDs, no negative stock', async () => {
    const productIds = await Product.distinct('productId');
    expect(await Sale.countDocuments({ productId: { $nin: productIds } }) === 0, 'orphan sales');
    expect(await InventoryTransaction.countDocuments({ productId: { $nin: productIds } }) === 0, 'orphan transactions');
    expect(await Product.countDocuments({ stock: { $lt: 0 } }) === 0, 'negative stock');
    const dup = await Sale.aggregate([{ $group: { _id: '$saleId', n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]);
    expect(dup.length === 0, 'duplicate sale ids');
  });

  await mongoose.connection.dropDatabase();
  server.close();
  await disconnectDB();

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.log(` - ${f.name}: ${f.error}`);
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error('Test run crashed:', err);
  try { await mongoose.connection.dropDatabase(); } catch (e) { /* ignore */ }
  process.exit(1);
});
