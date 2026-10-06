const prisma = require('./prisma');
const { shape } = require('./shape');

// req.user is a plain, Mongo-shaped user object (see shape.js): `_id`,
// `employeeRef` (the linked employee's id or null), and every other column.
async function loadUser(id) {
  if (!id) return null;
  const row = await prisma.user.findUnique({ where: { id: String(id) } });
  return row ? shape('User', row) : null;
}

// What the old User#toSafeJSON returned - never includes secrets.
function toSafeUser(u) {
  return {
    id: u.id ?? u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    employeeRef: u.employeeRef ?? u.employeeId ?? null,
    isActive: u.isActive,
    avatarIndex: u.avatarIndex,
    avatarUrl: u.avatarUrl ?? '',
    totpEnabled: u.totpEnabled,
    lastLogin: u.lastLogin,
    phone: u.phone,
    department: u.department,
    location: u.location,
    managedLocation: u.managedLocation,
    managedBranch: u.managedBranch,
    branch: u.branch,
    approvalStatus: u.approvalStatus,
  };
}

module.exports = { loadUser, toSafeUser };
