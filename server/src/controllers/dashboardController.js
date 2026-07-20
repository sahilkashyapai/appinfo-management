const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const WallPost = require('../models/WallPost');
const User = require('../models/User');
const { yearsSince } = require('./employeeController');

function todayMD() {
  const now = new Date();
  return { month: now.getMonth(), date: now.getDate() };
}

async function summary(req, res) {
  const { month, date } = todayMD();
  const employees = await Employee.find({ status: 'active' });

  const totalEmployees = employees.length;
  const todaysBirthdays = employees.filter((e) => e.dob.getMonth() === month && e.dob.getDate() === date);
  const todaysAnniversaries = employees.filter((e) => e.joined.getMonth() === month && e.joined.getDate() === date && yearsSince(e.joined) >= 1);

  const [upcomingEventsCount, newHiresThisMonth] = await Promise.all([
    Event.countDocuments({ status: 'published', date: { $gte: new Date() } }),
    Employee.countDocuments({ joined: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } }),
  ]);

  const upcomingEvents = await Event.find({ status: 'published', date: { $gte: new Date() } }).sort({ date: 1 }).limit(3);

  const deptCounts = await Employee.aggregate([{ $group: { _id: '$dept', count: { $sum: 1 } } }]);
  const departments = await Department.find({}).select('name color');
  const colorByDept = Object.fromEntries(departments.map((d) => [d.name, d.color]));
  const deptHeadcount = deptCounts
    .map((d) => ({ dept: d._id, count: d.count, color: colorByDept[d._id] || '#2E86AB' }))
    .sort((a, b) => b.count - a.count);

  // Leaderboard: employees whose linked User account has posted/commented/reacted the most this month.
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const posts = await WallPost.find({ createdAt: { $gte: monthStart } });
  const scoreByUser = {};
  posts.forEach((p) => {
    scoreByUser[p.authorRef] = (scoreByUser[p.authorRef] || 0) + 3;
    ['like', 'love', 'celebrate'].forEach((t) => p.reactions[t].forEach((uid) => {
      scoreByUser[uid] = (scoreByUser[uid] || 0) + 1;
    }));
    p.comments.forEach((c) => {
      scoreByUser[c.authorRef] = (scoreByUser[c.authorRef] || 0) + 2;
    });
  });
  const topUserIds = Object.entries(scoreByUser)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, score]) => ({ id, score }));
  const users = await User.find({ _id: { $in: topUserIds.map((t) => t.id) } }).select('name avatarIndex employeeRef');
  const userMap = Object.fromEntries(users.map((u) => [String(u._id), u]));
  const leaderboard = topUserIds
    .map((t) => ({ user: userMap[t.id], score: t.score }))
    .filter((t) => t.user);

  // Engagement sparkline: notifications created per month, last 12 months.
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
  twelveMonthsAgo.setDate(1);
  const notifsByMonth = await Notification.aggregate([
    { $match: { createdAt: { $gte: twelveMonthsAgo } } },
    { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, count: { $sum: 1 } } },
  ]);
  const sparkline = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const bucket = notifsByMonth.find((n) => n._id.y === d.getFullYear() && n._id.m === d.getMonth() + 1);
    sparkline.push({ label: d.toLocaleString('en-US', { month: 'short', year: '2-digit' }), value: bucket ? bucket.count : 0 });
  }

  const [notificationsSentTotal, wallPostsTotal] = await Promise.all([Notification.countDocuments({}), WallPost.countDocuments({})]);

  res.json({
    kpis: {
      totalEmployees,
      newHiresThisMonth,
      todaysBirthdaysCount: todaysBirthdays.length,
      todaysAnniversariesCount: todaysAnniversaries.length,
      upcomingEventsCount,
    },
    todaysBirthdays,
    todaysAnniversaries: todaysAnniversaries.map((e) => ({ ...e.toObject(), years: yearsSince(e.joined) })),
    upcomingEvents,
    leaderboard,
    deptHeadcount,
    sparkline,
    stats: { notificationsSentTotal, wallPostsTotal },
  });
}

module.exports = { summary };
