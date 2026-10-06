const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { prisma, shape, shapeMany, sel } = require('../db');
const writeAudit = require('../utils/audit');
const { sendMail, templates } = require('../services/emailService');
const { OFFICE_LOCATIONS, BRANCH_LOCATIONS } = require('../utils/offices');

// Manager and HR were merged into a single 'admin' role. Above that sits a
// proadmin — invisible everywhere else in the app (see hideSuperadmin.js,
// audit.js) — whose one job is granting/revoking the 'superadmin' role and
// scoping a superadmin to a single office (managedLocation). A plain superadmin
// can still manage 'admin' accounts exactly as before, but can no longer touch
// the superadmin role or another superadmin's account — that's proadmin-only now.
const MANAGEABLE_ROLES = ['admin', 'superadmin']; // 'proadmin' is deliberately never included — it never appears here
const SAFE_FIELDS = 'name email role isActive avatarIndex avatarUrl phone department location managedLocation managedBranch branch lastLogin createdAt employeeRef promotedAdmin';

// A user row as the API returned it after `toObject()` minus the password hash —
// minus the other secrets too, which the Mongo version happened to leak.
function safeItem(user) {
  const { passwordHash, totpSecret, passwordResetToken, passwordResetExpires, ...rest } = shape('User', user);
  return rest;
}

// Regular admins only ever see their peers here — superadmin accounts are
// invisible to anyone below superadmin, and proadmin is invisible to everyone.
async function list(req, res) {
  const isProOrSuper = req.user.role === 'proadmin' || req.user.role === 'superadmin';
  const roleFilter = isProOrSuper ? { in: MANAGEABLE_ROLES } : 'admin';
  const rows = await prisma.user.findMany({ where: { role: roleFilter }, select: sel('User', SAFE_FIELDS), orderBy: { name: 'asc' } });
  // Sort by role as a string ('admin' before 'superadmin', as Mongo did) — MySQL
  // would sort the enum column by declaration order instead. Stable, so name order holds within a role.
  rows.sort((a, b) => (a.role < b.role ? -1 : a.role > b.role ? 1 : 0));
  res.json({ items: shapeMany('User', rows) });
}

// Admins are no longer typed in from scratch — an admin login must correspond to
// a real employee, picked from a dropdown (see eligibleEmployees). Name/email/phone
// come straight from that Employee record. Employees who already have their own
// login (e.g. self-registered as a plain employee) still show up here — picking
// one promotes that existing login instead of creating a second account (see
// create). Only employees who are already admins are excluded.
async function eligibleEmployees(req, res) {
  const employees = await prisma.employee.findMany({
    where: { status: 'active' },
    select: { ...sel('Employee', 'name email phone dept location roleLabel'), userRef: { select: sel('User', 'role') } },
    orderBy: { name: 'asc' },
  });

  const items = employees
    .filter((e) => !e.userRef || !MANAGEABLE_ROLES.includes(e.userRef.role))
    .map((e) => ({
      _id: e.id,
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

// No one types a password in anymore — a random one is generated so picking an
// employee and clicking Add Admin is the entire flow. It's emailed to them (and
// handed back in the response, in case mail delivery isn't configured) and they
// change it after first login.
function generatePassword() {
  return crypto.randomBytes(16).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
}

// Always creates/promotes to plain 'admin' — granting 'superadmin' is a separate,
// deliberate action a proadmin takes afterward via update() (Edit Admin), never
// something inferred or offered at creation time.
async function create(req, res) {
  const { employeeId } = req.body;
  if (!employeeId) return res.status(400).json({ message: 'employeeId is required.' });

  const employee = await prisma.employee.findUnique({ where: { id: String(employeeId) }, include: { userRef: true } });
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });

  if (employee.userRef) {
    const existingUser = employee.userRef;
    if (MANAGEABLE_ROLES.includes(existingUser.role)) {
      return res.status(409).json({ message: `${employee.name} already has admin access.` });
    }
    const promoted = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        role: 'admin',
        promotedAdmin: true,
        approvalStatus: 'approved',
        isActive: true,
        employeeId: existingUser.employeeId || employee.id,
        department: existingUser.department || employee.dept || '',
        location: existingUser.location || employee.location || '',
        phone: existingUser.phone || employee.phone || '',
      },
    });

    await writeAudit({
      ip: req.ip,
      user: req.user,
      action: 'UPDATE',
      entity: 'admins',
      recordId: promoted.id,
      detail: `Promoted ${promoted.name} (${promoted.email}) to admin`,
    });

    const { subject, html } = templates.generic(
      'Your AII Celebrations access was updated',
      `Hi <strong>${promoted.name}</strong>,</p><p>Your account now has <strong>admin</strong> access on the Employee Celebrations &amp; Events Platform. Sign in with your existing password.`
    );
    sendMail({ to: promoted.email, subject, html }).catch((err) => console.error('[admins] promotion email failed:', err.message));

    return res.status(200).json({ item: safeItem(promoted), upgraded: true });
  }

  const normalizedEmail = employee.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
  if (existing) return res.status(409).json({ message: 'An account with this email already exists.' });

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);
  // Create the login and link it both ways (users.employeeId <-> employees.userId) atomically.
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: employee.name,
        email: normalizedEmail,
        passwordHash,
        role: 'admin',
        phone: employee.phone || '',
        department: employee.dept || '',
        location: employee.location || '',
        employeeId: employee.id,
        isActive: true,
        approvalStatus: 'approved',
      },
    });
    await tx.employee.update({ where: { id: employee.id }, data: { userId: created.id } });
    return created;
  });

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'CREATE',
    entity: 'admins',
    recordId: user.id,
    detail: `Created admin account for ${user.name} (${user.email}), linked to employee ${employee.empId}`,
  });

  const { subject, html } = templates.generic(
    'Your AII Celebrations admin account',
    `Hi <strong>${user.name}</strong>,</p><p>An account with <strong>admin</strong> access has been created for you on the Employee Celebrations &amp; Events Platform.</p><p>Email: <strong>${user.email}</strong><br/>Temporary password: <strong>${password}</strong></p><p>Please sign in and change your password as soon as possible.`
  );
  sendMail({ to: user.email, subject, html }).catch((err) => console.error('[admins] welcome email failed:', err.message));

  res.status(201).json({ item: safeItem(user), tempPassword: password });
}

