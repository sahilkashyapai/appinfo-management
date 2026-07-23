const bcrypt = require('bcryptjs');
const User = require('../models/User');
const writeAudit = require('../utils/audit');
const { sendMail, templates } = require('../services/emailService');

// Existing superadmin accounts remain visible/manageable (deactivate, delete) by a
// superadmin — but nobody, not even a superadmin, can GRANT the superadmin role
// through this panel anymore. It's not a role you pick from a list; promoting
// someone to it is a deliberate, out-of-band action.
const MANAGEABLE_ROLES = ['manager', 'hr', 'superadmin'];
const SETTABLE_ROLES = ['manager', 'hr'];
const SAFE_FIELDS = 'name email role isActive avatarIndex avatarUrl phone department location branch lastLogin createdAt employeeRef';

// Regular admins (hr/manager) only ever see their peers here — superadmin accounts
// are invisible to anyone below superadmin, by design.
async function list(req, res) {
  const roleFilter = req.user.role === 'superadmin' ? { $in: MANAGEABLE_ROLES } : { $in: SETTABLE_ROLES };
  const items = await User.find({ role: roleFilter }).select(SAFE_FIELDS).sort({ role: 1, name: 1 });
  res.json({ items });
}

async function create(req, res) {
  const { name, email, password, role, phone, department, location } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'name, email, password and role are required.' });
  }
  if (!SETTABLE_ROLES.includes(role)) {
    return res.status(400).json({ message: `role must be one of ${SETTABLE_ROLES.join(', ')}.` });
  }
  if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });

  const normalizedEmail = String(email).toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) return res.status(409).json({ message: 'An account with this email already exists.' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role,
    phone: phone || '',
    department: department || '',
    location: location || '',
    isActive: true,
    approvalStatus: 'approved',
  });

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'CREATE',
    entity: 'admins',
    recordId: user._id,
    detail: `Created ${role} account for ${user.name} (${user.email})`,
  });

  const { subject, html } = templates.generic(
    'Your AII Celebrations admin account',
    `Hi <strong>${user.name}</strong>,</p><p>An account with <strong>${role}</strong> access has been created for you on the Employee Celebrations &amp; Events Platform.</p><p>Email: <strong>${user.email}</strong><br/>Temporary password: <strong>${password}</strong></p><p>Please sign in and change your password as soon as possible.`
  );
  sendMail({ to: user.email, subject, html }).catch((err) => console.error('[admins] welcome email failed:', err.message));

  const { passwordHash: _omit, ...rest } = user.toObject();
  res.status(201).json({ item: rest });
}

async function update(req, res) {
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ message: 'Admin account not found.' });
  if (!MANAGEABLE_ROLES.includes(target.role)) return res.status(404).json({ message: 'Admin account not found.' });
  if (target.employeeRef) {
    return res.status(400).json({ message: 'This account is linked to an employee record — manage it from the Employees page instead.' });
  }

  const isSuperadmin = req.user.role === 'superadmin';

  // Regular admins (hr/manager) may change a peer's role — nothing else. They can
  // never touch a superadmin account, and can never grant the superadmin role.
  if (!isSuperadmin) {
    if (target.role === 'superadmin') return res.status(403).json({ message: 'You do not have permission to manage a superadmin account.' });
    if (String(target._id) === String(req.user._id)) return res.status(403).json({ message: 'You cannot change your own role.' });

    const { role } = req.body;
    if (!role) return res.status(400).json({ message: 'role is required.' });
    if (!SETTABLE_ROLES.includes(role)) return res.status(400).json({ message: `role must be one of ${SETTABLE_ROLES.join(', ')}.` });

    target.role = role;
    await target.save();
    await writeAudit({
      ip: req.ip,
      user: req.user,
      action: 'UPDATE',
      entity: 'admins',
      recordId: target._id,
      detail: `Changed role of ${target.name} (${target.email}) to ${role}`,
    });
    const { passwordHash: _omit, ...rest } = target.toObject();
    return res.json({ item: rest });
  }

  const { name, role, isActive, phone, department, location } = req.body;
  const demotingOrDeactivating = target.role === 'superadmin' && ((role && role !== 'superadmin') || isActive === false);
  if (demotingOrDeactivating) {
    const otherActiveSuperadmins = await User.countDocuments({ role: 'superadmin', isActive: true, _id: { $ne: target._id } });
    if (otherActiveSuperadmins === 0) {
      return res.status(400).json({ message: 'At least one active superadmin must remain.' });
    }
  }

  if (role) {
    if (!SETTABLE_ROLES.includes(role)) return res.status(400).json({ message: `role must be one of ${SETTABLE_ROLES.join(', ')}.` });
    target.role = role;
  }
  if (name && name.trim()) target.name = name.trim();
  if (typeof isActive === 'boolean') target.isActive = isActive;
  if (phone !== undefined) target.phone = phone;
  if (department !== undefined) target.department = department;
  if (location !== undefined) target.location = location;
  await target.save();

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'admins',
    recordId: target._id,
    detail: `Updated admin account for ${target.name} (${target.email})`,
  });

  const { passwordHash: _omit, ...rest } = target.toObject();
  res.json({ item: rest });
}

async function remove(req, res) {
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ message: 'Admin account not found.' });
  if (!MANAGEABLE_ROLES.includes(target.role)) return res.status(404).json({ message: 'Admin account not found.' });
  if (target.employeeRef) {
    return res.status(400).json({ message: 'This account is linked to an employee record — manage it from the Employees page instead.' });
  }
  if (String(target._id) === String(req.user._id)) {
    return res.status(400).json({ message: 'You cannot delete your own account.' });
  }
  if (target.role === 'superadmin') {
    const otherActiveSuperadmins = await User.countDocuments({ role: 'superadmin', isActive: true, _id: { $ne: target._id } });
    if (otherActiveSuperadmins === 0) return res.status(400).json({ message: 'At least one active superadmin must remain.' });
  }

  await target.deleteOne();
  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'DELETE',
    entity: 'admins',
    recordId: target._id,
    detail: `Deleted admin account for ${target.name} (${target.email})`,
  });
  res.json({ message: 'Admin account deleted.' });
}

module.exports = { list, create, update, remove };
