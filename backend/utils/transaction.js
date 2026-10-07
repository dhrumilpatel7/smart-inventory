const mongoose = require('mongoose');
const { supportsTransactions } = require('../config/db');

/**
 * Runs `work(session)` inside a MongoDB transaction so that all writes commit
 * or none do. `session.withTransaction` also retries transient errors
 * (e.g. write conflicts between two simultaneous sales of the same product).
 *
 * If the deployment is a standalone mongod (no replica set), transactions are
 * not available. In that case `work(null, compensations)` runs without a
 * session; each step can push an "undo" function to `compensations`, and they
 * are executed in reverse order if a later step fails.
 */
async function runInTransaction(work) {
  if (supportsTransactions()) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await work(session, []);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  const compensations = [];
  try {
    return await work(null, compensations);
  } catch (err) {
    for (const undo of compensations.reverse()) {
      try {
        await undo();
      } catch (undoErr) {
        console.error('Compensation step failed:', undoErr.message);
      }
    }
    throw err;
  }
}

module.exports = { runInTransaction };