// Both proadmin and superadmin can reach this route (see adminRoutes.js), but a
// plain superadmin is boxed in here: they can't touch an existing superadmin
// account, and can't grant the superadmin role — only a proadmin can do either.
// Branch/office scoping (managedBranch/managedLocation) is different: it now
// applies to both admin and superadmin targets, and a plain superadmin may set
// it on an admin (HR) account they manage, same as a proadmin can on anyone —
// they just still can't touch a superadmin target at all (blocked above).
async function update(req, res) {
  const target = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
  if (!target) return res.status(404).json({ message: 'Admin account not found.' });
  if (!MANAGEABLE_ROLES.includes(target.role)) return res.status(404).json({ message: 'Admin account not found.' });

  const isProadmin = req.user.role === 'proadmin';
  const canScope = isProadmin || req.user.role === 'superadmin';
  const { name, role, isActive, phone, department, location, managedLocation, managedBranch } = req.body;

  if (!isProadmin && target.role === 'superadmin') {
    return res.status(403).json({ message: 'You do not have permission to manage a superadmin account.' });
  }
  if (!isProadmin && role && role !== 'admin') {
    return res.status(403).json({ message: 'You do not have permission to grant the superadmin role.' });
  }

  // The app requires at least one active admin AND at least one active superadmin
  // at all times — demoting/deactivating the last one of either is declined with
  // a warning to create a replacement first.
  const demotingOrDeactivating = target.isActive && ((role && role !== target.role) || isActive === false);
  if (demotingOrDeactivating) {
    const otherActive = await prisma.user.count({ where: { role: target.role, isActive: true, id: { not: target.id } } });
    if (otherActive === 0) {
      return res.status(400).json({
        message: `At least one active ${target.role} must remain. Please create another ${target.role} before removing this one.`,
      });
    }
  }

  // Collected as the changed fields (the old code mutated the doc and called save()).
  const data = {};
  if (role) {
    const grantable = isProadmin ? ['admin', 'superadmin'] : ['admin'];
    if (!grantable.includes(role)) return res.status(400).json({ message: `role must be one of ${grantable.join(', ')}.` });
    data.role = role;
  }
  // managedBranch is the authoritative source when sent — it always drives
  // managedLocation (see BRANCH_LOCATIONS), so a stray/mismatched managedLocation
  // sent alongside it in the same request is ignored rather than trusted.
  if (canScope && managedBranch !== undefined) {
    if (managedBranch && !BRANCH_LOCATIONS[managedBranch]) {
      return res.status(400).json({ message: `Unknown branch: ${managedBranch}` });
    }
    data.managedBranch = managedBranch || '';
    data.managedLocation = managedBranch ? BRANCH_LOCATIONS[managedBranch] : '';
  } else if (canScope && managedLocation !== undefined) {
    if (managedLocation && !OFFICE_LOCATIONS.includes(managedLocation)) {
      return res.status(400).json({ message: `Unknown office: ${managedLocation}` });
    }
    data.managedLocation = managedLocation || '';
  }
  if (name && name.trim()) data.name = name.trim();
  if (typeof isActive === 'boolean') data.isActive = isActive;
  if (phone !== undefined) data.phone = String(phone ?? '');
  if (department !== undefined) data.department = String(department ?? '');
  if (location !== undefined) data.location = String(location ?? '');

  // Assigning an office manager (admin or superadmin) moves their own employee
  // record there too — so office-scoped Employee lists (see officeScope.js)
  // start showing them under the new office and stop showing them under the old one.
  const effectiveManagedLocation = data.managedLocation !== undefined ? data.managedLocation : target.managedLocation;
  if (canScope && effectiveManagedLocation && target.employeeId) {
    data.location = effectiveManagedLocation;
    await prisma.employee.updateMany({ where: { id: target.employeeId }, data: { location: effectiveManagedLocation } });
  }

  const updated = await prisma.user.update({ where: { id: target.id }, data });

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'admins',
    recordId: updated.id,
    detail: `Updated admin account for ${updated.name} (${updated.email})`,
  });

  res.json({ item: safeItem(updated) });
}

