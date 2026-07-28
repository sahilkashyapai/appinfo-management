// One-off, idempotent script — creates (or fixes up) the single 'developer'
// account used to log into the Developer Panel. Safe to re-run: it only
// touches the one user document matched by email, never wipes/reseeds
// anything else (unlike seed.js's seedAll, which is destructive).
//
// Usage: node src/seed/createDeveloperUser.js
// Override defaults with env vars: DEV_USER_EMAIL, DEV_USER_PASSWORD, DEV_USER_NAME

require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

async function main() {
  const email = (process.env.DEV_USER_EMAIL || 'dev@skmail.com').toLowerCase().trim();
  const password = process.env.DEV_USER_PASSWORD || 'Dev@Panel2026!';
  const name = process.env.DEV_USER_NAME || 'Developer';

  await connectDB();

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await User.findOne({ email });

  if (existing) {
    existing.passwordHash = passwordHash;
    existing.role = 'developer';
    existing.isActive = true;
    existing.approvalStatus = 'approved';
    await existing.save();
    console.log(`[seed] updated existing user to developer role: ${email}`);
  } else {
    await User.create({
      name,
      email,
      passwordHash,
      role: 'developer',
      department: 'Engineering',
      branch: 'Headquarters',
    });
    console.log(`[seed] created developer user: ${email}`);
  }

  console.log(`[seed]   login: ${email} / ${password}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
