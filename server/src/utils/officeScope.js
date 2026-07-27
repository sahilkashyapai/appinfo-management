const Employee = require('../models/Employee');
const User = require('../models/User');

// Resolves the one office a viewer is restricted to, or null for unrestricted
// (company-wide) access. Three distinct ways a viewer ends up restricted:
//  - A superadmin a proadmin has explicitly opted in via managedLocation.
//  - An admin (merged Manager/HR) a superadmin or proadmin has opted in the
//    same way — same managedLocation field, same effect.
//  - A plain employee — automatically restricted to their own Employee.location,
//    no admin setup needed; every employee only ever sees their own office.
// 'proadmin' never reaches these checks (it has no operational access at all —
// see roles.js).
async function resolveScopeLocation(user) {
  if (!user) return null;
  if (user.role === 'superadmin' || user.role === 'admin') return user.managedLocation || null;
  if (user.role === 'employee') {
    if (!user.employeeRef) return null;
    const emp = await Employee.findById(user.employeeRef, 'location');
    return emp?.location || null;
  }
  return null;
}

async function isOfficeScoped(user) {
  return !!(await resolveScopeLocation(user));
}

// Convenience for the common per-record guard: "if this viewer is office-scoped
// and the record's location doesn't match their office, treat it as not found."
// Works for both a scoped superadmin (managedLocation) and a plain employee
// (their own Employee.location) uniformly.
async function isOutsideScope(user, location) {
  const loc = await resolveScopeLocation(user);
  return !!loc && location !== loc;
}

// Resolves the employee _ids visible to this viewer: null means "no
// restriction", an array means "only these employees" (the viewer's office).
async function scopedEmployeeIds(user) {
  const loc = await resolveScopeLocation(user);
  if (!loc) return null;
  const emps = await Employee.find({ location: loc }, '_id');
  return emps.map((e) => e._id);
}

// Resolves the User _ids linked to employees in the viewer's office — for
// content authored directly by a User (wall posts, chat, time logs) rather
// than through an employeeRef. null means "no restriction".
async function scopedUserIds(user) {
  const empIds = await scopedEmployeeIds(user);
  if (!empIds) return null;
  const users = await User.find({ employeeRef: { $in: empIds } }, '_id');
  return users.map((u) => u._id);
}

// Merges an employeeRef-based restriction into an existing Mongo filter,
// intersecting with any employeeRef condition already present (e.g. a caller
// filtering by a specific department or a text search).
function mergeEmployeeRefFilter(filter, field, ids) {
  const existing = filter[field];
  if (existing && typeof existing === 'object' && existing.$in) {
    filter[field] = { $in: existing.$in.filter((id) => ids.some((sid) => String(sid) === String(id))) };
  } else if (existing !== undefined) {
    filter[field] = { $in: ids.filter((id) => String(id) === String(existing)) };
  } else {
    filter[field] = { $in: ids };
  }
  return filter;
}

// Applies office scoping to a filter that targets Employee documents directly
// (matches on the `location` field itself, e.g. the Employees list).
async function scopeEmployeeLocationFilter(filter, user) {
  const loc = await resolveScopeLocation(user);
  if (loc) filter.location = loc;
  return filter;
}

// Applies office scoping to a filter on a model that references an employee via
// `field` (default 'employeeRef') — Attendance, LeaveRequest, Document, Asset,
// WallPost author lookups, etc. Awaits the employee id resolution itself.
async function scopeByEmployeeRef(filter, user, field = 'employeeRef') {
  const ids = await scopedEmployeeIds(user);
  if (ids) mergeEmployeeRefFilter(filter, field, ids);
  return filter;
}

module.exports = {
  resolveScopeLocation,
  isOfficeScoped,
  isOutsideScope,
  scopedEmployeeIds,
  scopedUserIds,
  scopeEmployeeLocationFilter,
  scopeByEmployeeRef,
};
