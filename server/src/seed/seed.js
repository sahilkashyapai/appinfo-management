require('dotenv').config();
const connectDB = require('../config/db');
const { disconnectDB } = require('../config/db');
const seedAll = require('./runSeed');

async function main() {
  await connectDB();
  await seedAll();
  await disconnectDB();
}

// Only when run directly (`npm run seed`), never as a side effect of require().
if (require.main === module) {
  main().catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  });
}
