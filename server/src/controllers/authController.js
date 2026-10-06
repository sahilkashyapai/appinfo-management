const bcrypt = require('bcryptjs');
const { cleanBankDetails, hasAny } = require('../utils/bankDetails');
const crypto = require('crypto');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');

const { prisma } = require('../db');
const { loadUser, toSafeUser } = require('../db/users');
const getSettings = require('../utils/getSettings');
const writeAudit = require('../utils/audit');
const { EMP_ID_PREFIX, EMP_ID_REGEX } = require('../utils/empId');
const { signAuthToken, signTwoFactorChallengeToken, verifyToken } = require('../utils/token');
const { sendMail, templates } = require('../services/emailService');

const LOCK_ATTEMPTS = 5;
const LOCK_MINUTES = 30;

async function register(req, res) {
  const { name, email, password, empId, phone, dob, joined, department } = req.body;
  if (!name || !email || !password || !empId || !phone || !dob || !joined || !department) {
    return res.status(400).json({
      message: 'Full name, official email, employee ID, mobile number, date of birth, date of joining and department are all required.',
    });
  }
  if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });

  const normalizedEmail = String(email).toLowerCase().trim();
  const trimmedEmpId = String(empId).trim().toUpperCase();
  const trimmedPhone = String(phone).trim();
  if (!EMP_ID_REGEX.test(trimmedEmpId)) {
    return res.status(400).json({ message: `Employee ID must look like ${EMP_ID_PREFIX}000071 (as given to you by HR).` });
  }

  // Exact name match - the MySQL collation makes it case-insensitive, like the old /^name$/i.
  const dept = await prisma.department.findFirst({ where: { name: { equals: String(department) } } });
  if (!dept) return res.status(400).json({ message: `Unknown department: ${department}` });

  const idOnly = { select: { id: true } };
  const [existingUser, existingEmployeeByEmail, existingEmployeeByEmpId, existingUserByPhone, existingEmployeeByPhone] = await Promise.all([
    prisma.user.findFirst({ where: { email: normalizedEmail }, ...idOnly }),
    prisma.employee.findFirst({ where: { email: normalizedEmail }, ...idOnly }),
    prisma.employee.findFirst({ where: { empId: trimmedEmpId }, ...idOnly }),
    prisma.user.findFirst({ where: { phone: trimmedPhone }, ...idOnly }),
    prisma.employee.findFirst({ where: { phone: trimmedPhone }, ...idOnly }),
  ]);
  if (existingUser) return res.status(409).json({ message: 'An account with this email already exists.' });
  if (existingEmployeeByEmail || existingEmployeeByEmpId) {
    return res.status(409).json({ message: 'This employee ID or email is already on file. Please contact HR instead of registering again.' });
  }
  if (existingUserByPhone || existingEmployeeByPhone) {
    return res.status(409).json({ message: 'This mobile number is already on file. Please contact HR instead of registering again.' });
  }

  const bank = cleanBankDetails(req.body); // throws 400 on a malformed PAN/IFSC/account

  let user;
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    user = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: normalizedEmail,
        passwordHash,
        role: 'employee',
        empId: trimmedEmpId,
        phone: trimmedPhone,
        dob: new Date(dob),
        joined: new Date(joined),
        department: dept.name,
        approvalStatus: 'pending',
        // Saved by the employee themselves, so locked from now on (see bankDetailsController).
        ...(hasAny(bank) ? { bankDetails: { create: { ...bank, lockedAt: new Date() } } } : {}),
      },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }
    throw err;
  }

  await writeAudit({ ip: req.ip, user, action: 'CREATE', entity: 'users', recordId: user.id, detail: `Self-registration submitted by ${user.name}, awaiting approval` });
  res.status(201).json({ message: 'Registration submitted. An admin will review your details and activate your account.' });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

  const settings = await getSettings();
  const found = await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() }, select: { id: true } });
  const user = found ? await loadUser(found.id) : null;

  if (!user || !user.isActive) {
    await writeAudit({ ip: req.ip, action: 'LOGIN_FAILED', entity: 'users', recordId: email, detail: 'Unknown or inactive account' });
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  if (settings.security.accountLockout && user.lockUntil && user.lockUntil > new Date()) {
    const minsLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
    return res.status(423).json({ message: `Account locked. Try again in ${minsLeft} minute(s).` });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    if (settings.security.accountLockout) {
      const failedAttempts = user.failedAttempts + 1;
      const data =
        failedAttempts >= LOCK_ATTEMPTS
          ? { failedAttempts: 0, lockUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000) }
          : { failedAttempts };
      await prisma.user.update({ where: { id: user.id }, data });
    }
    await writeAudit({ ip: req.ip, user, action: 'LOGIN_FAILED', entity: 'users', recordId: user._id, detail: 'Wrong password' });
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  if (user.approvalStatus === 'pending') {
    return res.status(403).json({ message: 'Your account is awaiting admin approval. You will be notified by email once it is activated.' });
  }
  if (user.approvalStatus === 'rejected') {
    return res.status(403).json({ message: user.rejectionReason ? `Registration rejected: ${user.rejectionReason}` : 'Your registration was rejected. Please contact HR.' });
  }

  if (user.totpEnabled) {
    await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockUntil: null } });
    return res.json({ requires2fa: true, tempToken: signTwoFactorChallengeToken(user) });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockUntil: null, lastLogin: new Date() },
  });
  const token = signAuthToken(user, settings.security.sessionTimeoutMins);
  await writeAudit({ ip: req.ip, user, action: 'LOGIN', entity: 'users', recordId: user._id, detail: 'Signed in' });
  res.json({ token, user: toSafeUser(updated) });
}

