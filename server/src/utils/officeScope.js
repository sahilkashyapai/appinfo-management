const prisma = require('../db/prisma');
const { andWhere } = require('../db');

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
    const emp = await prisma.employee.findUnique({ where: { id: String(user.employeeRef) }, select: { location: true } });
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

// Resolves the employee ids visible to this viewer: null means "no
// restriction", an array means "only these employees" (the viewer's office).
async function scopedEmployeeIds(user) {
  const loc = await resolveScopeLocation(user);
  if (!loc) return null;
  const emps = await prisma.employee.findMany({ where: { location: loc }, select: { id: true } });
  return emps.map((e) => e.id);
}

// Resolves the User ids linked to employees in the viewer's office — for
// content authored directly by a User (wall posts, chat, time logs) rather
// than through an employee. null means "no restriction".
async function scopedUserIds(user) {
  const empIds = await scopedEmployeeIds(user);
  if (!empIds) return null;
  const users = await prisma.user.findMany({ where: { employeeId: { in: empIds } }, select: { id: true } });
  return users.map((u) => u.id);
}

// Applies office scoping to a Prisma `where` on Employee rows directly
// (matches on the `location` column itself, e.g. the Employees list).
async function scopeEmployeeLocationFilter(where, user) {
  const loc = await resolveScopeLocation(user);
  if (loc) andWhere(where, { location: loc });
  return where;
}

// Applies office scoping to a Prisma `where` on a model that references an
// employee via `field` (default 'employeeId') — Attendance, LeaveRequest,
// Document, Asset, etc. ANDed, so it intersects any existing condition on
// the same field.
async function scopeByEmployeeRef(where, user, field = 'employeeId') {
  const ids = await scopedEmployeeIds(user);
  if (ids) andWhere(where, { [field]: { in: ids } });
  return where;
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
