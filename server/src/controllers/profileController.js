const { prisma, shapeMany } = require('../db');
const { toSafeUser } = require('../db/users');
const writeAudit = require('../utils/audit');
const { BRANCH_LOCATIONS } = require('../utils/offices');
const { BRANCH_EDITOR_ROLES } = require('../utils/roles');

async function getProfile(req, res) {
  const [employees, events, notifications, wallPosts, activity] = await Promise.all([
    prisma.employee.count(),
    prisma.event.count(),
    prisma.notification.count(),
    prisma.wallPost.count(),
    prisma.auditLog.findMany({ where: { actorId: String(req.user._id) }, orderBy: { createdAt: 'desc' }, take: 10 }),
  ]);
  res.json({
    user: toSafeUser(req.user),
    platformStats: { employees, events, notifications, wallPosts },
    activity: shapeMany('AuditLog', activity),
  });
}

async function updateProfile(req, res) {
  const { name, email, phone, department, location, branch, avatarUrl } = req.body;
  const updates = {};
  if (name) updates.name = String(name).trim();
  if (email) updates.email = String(email).toLowerCase().trim();
  if (phone !== undefined) updates.phone = String(phone ?? '');
  if (department !== undefined) updates.department = String(department ?? '');
  if (location !== undefined) updates.location = String(location ?? '');
  // Branch determines office scoping downstream (see managedBranch/managedLocation
  // in adminController), so only a superadmin or proadmin may change their own
  // branch - anyone else's request to change it is silently ignored rather than accepted.
  if (branch !== undefined && BRANCH_EDITOR_ROLES.includes(req.user.role)) {
    if (branch && !BRANCH_LOCATIONS[branch]) {
      return res.status(400).json({ message: `Unknown branch: ${branch}` });
    }
    updates.branch = String(branch ?? '');
    if (branch) updates.location = BRANCH_LOCATIONS[branch];
  }
  if (avatarUrl !== undefined) {
    if (avatarUrl && !avatarUrl.startsWith('data:image/')) return res.status(400).json({ message: 'Invalid image data.' });
    updates.avatarUrl = avatarUrl;
  }

  const user = await prisma.user.update({ where: { id: String(req.user._id) }, data: updates });

  // Keep the linked Employee directory record in sync so admins see the same
  // name/email/phone/location the user just set on their own profile.
  if (user.employeeId) {
    const empUpdates = {};
    if (updates.name !== undefined) empUpdates.name = updates.name;
    if (updates.email !== undefined) empUpdates.email = updates.email;
    if (updates.phone !== undefined) empUpdates.phone = updates.phone;
    if (updates.location !== undefined) empUpdates.location = updates.location;
    if (Object.keys(empUpdates).length) {
      try {
        await prisma.employee.update({ where: { id: user.employeeId }, data: empUpdates });
      } catch (err) {
        console.error('[profile] could not sync Employee record:', err.message);
      }
    }
  }

  await writeAudit({ ip: req.ip, user, action: 'UPDATE', entity: 'users', recordId: user.id, detail: 'Updated profile' });
  res.json({ user: toSafeUser(user) });
}

module.exports = { getProfile, updateProfile };