async function verify2fa(req, res) {
  const { tempToken, code } = req.body;
  if (!tempToken || !code) return res.status(400).json({ message: 'tempToken and code are required.' });

  let payload;
  try {
    payload = verifyToken(tempToken);
  } catch {
    return res.status(401).json({ message: 'Two-factor session expired, please log in again.' });
  }
  if (payload.stage !== '2fa_pending') return res.status(401).json({ message: 'Invalid session.' });

  const user = await loadUser(payload.sub);
  if (!user || !user.totpEnabled) return res.status(401).json({ message: 'Invalid session.' });

  const valid = authenticator.check(code, user.totpSecret);
  if (!valid) return res.status(401).json({ message: 'Incorrect authentication code.' });

  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
  const settings = await getSettings();
  const token = signAuthToken(user, settings.security.sessionTimeoutMins);
  await writeAudit({ ip: req.ip, user, action: 'LOGIN', entity: 'users', recordId: user._id, detail: 'Signed in (2FA)' });
  res.json({ token, user: toSafeUser(updated) });
}

async function me(req, res) {
  res.json({ user: toSafeUser(req.user) });
}

async function logout(req, res) {
  await writeAudit({ ip: req.ip, user: req.user, action: 'LOGOUT', entity: 'users', recordId: req.user._id, detail: 'Signed out' });
  res.json({ message: 'Signed out.' });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ message: 'Provide current password and a new password of at least 8 characters.' });
  }
  const user = await prisma.user.findUnique({ where: { id: String(req.user._id) }, select: { id: true, passwordHash: true } });
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Current password is incorrect.' });

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'users', recordId: user.id, detail: 'Changed password' });
  res.json({ message: 'Password changed. Please sign in again.' });
}

async function forgotPassword(req, res) {
  const { email } = req.body;
  const user = await prisma.user.findUnique({
    where: { email: String(email || '').toLowerCase().trim() },
    select: { id: true, email: true },
  });
  // Always respond success to avoid leaking which emails are registered.
  if (user) {
    const resetToken = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: crypto.createHash('sha256').update(resetToken).digest('hex'),
        passwordResetExpires: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    const { subject, html } = templates.generic(
      'Reset your AII Celebrations password',
      `Use this token within 30 minutes to reset your password: <code>${resetToken}</code>`
    );
    await sendMail({ to: user.email, subject, html });
  }
  res.json({ message: 'If that email exists, a password reset link has been sent.' });
}

async function resetPassword(req, res) {
  const { email, resetToken, newPassword } = req.body;
  if (!email || !resetToken || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ message: 'Email, resetToken and a new password of at least 8 characters are required.' });
  }
  const hashed = crypto.createHash('sha256').update(String(resetToken)).digest('hex');
  const user = await prisma.user.findFirst({
    where: {
      email: String(email).toLowerCase().trim(),
      passwordResetToken: hashed,
      passwordResetExpires: { gt: new Date() },
    },
    select: { id: true },
  });
  if (!user) return res.status(400).json({ message: 'Reset token is invalid or has expired.' });

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10), passwordResetToken: null, passwordResetExpires: null },
  });
  res.json({ message: 'Password reset. Please sign in with your new password.' });
}

async function setup2fa(req, res) {
  const secret = authenticator.generateSecret();
  const uri = authenticator.keyuri(req.user.email, 'AII Celebrations', secret);
  const qrDataUrl = await qrcode.toDataURL(uri);
  // Stored but not enabled until verified via enable2fa.
  await prisma.user.update({ where: { id: String(req.user._id) }, data: { totpSecret: secret } });
  res.json({ secret, qrDataUrl });
}

async function enable2fa(req, res) {
  const { code } = req.body;
  const user = await prisma.user.findUnique({ where: { id: String(req.user._id) }, select: { id: true, totpSecret: true } });
  if (!user.totpSecret) return res.status(400).json({ message: 'Call setup first.' });
  const valid = authenticator.check(code, user.totpSecret);
  if (!valid) return res.status(400).json({ message: 'Incorrect code. Scan the QR again and retry.' });
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'users', recordId: user.id, detail: 'Enabled 2FA' });
  res.json({ message: 'Two-factor authentication enabled.' });
}

async function disable2fa(req, res) {
  const user = await prisma.user.update({
    where: { id: String(req.user._id) },
    data: { totpEnabled: false, totpSecret: null },
    select: { id: true },
  });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'users', recordId: user.id, detail: 'Disabled 2FA' });
  res.json({ message: 'Two-factor authentication disabled.' });
}

module.exports = {
  register,
  login,
  verify2fa,
  me,
  logout,
  changePassword,
  forgotPassword,
  resetPassword,
  setup2fa,
  enable2fa,
  disable2fa,
};
