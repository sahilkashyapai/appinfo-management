const { prisma, sel } = require('../db');
const { excludeSuperadminEmployees, excludeSuperadminAttendance } = require('../utils/hideSuperadmin');
const { ADMIN_ROLES } = require('../utils/roles');
const { countWorkingDays } = require('../utils/workingDays');
const { resolveScopeLocation, scopeEmployeeLocationFilter, scopeByEmployeeRef } = require('../utils/officeScope');

const ATTENDANCE_STATUSES = ['office', 'wfh', 'leave', 'absent'];

function monthRange(monthStr) {
  // monthStr: 'YYYY-MM'; defaults to current month.
  const now = new Date();
  const [y, m] = (monthStr || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return { start, end, y, m };
}

// Admins may request any employee's report (or all, via employeeId omitted).
// Anyone else is always scoped to their own linked employee record - the
// requested employeeId (if any) is ignored so an employee report can never be
// used to look at a coworker's attendance/leave/WFH data.
async function resolveEmployeeScope(req) {
  if (ADMIN_ROLES.includes(req.user.role)) {
    if (req.query.employeeId) {
      const scopeLoc = await resolveScopeLocation(req.user);
      if (scopeLoc) {
        const target = await prisma.employee.findUnique({ where: { id: String(req.query.employeeId) }, select: { location: true } });
        if (!target || target.location !== scopeLoc) return { employeeId: null, noAccess: true };
      }
    }
    return { employeeId: req.query.employeeId ? String(req.query.employeeId) : null, noAccess: false };
  }
  const emp = await prisma.employee.findFirst({ where: { userId: String(req.user._id) }, select: { id: true } });
  return { employeeId: emp ? String(emp.id) : null, noAccess: !emp };
}

async function summary(req, res) {
  const { start, end } = monthRange(req.query.month);
  const targetMonth = start.getMonth();

  const employeeFilter = {};
  await excludeSuperadminEmployees(employeeFilter);
  await scopeEmployeeLocationFilter(employeeFilter, req.user);
  const [employees, notifsSent, wallPostsCount] = await Promise.all([
    prisma.employee.findMany({ where: employeeFilter, select: sel('Employee', 'dob joined') }),
    prisma.notification.count({ where: { createdAt: { gte: start, lt: end } } }),
    prisma.wallPost.count({ where: { createdAt: { gte: start, lt: end } } }),
  ]);

  const birthdaysThisMonth = employees.filter((e) => e.dob.getMonth() === targetMonth).length;
  const anniversariesThisMonth = employees.filter((e) => e.joined.getMonth() === targetMonth).length;

  res.json({ birthdaysThisMonth, anniversariesThisMonth, notificationsSent: notifsSent, wallPostsCount });
}

async function birthdaysByDepartment(req, res) {
  const { start } = monthRange(req.query.month);
  const targetMonth = start.getMonth();
  const employeeFilter = {};
  await excludeSuperadminEmployees(employeeFilter);
  await scopeEmployeeLocationFilter(employeeFilter, req.user);
  const employees = await prisma.employee.findMany({ where: employeeFilter, select: sel('Employee', 'dob dept') });
  const counts = {};
  employees.forEach((e) => {
    if (e.dob.getMonth() === targetMonth) counts[e.dept] = (counts[e.dept] || 0) + 1;
  });
  res.json({ items: Object.entries(counts).map(([dept, count]) => ({ dept, count })) });
}

async function eventTypeDistribution(req, res) {
  const agg = (await prisma.event.groupBy({ by: ['type'], _count: { _all: true } })).map((a) => ({ type: a.type, count: a._count._all }));
  const total = agg.reduce((s, a) => s + a.count, 0) || 1;
  res.json({ items: agg.map((a) => ({ type: a.type, count: a.count, pct: Math.round((a.count / total) * 100) })) });
}

async function attendanceRecordsByStatus(month, statuses, user, employeeId) {
  const { start, end } = monthRange(month);
  const where = { date: { gte: start, lt: end }, status: { in: statuses } };
  if (employeeId) where.employeeId = employeeId;
  await excludeSuperadminAttendance(where);
  await scopeByEmployeeRef(where, user);
  const records = await prisma.attendance.findMany({
    where,
    include: { employeeRef: { select: sel('Employee', 'name dept') } },
    orderBy: { date: 'desc' },
  });
  return records
    .filter((r) => r.employeeRef)
    .map((r) => ({
      id: r.id,
      employeeId: r.employeeRef.id,
      name: r.employeeRef.name,
      dept: r.employeeRef.dept,
      date: r.date,
      status: r.status,
      note: r.note ?? '',
    }));
}

async function leaveReport(req, res) {
  const scope = await resolveEmployeeScope(req);
  if (scope.noAccess) return res.json({ items: [] });
  res.json({ items: await attendanceRecordsByStatus(req.query.month, ['leave'], req.user, scope.employeeId) });
}

async function absentReport(req, res) {
  const scope = await resolveEmployeeScope(req);
  if (scope.noAccess) return res.json({ items: [] });
  res.json({ items: await attendanceRecordsByStatus(req.query.month, ['absent'], req.user, scope.employeeId) });
}

async function workModeReport(req, res) {
  const scope = await resolveEmployeeScope(req);
  if (scope.noAccess) return res.json({ items: [] });
  res.json({ items: await attendanceRecordsByStatus(req.query.month, ['office', 'wfh'], req.user, scope.employeeId) });
}

async function attendanceReport(req, res) {
  const { start, end, y, m } = monthRange(req.query.month);
  const workingDays = await countWorkingDays(y, m);

  const scope = await resolveEmployeeScope(req);
  if (scope.noAccess) return res.json({ items: [] });

  const employeeFilter = {};
  if (scope.employeeId) employeeFilter.id = scope.employeeId;
  await excludeSuperadminAttendance(employeeFilter, 'id');
  await scopeEmployeeLocationFilter(employeeFilter, req.user);
  const attendanceFilter = { date: { gte: start, lt: end } };
  if (scope.employeeId) attendanceFilter.employeeId = scope.employeeId;
  await excludeSuperadminAttendance(attendanceFilter);
  await scopeByEmployeeRef(attendanceFilter, req.user);
  const [employees, records] = await Promise.all([
    prisma.employee.findMany({ where: employeeFilter, select: sel('Employee', 'name dept') }),
    prisma.attendance.findMany({ where: attendanceFilter, select: { employeeId: true, status: true } }),
  ]);

  const byEmployee = {};
  records.forEach((r) => {
    const id = String(r.employeeId);
    byEmployee[id] = byEmployee[id] || { office: 0, wfh: 0, leave: 0, absent: 0 };
    byEmployee[id][r.status] += 1;
  });

  const items = employees.map((e) => {
    const c = byEmployee[String(e.id)] || { office: 0, wfh: 0, leave: 0, absent: 0 };
    const marked = ATTENDANCE_STATUSES.reduce((sum, s) => sum + c[s], 0);
    return { id: e.id, name: e.name, dept: e.dept, ...c, notMarked: Math.max(workingDays - marked, 0) };
  });
  res.json({ items });
}

module.exports = {
  summary,
  birthdaysByDepartment,
  eventTypeDistribution,
  leaveReport,
  absentReport,
  workModeReport,
  attendanceReport,
};
