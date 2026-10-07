// Creates the admin user defined by ADMIN_EMAIL / ADMIN_PASSWORD in backend/.env.
//   npm run seed:admin
const { connectDB, disconnectDB } = require('../config/db');
const { ensureAdminUser } = require('../services/authService');

(async () => {
  try {
    await connectDB();
    const result = await ensureAdminUser();
    if (result.created) console.log(`Admin user created: ${result.email}`);
    else console.log(`Admin user not created (${result.reason}).`);
  } catch (err) {
    console.error('Seeding admin failed:', err.message);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
})();
