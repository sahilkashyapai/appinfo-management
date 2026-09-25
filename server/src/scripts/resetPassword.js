// Usage: node src/scripts/resetPassword.js <email> <newPassword>
// Resets a user's password and clears any failed-login lockout.
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: node src/scripts/resetPassword.js <email> <newPassword>');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const users = mongoose.connection.db.collection('users');
  const result = await users.updateOne(
    { email: email.toLowerCase().trim() },
    {
      $set: { passwordHash: await bcrypt.hash(password, 10), failedAttempts: 0, isActive: true },
      $unset: { lockUntil: '' },
    }
  );

  if (!result.matchedCount) console.error(`No user found with email ${email}`);
  else console.log(`Password reset for ${email}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
