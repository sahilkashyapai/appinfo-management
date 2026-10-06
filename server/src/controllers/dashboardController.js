const { prisma, shapeMany, sel, INCLUDE } = require('../db');
const { yearsSince } = require('./employeeController');
const { ADMIN_ROLES } = require('../utils/roles');
const { excludeSuperadminEmployees, excludeSuperadminAttendance, superadminEmployeeIds } = require('../utils/hideSuperadmin');
const { scopeEmployeeLocationFilter, scopeByEmployeeRef, scopedEmployeeIds, scopedUserIds } = require('../utils/officeScope');
const { startOfDayUTC } = require('../utils/attendanceDate');

function todayMD() {
  const now = new Date();
  return { month: now.getMonth(), date: now.getDate() };
}

async function summary(req, res) {
  const { month, date } = todayMD();
  const scopedIds = await scopedEmployeeIds(req.user);
  const employeeFilter = { status: 'active' };
  await excludeSuperadminEmployees(employeeFilter);
  await scopeEmployeeLocationFilter(employeeFilter, req.user);
  const employees = shapeMany('Employee', await prisma.employee.findMany({ where: employeeFilter }));

  const totalEmployees = employees.length;
  const todaysBirthdays = employees.filter((e) => e.dob.getMonth() === month && e.dob.getDate() === date);
  const todaysAnniversaries = employees.filter((e) => e.joined.getMonth() === month && e.joined.getDate() === date && yearsSince(e.joined) >= 1);

  // Today's office/WFH/leave/absent split — shown on every user's dashboard,
  // not just admins'. Superadmins never need attendance marked, so they're
  // excluded from both the attendance records and the eligible headcount
  // here (they still count toward the general totalEmployees stat below).
  const superIds = new Set((await superadminEmployeeIds()).map(String));
  const attendanceEligibleCount = employees.filter((e) => !superIds.has(String(e._id))).length;
  const attendanceTodayFilter = { date: startOfDayUTC(new Date()) };
  await excludeSuperadminAttendance(attendanceTodayFilter);
  await scopeByEmployeeRef(attendanceTodayFilter, req.user);
  const todaysAttendance = await prisma.attendance.findMany({ where: attendanceTodayFilter, select: { id: true, status: true } });
  const attendanceCounts = { office: 0, wfh: 0, leave: 0, absent: 0 };
  todaysAttendance.forEach((a) => { attendanceCounts[a.status] += 1; });
  const attendanceToday = { ...attendanceCounts, notMarked: Math.max(attendanceEligibleCount - todaysAttendance.length, 0), totalEmployees: attendanceEligibleCount };

  const newHiresFilter = { joined: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } };
  await excludeSuperadminEmployees(newHiresFilter);
  await scopeEmployeeLocationFilter(newHiresFilter, req.user);
  const [upcomingEventsCount, newHiresThisMonth] = await Promise.all([
    prisma.event.count({ where: { status: 'published', date: { gte: new Date() } } }),
    prisma.employee.count({ where: newHiresFilter }),
  ]);

  const upcomingEvents = await prisma.event.findMany({ where: { status: 'published', date: { gte: new Date() } }, orderBy: { date: 'asc' }, take: 3 });

  const hiringAlerts = await prisma.announcement.findMany({
    where: { type: 'hiring' },
    include: { postedByRef: { select: sel('User', 'name') } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const upcomingHolidays = await prisma.holiday.findMany({ where: { date: { gte: startOfDayUTC(new Date()) } }, orderBy: { date: 'asc' }, take: 3 });

  const deptCountFilter = {};
  await excludeSuperadminEmployees(deptCountFilter);
  await scopeEmployeeLocationFilter(deptCountFilter, req.user);
  const deptCounts = await prisma.employee.groupBy({ by: ['dept'], where: deptCountFilter, _count: { _all: true } });
  const departments = await prisma.department.findMany({ select: sel('Department', 'name color') });
  const colorByDept = Object.fromEntries(departments.map((d) => [d.name, d.color]));
  const deptHeadcount = deptCounts
    .map((d) => ({ dept: d.dept, count: d._count._all, color: colorByDept[d.dept] || '#2E86AB' }))
    .sort((a, b) => b.count - a.count);

  // Leaderboard: employees whose linked User account has posted/commented/reacted the most this month.
  // A scoped superadmin only sees engagement from their own office's employees.
  const scopedUsers = await scopedUserIds(req.user);
  const scopedUserSet = scopedUsers ? new Set(scopedUsers.map(String)) : null;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const postFilter = { createdAt: { gte: monthStart } };
  if (scopedUserSet) postFilter.authorId = { in: [...scopedUserSet] };
  // Oldest first, reactions in the order they were added — the order Mongo
  // returned them in, so leaderboard ties break the same way.
  const posts = shapeMany('WallPost', await prisma.wallPost.findMany({
    where: postFilter,
    orderBy: { createdAt: 'asc' },
    include: { ...INCLUDE.WallPost, reactions: { select: { type: true, userId: true }, orderBy: { createdAt: 'asc' } } },
  }));
  const scoreByUser = {};
  posts.forEach((p) => {
    scoreByUser[p.authorRef] = (scoreByUser[p.authorRef] || 0) + 3;
    ['like', 'love', 'celebrate'].forEach((t) => p.reactions[t].forEach((uid) => {
      if (scopedUserSet && !scopedUserSet.has(String(uid))) return;
      scoreByUser[uid] = (scoreByUser[uid] || 0) + 1;
    }));
    p.comments.forEach((c) => {
      if (scopedUserSet && !scopedUserSet.has(String(c.authorRef))) return;
      scoreByUser[c.authorRef] = (scoreByUser[c.authorRef] || 0) + 2;
    });
  });
  const topUserIds = Object.entries(scoreByUser)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, score]) => ({ id, score }));
  const users = shapeMany('User', await prisma.user.findMany({
    where: { id: { in: topUserIds.map((t) => t.id) } },
    select: sel('User', 'name avatarIndex employeeRef'),
  }));
  const userMap = Object.fromEntries(users.map((u) => [String(u._id), u]));
  const leaderboard = topUserIds
    .map((t) => ({ user: userMap[t.id], score: t.score }))
    .filter((t) => t.user);

  // Engagement sparkline: notifications created per month, last 12 months.
  // (YEAR()/MONTH() on the UTC-stored column, like Mongo's $year/$month.)
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
  twelveMonthsAgo.setDate(1);
  const notifsByMonth = (await prisma.$queryRaw`
    SELECT YEAR(createdAt) AS y, MONTH(createdAt) AS m, COUNT(*) AS count
    FROM notifications WHERE createdAt >= ${twelveMonthsAgo}
    GROUP BY YEAR(createdAt), MONTH(createdAt)`).map((r) => ({ y: Number(r.y), m: Number(r.m), count: Number(r.count) }));
  const sparkline = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const bucket = notifsByMonth.find((n) => n.y === d.getFullYear() && n.m === d.getMonth() + 1);
    sparkline.push({ label: d.toLocaleString('en-US', { month: 'short', year: '2-digit' }), value: bucket ? bucket.count : 0 });
  }

  const [notificationsSentTotal, wallPostsTotal] = await Promise.all([prisma.notification.count(), prisma.wallPost.count()]);

  let ops = null;
  if (ADMIN_ROLES.includes(req.user.role)) {
    const leaveFilter = { status: { in: ['pending', 'on_hold'] } };
    if (scopedIds) leaveFilter.employeeId = { in: scopedIds };
    // Self-registrations have no office yet at the pending stage (no Employee
    // record/location exists until approved) — pendingRegistrations is
    // intentionally left global, there's nothing to scope it by.
    const assetMatch = scopedIds ? { OR: [{ employeeId: null }, { employeeId: { in: scopedIds } }] } : {};
    const [pendingLeaveApprovals, pendingRegistrations, assetCounts] = await Promise.all([
      prisma.leaveRequest.count({ where: leaveFilter }),
      prisma.user.count({ where: { approvalStatus: 'pending' } }),
      prisma.asset.groupBy({ by: ['status'], where: assetMatch, _count: { _all: true } }),
    ]);

    const assetsByStatus = Object.fromEntries(assetCounts.map((a) => [a.status, a._count._all]));
    const assetsTotal = assetCounts.reduce((sum, a) => sum + a._count._all, 0);

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
    todaysAnniversaries: todaysAnniversaries.map((e) => ({ ...e, years: yearsSince(e.joined) })),
    upcomingEvents: shapeMany('Event', upcomingEvents),
    upcomingHolidays: shapeMany('Holiday', upcomingHolidays),
    hiringAlerts: shapeMany('Announcement', hiringAlerts),
    leaderboard,
    deptHeadcount,
    sparkline,
    stats: { notificationsSentTotal, wallPostsTotal },
    attendanceToday,
    ops,
  });
}

module.exports = { summary };