async function remove(req, res) {
  const target = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
  if (!target) return res.status(404).json({ message: 'Admin account not found.' });
  if (!MANAGEABLE_ROLES.includes(target.role)) return res.status(404).json({ message: 'Admin account not found.' });
  if (String(target.id) === String(req.user._id)) {
    return res.status(400).json({ message: 'You cannot delete your own account.' });
  }

  const isProadmin = req.user.role === 'proadmin';
  if (!isProadmin && target.role === 'superadmin') {
    return res.status(403).json({ message: 'You do not have permission to remove a superadmin account.' });
  }

  // The app requires at least one active admin AND at least one active superadmin
  // at all times — deleting (or revoking) the last active one of either is
  // declined with a warning to create a replacement first. Removing an account
  // that's already inactive never shrinks the active count, so it's unaffected.
  if (target.isActive) {
    const otherActive = await prisma.user.count({ where: { role: target.role, isActive: true, id: { not: target.id } } });
    if (otherActive === 0) {
      return res.status(400).json({
        message: `At least one active ${target.role} must remain. Please create another ${target.role} before deleting this one.`,
      });
    }
  }

  // A promoted login pre-existed as the employee's own account — revoke admin
  // access but keep it alive, rather than deleting their only way to sign in.
  if (target.promotedAdmin) {
    await prisma.user.update({
      where: { id: target.id },
      data: { role: 'employee', promotedAdmin: false, managedLocation: '', managedBranch: '' },
    });
    await writeAudit({
      ip: req.ip,
      user: req.user,
      action: 'UPDATE',
      entity: 'admins',
      recordId: target.id,
      detail: `Revoked admin access for ${target.name} (${target.email}), reverted to employee login`,
    });
    return res.json({ message: 'Admin access revoked. Their employee login remains active.' });
  }

  // Unlink the employee record, then delete the login (the employees.userId FK is
  // also ON DELETE SET NULL, so the link can't dangle either way).
  await prisma.$transaction([
    ...(target.employeeId ? [prisma.employee.updateMany({ where: { id: target.employeeId }, data: { userId: null } })] : []),
    prisma.user.delete({ where: { id: target.id } }),
  ]);
  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'DELETE',
    entity: 'admins',
    recordId: target.id,
    detail: `Deleted admin account for ${target.name} (${target.email})`,
  });
  res.json({ message: 'Admin account deleted.' });
}

module.exports = { list, eligibleEmployees, create, update, remove };
