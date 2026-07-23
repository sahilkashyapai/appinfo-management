const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const Employee = require('../models/Employee');
const writeAudit = require('../utils/audit');
const { sendMail, templates } = require('../services/emailService');

// Existing superadmin accounts remain visible/manageable (deactivate, delete) by a
// superadmin — but nobody, not even a superadmin, can GRANT the superadmin role
// through this panel anymore. It's not a role you pick from a list; promoting
// someone to it is a deliberate, out-of-band action.
const MANAGEABLE_ROLES = ['manager', 'hr', 'superadmin'];
const SETTABLE_ROLES = ['manager', 'hr'];
const SAFE_FIELDS = 'name email role isActive avatarIndex avatarUrl phone department location branch lastLogin createdAt employeeRef promotedAdmin';

// Regular admins (hr/manager) only ever see their peers here — superadmin accounts
// are invisible to anyone below superadmin, by design.
async function list(req, res) {
  const roleFilter = req.user.role === 'superadmin' ? { $in: MANAGEABLE_ROLES } : { $in: SETTABLE_ROLES };
  const items = await User.find({ role: roleFilter }).select(SAFE_FIELDS).sort({ role: 1, name: 1 });
  res.json({ items });
}

// Admins are no longer typed in from scratch — an admin login must correspond to
// a real employee, picked from a dropdown (see eligibleEmployees). Name/email/phone
// come straight from that Employee record; role is inferred from their Role Label
// (see roleFromLabel) rather than picked separately. Employees who already have
// their own login (e.g. self-registered as a plain employee) still show up here —
// picking one promotes that existing login's role instead of creating a second
// account (see create). Only employees who are already admins are excluded.
async function eligibleEmployees(req, res) {
  const employees = await Employee.find({ status: 'active' })
    .select('name email phone dept location roleLabel userRef')
    .populate('userRef', 'role')
    .sort({ name: 1 });

  const items = employees
    .filter((e) => !e.userRef || !MANAGEABLE_ROLES.includes(e.userRef.role))
    .map((e) => ({
      _id: e._id,
      name: e.name,
      email: e.email,
      phone: e.phone,
      dept: e.dept,
      location: e.location,
      roleLabel: e.roleLabel,
      hasLogin: !!e.userRef,
    }));
  res.json({ items });
}

function roleFromLabel(roleLabel) {
  return /hr/i.test(roleLabel || '') ? 'hr' : 'manager';
}

// No one types a password in anymore — a random one is generated so picking an
// employee and clicking Add Admin is the entire flow. It's emailed to them (and
// handed back in the response, in case mail delivery isn't configured) and they
// change it after first login.
function generatePassword() {
  return crypto.randomBytes(16).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
}

async function create(req, res) {
  const { employeeId } = req.body;
  if (!employeeId) return res.status(400).json({ message: 'employeeId is required.' });

  const employee = await Employee.findById(employeeId).populate('userRef');
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });

  const role = roleFromLabel(employee.roleLabel);

  // Employee already has their own login (e.g. self-registered) — promote that
  // account's role instead of creating a second, conflicting one.
  if (employee.userRef) {
    const existingUser = employee.userRef;
    if (MANAGEABLE_ROLES.includes(existingUser.role)) {
      return res.status(409).json({ message: `${employee.name} already has admin access.` });
    }
    existingUser.role = role;
    existingUser.promotedAdmin = true;
    existingUser.approvalStatus = 'approved';
    existingUser.isActive = true;
    existingUser.employeeRef = existingUser.employeeRef || employee._id;
    existingUser.department = existingUser.department || employee.dept || '';
    existingUser.location = existingUser.location || employee.location || '';
    existingUser.phone = existingUser.phone || employee.phone || '';
    await existingUser.save();

    await writeAudit({
      ip: req.ip,
      user: req.user,
      action: 'UPDATE',
      entity: 'admins',
      recordId: existingUser._id,
      detail: `Promoted ${existingUser.name} (${existingUser.email}) to ${role}`,
    });

    const { subject, html } = templates.generic(
      'Your AII Celebrations access was updated',
      `Hi <strong>${existingUser.name}</strong>,</p><p>Your account now has <strong>${role}</strong> access on the Employee Celebrations &amp; Events Platform. Sign in with your existing password.`
    );
    sendMail({ to: existingUser.email, subject, html }).catch((err) => console.error('[admins] promotion email failed:', err.message));

    const { passwordHash: _omit, ...rest } = existingUser.toObject();
    return res.status(200).json({ item: rest, upgraded: true });
  }

  const normalizedEmail = employee.email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) return res.status(409).json({ message: 'An account with this email already exists.' });

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name: employee.name,
    email: normalizedEmail,
    passwordHash,
    role,
    phone: employee.phone || '',
    department: employee.dept || '',
    location: employee.location || '',
    employeeRef: employee._id,
    isActive: true,
    approvalStatus: 'approved',
  });

  employee.userRef = user._id;
  await employee.save();

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'CREATE',
    entity: 'admins',
    recordId: user._id,
    detail: `Created ${role} account for ${user.name} (${user.email}), linked to employee ${employee.empId}`,
  });

  const { subject, html } = templates.generic(
    'Your AII Celebrations admin account',
    `Hi <strong>${user.name}</strong>,</p><p>An account with <strong>${role}</strong> access has been created for you on the Employee Celebrations &amp; Events Platform.</p><p>Email: <strong>${user.email}</strong><br/>Temporary password: <strong>${password}</strong></p><p>Please sign in and change your password as soon as possible.`
  );
  sendMail({ to: user.email, subject, html }).catch((err) => console.error('[admins] welcome email failed:', err.message));

  const { passwordHash: _omit, ...rest } = user.toObject();
  res.status(201).json({ item: rest, tempPassword: password });
}

async function update(req, res) {
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ message: 'Admin account not found.' });
  if (!MANAGEABLE_ROLES.includes(target.role)) return res.status(404).json({ message: 'Admin account not found.' });

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
  if (String(target._id) === String(req.user._id)) {
    return res.status(400).json({ message: 'You cannot delete your own account.' });
  }
  if (target.role === 'superadmin') {
    const otherActiveSuperadmins = await User.countDocuments({ role: 'superadmin', isActive: true, _id: { $ne: target._id } });
    if (otherActiveSuperadmins === 0) return res.status(400).json({ message: 'At least one active superadmin must remain.' });
  }

  // A promoted login pre-existed as the employee's own account — revoke admin
  // access but keep it alive, rather than deleting their only way to sign in.
  if (target.promotedAdmin) {
    target.role = 'employee';
    target.promotedAdmin = false;
    await target.save();
    await writeAudit({
      ip: req.ip,
      user: req.user,
      action: 'UPDATE',
      entity: 'admins',
      recordId: target._id,
      detail: `Revoked admin access for ${target.name} (${target.email}), reverted to employee login`,
    });
    return res.json({ message: 'Admin access revoked. Their employee login remains active.' });
  }

  if (target.employeeRef) {
    await Employee.updateOne({ _id: target.employeeRef }, { userRef: null });
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

module.exports = { list, eligibleEmployees, create, update, remove };
