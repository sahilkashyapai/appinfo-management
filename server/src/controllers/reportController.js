const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const WallPost = require('../models/WallPost');
const Attendance = require('../models/Attendance');
const { yearsSince } = require('./employeeController');

const ATTENDANCE_STATUSES = ['office', 'wfh', 'leave', 'absent'];

function monthRange(monthStr) {
  // monthStr: 'YYYY-MM'; defaults to current month.
  const now = new Date();
  const [y, m] = (monthStr || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`).split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return { start, end, y, m };
}

async function summary(req, res) {
  const { start, end } = monthRange(req.query.month);
  const targetMonth = start.getMonth();

  const [employees, notifsSent, wallPostsCount] = await Promise.all([
    Employee.find({}, 'dob joined'),
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
  const employees = await Employee.find({}, 'dob dept');
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

async function birthdayReport(req, res) {
  const { start } = monthRange(req.query.month);
  const targetMonth = start.getMonth();
  const employees = await Employee.find({ dept: { $exists: true } });
  const inMonth = employees.filter((e) => e.dob.getMonth() === targetMonth);

  const rows = await Promise.all(
    inMonth.map(async (e) => {
      const wishesReceived = await Notification.countDocuments({ title: new RegExp(e.name, 'i'), type: 'birthday' });
      return {
        id: e._id,
        name: e.name,
        dept: e.dept,
        dob: e.dob,
        years: yearsSince(e.joined),
        wishesReceived,
      };
    })
  );
  res.json({ items: rows });
}

async function anniversaryReport(req, res) {
  const { start } = monthRange(req.query.month);
  const targetMonth = start.getMonth();
  const employees = await Employee.find({ dept: { $exists: true } });
  const inMonth = employees.filter((e) => e.joined.getMonth() === targetMonth);

  const rows = await Promise.all(
    inMonth.map(async (e) => {
      const wishesReceived = await Notification.countDocuments({ title: new RegExp(e.name, 'i'), type: 'anniversary' });
      return {
        id: e._id,
        name: e.name,
        dept: e.dept,
        joined: e.joined,
        years: yearsSince(e.joined),
        wishesReceived,
      };
    })
  );
  res.json({ items: rows });
}

async function wallPostsReport(req, res) {
  const { start, end } = monthRange(req.query.month);
  const posts = await WallPost.find({ createdAt: { $gte: start, $lt: end } })
    .populate('authorRef', 'name')
    .sort({ createdAt: -1 });
  res.json({
    items: posts.map((p) => ({
      id: p._id,
      author: p.authorRef?.name || 'Unknown',
      text: p.text,
      tag: p.tag,
      createdAt: p.createdAt,
    })),
  });
}

async function notificationsReport(req, res) {
  const { start, end } = monthRange(req.query.month);
  const notifs = await Notification.find({ createdAt: { $gte: start, $lt: end } })
    .populate('recipientRef', 'name')
    .sort({ createdAt: -1 });
  res.json({
    items: notifs.map((n) => ({
      id: n._id,
      title: n.title,
      type: n.type,
      recipient: n.recipientRef?.name || 'Broadcast',
      createdAt: n.createdAt,
    })),
  });
}

async function attendanceReport(req, res) {
  const { start, end, y, m } = monthRange(req.query.month);
  const daysInMonth = new Date(y, m, 0).getDate();

  const [employees, records] = await Promise.all([
    Employee.find({}, 'name dept'),
    Attendance.find({ date: { $gte: start, $lt: end } }, 'employeeRef status'),
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
    return { id: e._id, name: e.name, dept: e.dept, ...c, notMarked: Math.max(daysInMonth - marked, 0) };
  });
  res.json({ items });
}

module.exports = {
  summary,
  birthdaysByDepartment,
  eventTypeDistribution,
  birthdayReport,
  anniversaryReport,
  wallPostsReport,
  notificationsReport,
  attendanceReport,
};
