const User = require('../models/User');
const { ADMIN_ROLES } = require('./roles');

// A proadmin has no Employee record and is hidden from absolutely everyone,
// including superadmins — the only account type still hidden by design.
// Superadmin accounts are fully visible to everyone now, just like any other
// employee/role.
async function proadminUserIds() {
  const proadmins = await User.find({ role: 'proadmin' }, '_id');
  return proadmins.map((u) => u._id);
}

// Employee _ids linked to an admin or superadmin login — used to keep daily
// attendance/leave status private from plain employees even though the
// employee directory itself shows admins/superadmins like anyone else.
async function adminEmployeeIds() {
  const admins = await User.find({ role: { $in: ADMIN_ROLES } }, 'employeeRef');
  return admins.map((u) => u.employeeRef).filter(Boolean);
}

function mergeExclusion(filter, field, ids) {
  const existing = filter[field];
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    filter[field] = { ...existing, $nin: ids };
  } else if (existing !== undefined) {
    filter[field] = { $eq: existing, $nin: ids };
  } else {
    filter[field] = { $nin: ids };
  }
  return filter;
}

// No-op, kept so existing call sites don't need to change — proadmin never has
// an Employee record, so there's nothing to exclude here anymore.
async function excludeSuperadminEmployees(filter) {
  return filter;
}

// Strips out proadmin accounts, regardless of viewer.
async function excludeSuperadminUsers(filter, viewerRole, field) {
  const ids = await proadminUserIds();
  if (!ids.length) return filter;
  return mergeExclusion(filter, field, ids);
}

// A plain employee can't see an admin/superadmin's attendance or leave status —
// it stays private to admin-tier viewers, who see it same as before. Only
// applies to the specific attendance endpoints that show everyone's status
// (see attendanceController.js); the general employee directory is untouched.
async function excludeAdminAttendanceForEmployee(filter, viewerRole, field = 'employeeRef') {
  if (viewerRole !== 'employee') return filter;
  const ids = await adminEmployeeIds();
  if (!ids.length) return filter;
  return mergeExclusion(filter, field, ids);
}

async function superadminEmployeeIds() {
  const supers = await User.find({ role: 'superadmin' }, 'employeeRef');
  return supers.map((u) => u.employeeRef).filter(Boolean);
}

// Superadmin accounts never need daily attendance tracked — excluded from
// every attendance list/status/breakdown endpoint for every viewer, admins
// included, unlike excludeAdminAttendanceForEmployee above which only hides
// from plain employees.
async function excludeSuperadminAttendance(filter, field = 'employeeRef') {
  const ids = await superadminEmployeeIds();
  if (!ids.length) return filter;
  return mergeExclusion(filter, field, ids);
}

module.exports = { proadminUserIds, excludeSuperadminEmployees, excludeSuperadminUsers, excludeAdminAttendanceForEmployee, excludeSuperadminAttendance, superadminEmployeeIds };
