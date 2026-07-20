const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const WallPost = require('../models/WallPost');
const { yearsSince } = require('./employeeController');

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

module.exports = { summary, birthdaysByDepartment, eventTypeDistribution, birthdayReport };
