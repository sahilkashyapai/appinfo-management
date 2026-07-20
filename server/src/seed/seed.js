require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const seedAll = require('./runSeed');

async function main() {
  await connectDB();
  await seedAll();
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
