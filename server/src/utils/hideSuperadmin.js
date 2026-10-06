const prisma = require('../db/prisma');
const { andWhere } = require('../db');
const { ADMIN_ROLES } = require('./roles');

// All helpers here take and return a Prisma `where` object, adding a
// `{ [field]: { notIn: ids } }` condition. `field` is the Prisma column name
// (e.g. 'id', 'employeeId', 'userId'), not the old Mongo ref name.

// A proadmin has no Employee record and is hidden from absolutely everyone,
// including superadmins — the only account type still hidden by design.
// Superadmin accounts are fully visible to everyone now, just like any other
// employee/role.
async function proadminUserIds() {
  const proadmins = await prisma.user.findMany({ where: { role: 'proadmin' }, select: { id: true } });
  return proadmins.map((u) => u.id);
}

// Employee ids linked to an admin or superadmin login — used to keep daily
// attendance/leave status private from plain employees even though the
// employee directory itself shows admins/superadmins like anyone else.
async function adminEmployeeIds() {
  const admins = await prisma.user.findMany({ where: { role: { in: ADMIN_ROLES } }, select: { employeeId: true } });
  return admins.map((u) => u.employeeId).filter(Boolean);
}

function exclude(where, field, ids) {
  if (!ids.length) return where;
  return andWhere(where, { [field]: { notIn: ids } });
}

// No-op, kept so existing call sites don't need to change — proadmin never has
// an Employee record, so there's nothing to exclude here anymore.
async function excludeSuperadminEmployees(where) {
  return where;
}

// Strips out proadmin accounts, regardless of viewer.
async function excludeSuperadminUsers(where, viewerRole, field = 'id') {
  return exclude(where, field, await proadminUserIds());
}

// A plain employee can't see an admin/superadmin's attendance or leave status —
// it stays private to admin-tier viewers, who see it same as before. Only
// applies to the specific attendance endpoints that show everyone's status
// (see attendanceController.js); the general employee directory is untouched.
async function excludeAdminAttendanceForEmployee(where, viewerRole, field = 'employeeId') {
  if (viewerRole !== 'employee') return where;
  return exclude(where, field, await adminEmployeeIds());
}

async function superadminEmployeeIds() {
  const supers = await prisma.user.findMany({ where: { role: 'superadmin' }, select: { employeeId: true } });
  return supers.map((u) => u.employeeId).filter(Boolean);
}

// Superadmin accounts never need daily attendance tracked — excluded from
// every attendance list/status/breakdown endpoint for every viewer, admins
// included, unlike excludeAdminAttendanceForEmployee above which only hides
// from plain employees.
async function excludeSuperadminAttendance(where, field = 'employeeId') {
  return exclude(where, field, await superadminEmployeeIds());
}

module.exports = { proadminUserIds, excludeSuperadminEmployees, excludeSuperadminUsers, excludeAdminAttendanceForEmployee, excludeSuperadminAttendance, superadminEmployeeIds };
