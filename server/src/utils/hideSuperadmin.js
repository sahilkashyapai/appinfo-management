const Employee = require('../models/Employee');
const User = require('../models/User');

// A superadmin's own Employee record (if any) is invisible to anyone below
// superadmin — across employee lists, org chart, approval queues, assets,
// reports, search, everything. Resolved by *current* role, not a stored flag,
// so a role change takes effect immediately everywhere.
async function superadminEmployeeIds() {
  const superadmins = await User.find({ role: 'superadmin' }, '_id');
  if (!superadmins.length) return [];
  const employees = await Employee.find({ userRef: { $in: superadmins.map((u) => u._id) } }, '_id');
  return employees.map((e) => e._id);
}

async function superadminUserIds() {
  const superadmins = await User.find({ role: 'superadmin' }, '_id');
  return superadmins.map((u) => u._id);
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

// Merges an `employeeRef`-exclusion into an existing Mongo filter, only when the
// viewer isn't superadmin. Safe to call unconditionally from any controller.
async function excludeSuperadminEmployees(filter, viewerRole, field = 'employeeRef') {
  if (viewerRole === 'superadmin') return filter;
  const ids = await superadminEmployeeIds();
  if (!ids.length) return filter;
  return mergeExclusion(filter, field, ids);
}

// Same idea, but for content directly authored by a User account (wall posts,
// leaderboard) rather than linked through an Employee record.
async function excludeSuperadminUsers(filter, viewerRole, field) {
  if (viewerRole === 'superadmin') return filter;
  const ids = await superadminUserIds();
  if (!ids.length) return filter;
  return mergeExclusion(filter, field, ids);
}

module.exports = { superadminEmployeeIds, superadminUserIds, excludeSuperadminEmployees, excludeSuperadminUsers };
