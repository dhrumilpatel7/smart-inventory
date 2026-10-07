const env = require('./config/env');
const app = require('./app');
const { connectDB, disconnectDB, supportsTransactions } = require('./config/db');
const { syncCounters } = require('./utils/idGenerator');
const { ensureAdminUser } = require('./services/authService');

async function start() {
  try {
    const connection = await connectDB();
    console.log(`MongoDB connected: ${connection.host}:${connection.port}/${connection.name}`);
    if (!supportsTransactions()) {
      console.warn(
        'WARNING: this MongoDB server is not a replica set, so multi-document transactions are unavailable.\n' +
          '         The app falls back to compensating writes. Use "npm run db:start" or MongoDB Atlas for full transactions.'
      );
    }
    await syncCounters();
    const admin = await ensureAdminUser();
    if (admin.created) console.log(`Admin user created: ${admin.email}`);
  } catch (err) {
    console.error(`Could not start: ${err.message}`);
    console.error('Is MongoDB running? Start it with "npm run db:start" (in the backend folder) or check MONGODB_URI in backend/.env.');
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port}  (CORS: ${env.corsOrigins.join(', ')})`);
  });
  server.on('error', (err) => {
    console.error(err.code === 'EADDRINUSE' ? `Port ${env.port} is already in use. Change PORT in backend/.env.` : err.message);
    process.exit(1);
  });

  const shutdown = async () => {
    server.close();
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
