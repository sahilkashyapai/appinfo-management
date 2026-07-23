const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const WallPost = require('../models/WallPost');
const Attendance = require('../models/Attendance');
const { excludeSuperadminEmployees } = require('../utils/hideSuperadmin');
const { ADMIN_ROLES } = require('../utils/roles');
const { countWorkingDays } = require('../utils/workingDays');

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
// Anyone else is always scoped to their own linked employee record — the
// requested employeeId (if any) is ignored so an employee report can never be
// used to look at a coworker's attendance/leave/WFH data.
async function resolveEmployeeScope(req) {
  if (ADMIN_ROLES.includes(req.user.role)) {
    return { employeeId: req.query.employeeId || null, noAccess: false };
  }
  const emp = await Employee.findOne({ userRef: req.user._id }, '_id');
  return { employeeId: emp ? String(emp._id) : null, noAccess: !emp };
}

async function summary(req, res) {
  const { start, end } = monthRange(req.query.month);
  const targetMonth = start.getMonth();

  const employeeFilter = {};
  await excludeSuperadminEmployees(employeeFilter, req.user.role, '_id');
  const [employees, notifsSent, wallPostsCount] = await Promise.all([
    Employee.find(employeeFilter, 'dob joined'),
    Notification.countDocuments({ createdAt: { $gte: start, $lt: end } }),
    WallPost.countDocuments({ createdAt: { $gte: start, $lt: end } }),
  ]);

  const birthdaysThisMonth = employees.filter((e) => e.dob.getMonth() === targetMonth).length;
  const anniversariesThisMonth = employees.filter((e) => e.joined.getMonth() === targetMonth).length;

  res.json({ birthdaysThisMonth, anniversariesThisMonth, notificationsSent: notifsSent, wallPostsCount });
}

async function birthdaysByDepartment(req, res) {
  const { start, end } = monthRange(req.query.month);
  const targetMonth = start.getMonth();
  const employeeFilter = {};
  await excludeSuperadminEmployees(employeeFilter, req.user.role, '_id');
  const employees = await Employee.find(employeeFilter, 'dob dept');
  const counts = {};
  employees.forEach((e) => {
    if (e.dob.getMonth() === targetMonth) counts[e.dept] = (counts[e.dept] || 0) + 1;
  });
  res.json({ items: Object.entries(counts).map(([dept, count]) => ({ dept, count })) });
}

async function eventTypeDistribution(req, res) {
  const agg = await Event.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]);
  const total = agg.reduce((s, a) => s + a.count, 0) || 1;
  res.json({ items: agg.map((a) => ({ type: a._id, count: a.count, pct: Math.round((a.count / total) * 100) })) });
}

async function attendanceRecordsByStatus(month, statuses, viewerRole, employeeId) {
  const { start, end } = monthRange(month);
  const filter = { date: { $gte: start, $lt: end }, status: { $in: statuses } };
  if (employeeId) filter.employeeRef = employeeId;
  await excludeSuperadminEmployees(filter, viewerRole);
  const records = await Attendance.find(filter)
    .populate('employeeRef', 'name dept')
    .sort({ date: -1 });
  return records
    .filter((r) => r.employeeRef)
    .map((r) => ({
      id: r._id,
      employeeId: r.employeeRef._id,
      name: r.employeeRef.name,
      dept: r.employeeRef.dept,
      date: r.date,
      status: r.status,
      note: r.note,
    }));
}

async function leaveReport(req, res) {
  const scope = await resolveEmployeeScope(req);
  if (scope.noAccess) return res.json({ items: [] });
  res.json({ items: await attendanceRecordsByStatus(req.query.month, ['leave'], req.user.role, scope.employeeId) });
}

async function absentReport(req, res) {
  const scope = await resolveEmployeeScope(req);
  if (scope.noAccess) return res.json({ items: [] });
  res.json({ items: await attendanceRecordsByStatus(req.query.month, ['absent'], req.user.role, scope.employeeId) });
}

async function workModeReport(req, res) {
  const scope = await resolveEmployeeScope(req);
  if (scope.noAccess) return res.json({ items: [] });
  res.json({ items: await attendanceRecordsByStatus(req.query.month, ['office', 'wfh'], req.user.role, scope.employeeId) });
}

async function attendanceReport(req, res) {
  const { start, end, y, m } = monthRange(req.query.month);
  const workingDays = await countWorkingDays(y, m);

  const scope = await resolveEmployeeScope(req);
  if (scope.noAccess) return res.json({ items: [] });

  const employeeFilter = {};
  if (scope.employeeId) employeeFilter._id = scope.employeeId;
  await excludeSuperadminEmployees(employeeFilter, req.user.role, '_id');
  const attendanceFilter = { date: { $gte: start, $lt: end } };
  if (scope.employeeId) attendanceFilter.employeeRef = scope.employeeId;
  await excludeSuperadminEmployees(attendanceFilter, req.user.role);
  const [employees, records] = await Promise.all([
    Employee.find(employeeFilter, 'name dept'),
    Attendance.find(attendanceFilter, 'employeeRef status'),
  ]);

  const byEmployee = {};
  records.forEach((r) => {
    const id = String(r.employeeRef);
    byEmployee[id] = byEmployee[id] || { office: 0, wfh: 0, leave: 0, absent: 0 };
    byEmployee[id][r.status] += 1;
  });

  const items = employees.map((e) => {
    const c = byEmployee[String(e._id)] || { office: 0, wfh: 0, leave: 0, absent: 0 };
    const marked = ATTENDANCE_STATUSES.reduce((sum, s) => sum + c[s], 0);
    return { id: e._id, name: e.name, dept: e.dept, ...c, notMarked: Math.max(workingDays - marked, 0) };
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
