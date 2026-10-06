const prisma = require('../db/prisma');

// Connects to MySQL via DATABASE_URL (see server/.env and prisma/schema.prisma).
// Tables are created and upgraded by Prisma migrations (`npx prisma migrate dev`
// locally, `npx prisma migrate deploy` in staging/production), not at startup.
async function connectDB() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Add it to server/.env, e.g. mysql://user:pass@localhost:3306/appinfo');
  }
  await prisma.$connect();
  const host = new URL(process.env.DATABASE_URL).host;
  console.log(`[db] connected to MySQL (${host})`);
}

async function disconnectDB() {
  await prisma.$disconnect();
}

module.exports = connectDB;
module.exports.disconnectDB = disconnectDB;
