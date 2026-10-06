// One-off script: additively seeds realistic-looking sample data across every
// widget on the Dashboard (birthdays, anniversaries, attendance, pending
// actions, leaderboard, engagement, headcount, hiring alerts) WITHOUT wiping
// anything that already exists. Every document is flagged isDemo: true so a
// superadmin can wipe it cleanly later from Settings > Danger Zone.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const { disconnectDB } = require('../config/db');
const { prisma } = require('../db');
const { startOfDayUTC } = require('../utils/attendanceDate');

function today() {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth(), day: d.getDate() };
}
function dateYMD(y, m, day) {
  return new Date(y, m, day);
}
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}
function monthsAgo(n, dayOfMonth = 10) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(dayOfMonth);
  return d;
}

const EMPLOYEE_SEEDS = [
  { name: 'Meera Kapoor', gender: 'birthday', desig: 'UI/UX Designer' },
  { name: 'Aman Chopra', gender: 'birthday', desig: 'Software Engineer' },
  { name: 'Lakshmi Pillai', gender: 'anniversary', desig: 'QA Engineer', years: 3 },
  { name: 'Yash Malhotra', gender: 'anniversary', desig: '.NET Developer', years: 5 },
  { name: 'Ishaan Kulkarni', gender: 'regular', desig: 'Android Developer' },
  { name: 'Divya Menon', gender: 'regular', desig: 'HR Executive' },
  { name: 'Rajesh Pillai', gender: 'regular', desig: 'GIS Analyst' },
  { name: 'Tanvi Deshpande', gender: 'regular', desig: 'Database Administrator' },
];

