const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const WallPost = require('../models/WallPost');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const Asset = require('../models/Asset');
const { yearsSince } = require('./employeeController');
const { ADMIN_ROLES } = require('../utils/roles');
const { superadminEmployeeIds, excludeSuperadminEmployees } = require('../utils/hideSuperadmin');
const { startOfDayUTC } = require('../utils/attendanceDate');

function todayMD() {
  const now = new Date();
  return { month: now.getMonth(), date: now.getDate() };
}

async function summary(req, res) {
  const { month, date } = todayMD();
  const employeeFilter = { status: 'active' };
  await excludeSuperadminEmployees(employeeFilter, req.user.role, '_id');
  const employees = await Employee.find(employeeFilter);

  const totalEmployees = employees.length;
  const todaysBirthdays = employees.filter((e) => e.dob.getMonth() === month && e.dob.getDate() === date);
  const todaysAnniversaries = employees.filter((e) => e.joined.getMonth() === month && e.joined.getDate() === date && yearsSince(e.joined) >= 1);

  // Today's office/WFH/leave/absent split — shown on every user's dashboard,
  // not just admins'.
  const attendanceTodayFilter = { date: startOfDayUTC(new Date()) };
  await excludeSuperadminEmployees(attendanceTodayFilter, req.user.role);
  const todaysAttendance = await Attendance.find(attendanceTodayFilter, 'status');
  const attendanceCounts = { office: 0, wfh: 0, leave: 0, absent: 0 };
  todaysAttendance.forEach((a) => { attendanceCounts[a.status] += 1; });
  const attendanceToday = { ...attendanceCounts, notMarked: Math.max(totalEmployees - todaysAttendance.length, 0), totalEmployees };

  const newHiresFilter = { joined: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } };
  await excludeSuperadminEmployees(newHiresFilter, req.user.role, '_id');
  const [upcomingEventsCount, newHiresThisMonth] = await Promise.all([
    Event.countDocuments({ status: 'published', date: { $gte: new Date() } }),
    Employee.countDocuments(newHiresFilter),
  ]);

  const upcomingEvents = await Event.find({ status: 'published', date: { $gte: new Date() } }).sort({ date: 1 }).limit(3);

  const deptCountFilter = {};
  await excludeSuperadminEmployees(deptCountFilter, req.user.role, '_id');
  const deptCounts = await Employee.aggregate([{ $match: deptCountFilter }, { $group: { _id: '$dept', count: { $sum: 1 } } }]);
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
  const userFilter = { _id: { $in: topUserIds.map((t) => t.id) } };
  if (req.user.role !== 'superadmin') userFilter.role = { $ne: 'superadmin' };
  const users = await User.find(userFilter).select('name avatarIndex employeeRef');
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

  let ops = null;
  if (ADMIN_ROLES.includes(req.user.role)) {
    const [pendingLeaveApprovals, pendingRegistrations, assetCounts] = await Promise.all([
      LeaveRequest.countDocuments({ status: { $in: ['pending', 'on_hold'] } }),
      User.countDocuments({ approvalStatus: 'pending' }),
      Asset.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

    const assetsByStatus = Object.fromEntries(assetCounts.map((a) => [a._id, a.count]));
    const assetsTotal = assetCounts.reduce((sum, a) => sum + a.count, 0);

    ops = {
      pendingLeaveApprovals,
      pendingRegistrations,
      assets: {
        total: assetsTotal,
        assigned: assetsByStatus.assigned || 0,
        unassigned: assetsByStatus.unassigned || 0,
        needsAttention: (assetsByStatus.damaged || 0) + (assetsByStatus.lost || 0),
      },
    };
  }

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
    attendanceToday,
    ops,
  });
}

module.exports = { summary };
