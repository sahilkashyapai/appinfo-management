// Usage: node src/scripts/resetPassword.js <email> <newPassword>
// Resets a user's password and clears any failed-login lockout.
require('dotenv').config();
const prisma = require('../db/prisma');
const bcrypt = require('bcryptjs');

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: node src/scripts/resetPassword.js <email> <newPassword>');
    process.exit(1);
  }

  const result = await prisma.user.updateMany({
    where: { email: email.toLowerCase().trim() },
    data: { passwordHash: await bcrypt.hash(password, 10), failedAttempts: 0, isActive: true, lockUntil: null },
  });

  if (!result.count) console.error(`No user found with email ${email}`);
  else console.log(`Password reset for ${email}`);
  await prisma.$disconnect();
}

// Runs only when executed directly (node <file>), never when required.
if (require.main === module) {
  main().catch(async (err) => {
    console.error(err.message);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
}
