// One-off, idempotent script - creates (or fixes up) the single 'developer'
// account used to log into the Developer Panel. Safe to re-run: it only
// touches the one user row matched by email, never wipes/reseeds
// anything else (unlike seed.js's seedAll, which is destructive).
//
// Usage: node src/seed/createDeveloperUser.js
// Override defaults with env vars: DEV_USER_EMAIL, DEV_USER_PASSWORD, DEV_USER_NAME

require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const prisma = require('../db/prisma');

async function main() {
  const email = (process.env.DEV_USER_EMAIL || 'dev@skmail.com').toLowerCase().trim();
  const password = process.env.DEV_USER_PASSWORD || 'Dev@Panel2026!';
  const name = process.env.DEV_USER_NAME || 'Developer';

  await connectDB();

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, role: 'developer', isActive: true, approvalStatus: 'approved' },
    });
    console.log(`[seed] updated existing user to developer role: ${email}`);
  } else {
    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: 'developer',
        department: 'Engineering',
        branch: 'Headquarters',
      },
    });
    console.log(`[seed] created developer user: ${email}`);
  }

  console.log(`[seed]   login: ${email} / ${password}`);
  await prisma.$disconnect();
}

// Runs only when executed directly (node <file>), never when required.
if (require.main === module) {
  main().catch(async (err) => {
    console.error('[seed] failed:', err);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
}
