const mongoose = require('mongoose');
const env = require('./env');

// Whether the connected MongoDB deployment supports multi-document transactions
// (replica set or sharded cluster). A standalone mongod does not.
let transactionsSupported = false;

async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 8000 });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  transactionsSupported = Boolean(hello.setName || hello.msg === 'isdbgrid');
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = {
  connectDB,
  disconnectDB,
  supportsTransactions: () => transactionsSupported,
};