// `db` is the PrismaClient by default; pass an interactive-transaction client
// to run the whole seed atomically.
async function seedDashboardData(db = prisma) {
  const { y, m, day } = today();

  const superadmin = await db.user.findFirst({ where: { role: 'superadmin' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  if (!superadmin) throw new Error('No superadmin user found — cannot attribute seeded actions.');

  const depts = await db.department.findMany({
    where: { NOT: { name: { contains: 'Leadership' } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  if (!depts.length) throw new Error('No departments found — seed departments first.');
  const deptNames = depts.map((d) => d.name);
  function deptFor(i) {
    return depts[i % depts.length];
  }

  // --- Employees -----------------------------------------------------------
  const empDocs = EMPLOYEE_SEEDS.map((e, i) => {
    const dept = deptFor(i);
    let dob;
    let joined;
    if (e.gender === 'birthday') {
      dob = dateYMD(y - (28 + i), m, day);
      joined = dateYMD(y - 2, randMonth(), randDay());
    } else if (e.gender === 'anniversary') {
      dob = dateYMD(y - (30 + i), randMonth(), randDay());
      joined = dateYMD(y - e.years, m, day);
    } else {
      dob = dateYMD(y - (25 + i * 2), randMonth(), randDay());
      joined = i % 2 === 0 ? daysFromNow(-randInt(1, 20)) : dateYMD(y - randInt(1, 4), randMonth(), randDay());
    }
    return {
      empId: `DEMO${String(i + 1).padStart(4, '0')}`,
      name: e.name,
      dept: dept.name,
      deptId: dept.id,
      desig: e.desig,
      roleLabel: 'Employee',
      joined,
      dob,
      email: `${e.name.toLowerCase().replace(/\s+/g, '.')}@demo.aii.in`,
      phone: `+91 9${(700000000 + i * 111111).toString().slice(0, 9)}`,
      location: 'Mohali, India',
      status: 'active',
      avatarIndex: i % 10,
      isDemo: true,
    };
  });

  function randMonth() {
    return Math.floor(Math.random() * 12);
  }
  function randDay() {
    return 1 + Math.floor(Math.random() * 27);
  }
  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  // One create per row (createMany doesn't return the new ids on MySQL).
  const employees = [];
  for (const doc of empDocs) employees.push(await db.employee.create({ data: doc }));
  console.log(`[seed] inserted ${employees.length} demo employees`);

  // --- Linked users (for leaderboard authorship + a couple of pending signups) ---
  const linkHash = await bcrypt.hash('DemoUser@123', 10);
  const linkedUsers = [];
  for (let i = 0; i < 3; i++) {
    const emp = employees[i];
    const u = await db.user.create({
      data: {
        name: emp.name,
        email: emp.email,
        passwordHash: linkHash,
        role: 'employee',
        employeeId: emp.id,
        department: emp.dept,
        location: emp.location,
        isDemo: true,
      },
    });
    await db.employee.update({ where: { id: emp.id }, data: { userId: u.id } });
    linkedUsers.push(u);
  }

  const pendingHash = await bcrypt.hash('DemoPending@123', 10);
  await db.user.createMany({
    data: [
      {
        name: 'Nikhil Bhatt',
        email: 'nikhil.bhatt@demo.aii.in',
        passwordHash: pendingHash,
        role: 'employee',
        empId: 'DEMO9001',
        dob: dateYMD(y - 27, 4, 12),
        joined: new Date(),
        department: deptNames[0],
        phone: '+91 9811100011',
        approvalStatus: 'pending',
        isDemo: true,
      },
      {
        name: 'Sara Fernandes',
        email: 'sara.fernandes@demo.aii.in',
        passwordHash: pendingHash,
        role: 'employee',
        empId: 'DEMO9002',
        dob: dateYMD(y - 24, 8, 3),
        joined: new Date(),
        department: deptNames[1 % deptNames.length],
        phone: '+91 9811100022',
        approvalStatus: 'pending',
        isDemo: true,
      },
    ],
  });
  console.log('[seed] inserted 3 linked demo users + 2 pending registrations');

  // --- Attendance today -----------------------------------------------------
  const todayUTC = startOfDayUTC(new Date());
  const statuses = ['office', 'office', 'wfh', 'wfh', 'leave', 'absent', 'office'];
  const attendanceDocs = employees.slice(0, 7).map((emp, i) => ({
    employeeId: emp.id,
    date: todayUTC,
    status: statuses[i],
    markedById: superadmin.id,
    isDemo: true,
  }));
  await db.attendance.createMany({ data: attendanceDocs });
  console.log(`[seed] marked attendance for ${attendanceDocs.length} demo employees today (1 left unmarked)`);

  // --- Leave requests (pending) ----------------------------------------------
  await db.leaveRequest.createMany({
    data: [
      {
        employeeId: employees[4].id,
        type: 'casual',
        startDate: daysFromNow(5),
        endDate: daysFromNow(6),
        days: 2,
        reason: 'Family function out of town.',
        status: 'pending',
        isDemo: true,
      },
      {
        employeeId: employees[5].id,
        type: 'sick',
        startDate: daysFromNow(1),
        endDate: daysFromNow(1),
        days: 1,
        reason: 'Doctor appointment.',
        status: 'pending',
        isDemo: true,
      },
      {
        employeeId: employees[6].id,
        type: 'earned',
        startDate: daysFromNow(10),
        endDate: daysFromNow(14),
        days: 5,
        reason: 'Planned vacation.',
        status: 'on_hold',
        isDemo: true,
      },
    ],
  });
  console.log('[seed] inserted 3 pending/on-hold leave requests');

  // --- Assets ------------------------------------------------------------
  await db.asset.createMany({
    data: [
      { name: 'Dell Latitude 5420', category: 'laptop', serialNumber: 'DEMO-LT-001', status: 'assigned', employeeId: employees[0].id, assignedAt: new Date(), isDemo: true },
      { name: 'iPhone 13', category: 'mobile', serialNumber: 'DEMO-MB-002', status: 'assigned', employeeId: employees[1].id, assignedAt: new Date(), isDemo: true },
      { name: 'MacBook Air M2', category: 'laptop', serialNumber: 'DEMO-LT-003', status: 'assigned', employeeId: employees[2].id, assignedAt: new Date(), isDemo: true },
      { name: 'HP LaserJet Access Card', category: 'access_card', serialNumber: 'DEMO-AC-004', status: 'unassigned', isDemo: true },
      { name: 'Lenovo ThinkPad E14', category: 'laptop', serialNumber: 'DEMO-LT-005', status: 'damaged', notes: 'Screen cracked in transit.', isDemo: true },
      { name: 'Samsung Galaxy Tab', category: 'mobile', serialNumber: 'DEMO-MB-006', status: 'lost', notes: 'Reported lost by previous holder.', isDemo: true },
    ],
  });
  console.log('[seed] inserted 6 demo assets (3 assigned, 1 unassigned, 1 damaged, 1 lost)');

  // --- Events + RSVPs -----------------------------------------------------
  const events = [];
  for (const data of [
    { title: 'Quarterly Town Hall', type: 'town_hall', date: daysFromNow(6), venue: 'Main Auditorium, Mohali', status: 'published', emoji: 'fa-solid fa-building-columns', color: '#8E44AD', capacity: 150, createdById: superadmin.id, isDemo: true },
    { title: 'Monsoon Team Outing', type: 'team_outing', date: daysFromNow(14), venue: 'Sukhna Lake, Chandigarh', status: 'published', emoji: 'fa-solid fa-cloud-rain', color: '#2E86AB', capacity: 80, createdById: superadmin.id, isDemo: true },
    { title: 'Cricket Tournament', type: 'sports', date: daysFromNow(21), venue: 'AII Sports Ground', status: 'published', emoji: 'fa-solid fa-trophy', color: '#27AE60', capacity: 60, createdById: superadmin.id, isDemo: true },
  ]) {
    events.push(await db.event.create({ data }));
  }
  const rsvpDocs = [];
  events.forEach((ev) => {
    employees.forEach((emp, i) => {
      if (Math.random() < 0.6) {
        const roll = Math.random();
        rsvpDocs.push({ eventId: ev.id, employeeId: emp.id, status: roll < 0.7 ? 'yes' : roll < 0.9 ? 'maybe' : 'no', isDemo: true });
      }
    });
  });
  await db.rsvp.createMany({ data: rsvpDocs, skipDuplicates: true }).catch(() => {});
  console.log(`[seed] inserted ${events.length} demo events + ${rsvpDocs.length} RSVPs`);

  // --- Wall posts (drives the Celebration Leaderboard) -----------------------
  const [u1, u2, u3] = linkedUsers;
  const wallPosts = [
    {
      authorId: u1.id,
      tag: 'birthday',
      text: 'Happy Birthday Meera! Wishing you a fantastic year ahead full of great designs and good vibes!',
      reactions: { like: [u2.id, u3.id], love: [superadmin.id], celebrate: [] },
      comments: [{ authorId: u2.id, text: 'Happy birthday!' }],
      isDemo: true,
    },
    {
      authorId: u2.id,
      tag: 'anniversary',
      text: '3 years at Applied Information India today — grateful for this journey and this team!',
      reactions: { like: [u1.id], love: [u3.id, superadmin.id], celebrate: [] },
      comments: [],
      isDemo: true,
    },
    {
      authorId: u3.id,
      tag: 'general',
      text: 'Excited for the upcoming Monsoon Team Outing! Who else is going?',
      reactions: { like: [u1.id, u2.id], love: [], celebrate: [superadmin.id] },
      comments: [{ authorId: u1.id, text: "Count me in! Can't wait" }],
      isDemo: true,
    },
  ];
  // reactions/comments were embedded arrays in Mongo; they're child rows now.
  for (const { reactions, comments, ...post } of wallPosts) {
    await db.wallPost.create({
      data: {
        ...post,
        reactions: { create: Object.entries(reactions).flatMap(([type, ids]) => ids.map((userId) => ({ userId, type }))) },
        comments: { create: comments },
      },
    });
  }
  console.log('[seed] inserted 3 demo wall posts with reactions/comments');

  // --- Notifications (drives the Monthly Engagement sparkline) ---------------
  const notifDocs = [];
  for (let i = 11; i >= 0; i--) {
    const count = i === 0 ? 4 : 1 + Math.floor(Math.random() * 4);
    for (let j = 0; j < count; j++) {
      notifDocs.push({
        icon: 'fa-solid fa-bell',
        bg: '#EBF5FB',
        type: ['info', 'event', 'birthday', 'anniversary'][j % 4],
        title: 'Demo activity notification',
        body: 'Sample engagement data seeded for the Monthly Engagement chart.',
        createdAt: i === 0 ? new Date() : monthsAgo(i, 5 + j),
        isDemo: true,
      });
    }
  }
  await db.notification.createMany({ data: notifDocs });
  console.log(`[seed] inserted ${notifDocs.length} demo notifications across the last 12 months`);

  // --- Announcements (Hiring Alerts card + general announcements) -----------
  await db.announcement.createMany({
    data: [
      {
        title: "We're Hiring: Senior React Developer",
        body: 'Join our Engineering team! Looking for 3+ years of React experience. Apply via the careers form.',
        type: 'hiring',
        priority: 'high',
        icon: 'fa-solid fa-briefcase',
        pinned: true,
        postedById: superadmin.id,
        isDemo: true,
      },
      {
        title: 'Office WiFi Maintenance This Weekend',
        body: 'IT will be upgrading office WiFi infrastructure this Saturday 10 PM–2 AM. Expect brief connectivity drops if working remotely during this window.',
        type: 'general',
        priority: 'medium',
        icon: 'fa-solid fa-bullhorn',
        postedById: superadmin.id,
        isDemo: true,
      },
    ],
  });
  console.log('[seed] inserted 2 demo announcements (1 hiring alert, 1 general)');

  console.log('\n[seed] done — all demo records flagged isDemo: true, safe to clear from Settings > Danger Zone.');
}

async function main() {
  await connectDB();
  await seedDashboardData();
  await disconnectDB();
}

// Only when run directly (`node src/seed/seedDummyDashboardData.js`), never as a side effect of require().
if (require.main === module) {
  main().catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  });
}

module.exports = { seedDashboardData };
