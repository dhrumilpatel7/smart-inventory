/**
 * Starts a local MongoDB server WITHOUT needing a system-wide installation.
 *
 *   npm run db:start
 *
 * - Downloads the official mongod binary once (cached by mongodb-memory-server).
 * - Stores data on disk in backend/.mongo-data, so data survives restarts.
 * - Runs as a single-node replica set ("rs0") so multi-document transactions work.
 *
 * If you already have MongoDB (or MongoDB Atlas), you do not need this script:
 * just point MONGODB_URI in backend/.env at your own server.
 */
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const { MongoBinary } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');

const PORT = Number(process.env.MONGO_PORT || 27017);
const HOST = '127.0.0.1';
const VERSION = process.env.MONGO_VERSION || '7.0.14';
const DB_PATH = path.join(__dirname, '..', '.mongo-data');
const REPL_SET = 'rs0';

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: HOST });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

async function initReplicaSet() {
  const client = new MongoClient(`mongodb://${HOST}:${PORT}/?directConnection=true`, {
    serverSelectionTimeoutMS: 2000,
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await client.connect();
      break;
    } catch (err) {
      if (attempt === 39) throw err;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const admin = client.db('admin');
  try {
    await admin.command({
      replSetInitiate: { _id: REPL_SET, members: [{ _id: 0, host: `${HOST}:${PORT}` }] },
    });
    console.log('Replica set initiated.');
  } catch (err) {
    if (err.codeName !== 'AlreadyInitialized') throw err;
  }
  // Wait until this node is PRIMARY (writable).
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const hello = await admin.command({ hello: 1 });
    if (hello.isWritablePrimary) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await client.close();
}

async function main() {
  if (await portInUse(PORT)) {
    console.log(`Something is already listening on ${HOST}:${PORT} - assuming MongoDB is running. Nothing to do.`);
    return;
  }
  fs.mkdirSync(DB_PATH, { recursive: true });
  console.log(`Locating mongod ${VERSION} (downloads on first run, ~100 MB)...`);
  const binary = await MongoBinary.getPath({ version: VERSION });

  const mongod = spawn(
    binary,
    ['--dbpath', DB_PATH, '--port', String(PORT), '--bind_ip', HOST, '--replSet', REPL_SET, '--quiet'],
    { stdio: ['ignore', 'ignore', 'inherit'] }
  );
  mongod.on('exit', (code) => {
    console.log(`mongod exited with code ${code}`);
    process.exit(code === null ? 1 : code);
  });
  const stop = () => mongod.kill('SIGINT');
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  await initReplicaSet();
  console.log(`MongoDB is running: mongodb://${HOST}:${PORT}/smart_inventory?replicaSet=${REPL_SET}`);
  console.log(`Data directory: ${DB_PATH}`);
  console.log('Leave this terminal open. Press Ctrl+C to stop MongoDB.');
}

main().catch((err) => {
  console.error('Could not start MongoDB:', err.message);
  process.exit(1);
});
