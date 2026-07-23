// One-off script: additively seeds realistic-looking sample data across every
// widget on the Dashboard (birthdays, anniversaries, attendance, pending
// actions, leaderboard, engagement, headcount, hiring alerts) WITHOUT wiping
// anything that already exists. Every document is flagged isDemo: true so a
// superadmin can wipe it cleanly later from Settings > Danger Zone.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const Department = require('../models/Department');
const Employee = require('../models/Employee');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const Asset = require('../models/Asset');
const Event = require('../models/Event');
const Rsvp = require('../models/Rsvp');
const WallPost = require('../models/WallPost');
const Notification = require('../models/Notification');
const Announcement = require('../models/Announcement');
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

async function main() {
  await connectDB();
  const { y, m, day } = today();

  const superadmin = await User.findOne({ role: 'superadmin' });
  if (!superadmin) throw new Error('No superadmin user found — cannot attribute seeded actions.');

  const depts = await Department.find({ name: { $not: /Head of Company/i } });
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
      deptRef: dept._id,
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

  const employees = await Employee.insertMany(empDocs);
  console.log(`[seed] inserted ${employees.length} demo employees`);

  // --- Linked users (for leaderboard authorship + a couple of pending signups) ---
  const linkHash = await bcrypt.hash('DemoUser@123', 10);
  const linkedUsers = [];
  for (let i = 0; i < 3; i++) {
    const emp = employees[i];
    const u = await User.create({
      name: emp.name,
      email: emp.email,
      passwordHash: linkHash,
      role: 'employee',
      employeeRef: emp._id,
      department: emp.dept,
      location: emp.location,
      isDemo: true,
    });
    await Employee.updateOne({ _id: emp._id }, { userRef: u._id });
    linkedUsers.push(u);
  }

  const pendingHash = await bcrypt.hash('DemoPending@123', 10);
  await User.insertMany([
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
  ]);
  console.log('[seed] inserted 3 linked demo users + 2 pending registrations');

  // --- Attendance today -----------------------------------------------------
  const todayUTC = startOfDayUTC(new Date());
  const statuses = ['office', 'office', 'wfh', 'wfh', 'leave', 'absent', 'office'];
  const attendanceDocs = employees.slice(0, 7).map((emp, i) => ({
    employeeRef: emp._id,
    date: todayUTC,
    status: statuses[i],
    markedBy: superadmin._id,
    isDemo: true,
  }));
  await Attendance.insertMany(attendanceDocs);
  console.log(`[seed] marked attendance for ${attendanceDocs.length} demo employees today (1 left unmarked)`);

  // --- Leave requests (pending) ----------------------------------------------
  await LeaveRequest.insertMany([
    {
      employeeRef: employees[4]._id,
      type: 'casual',
      startDate: daysFromNow(5),
      endDate: daysFromNow(6),
      days: 2,
      reason: 'Family function out of town.',
      status: 'pending',
      isDemo: true,
    },
    {
      employeeRef: employees[5]._id,
      type: 'sick',
      startDate: daysFromNow(1),
      endDate: daysFromNow(1),
      days: 1,
      reason: 'Doctor appointment.',
      status: 'pending',
      isDemo: true,
    },
    {
      employeeRef: employees[6]._id,
      type: 'earned',
      startDate: daysFromNow(10),
      endDate: daysFromNow(14),
      days: 5,
      reason: 'Planned vacation.',
      status: 'on_hold',
      isDemo: true,
    },
  ]);
  console.log('[seed] inserted 3 pending/on-hold leave requests');

  // --- Assets ------------------------------------------------------------
  await Asset.insertMany([
    { name: 'Dell Latitude 5420', category: 'laptop', serialNumber: 'DEMO-LT-001', status: 'assigned', employeeRef: employees[0]._id, assignedAt: new Date(), isDemo: true },
    { name: 'iPhone 13', category: 'mobile', serialNumber: 'DEMO-MB-002', status: 'assigned', employeeRef: employees[1]._id, assignedAt: new Date(), isDemo: true },
    { name: 'MacBook Air M2', category: 'laptop', serialNumber: 'DEMO-LT-003', status: 'assigned', employeeRef: employees[2]._id, assignedAt: new Date(), isDemo: true },
    { name: 'HP LaserJet Access Card', category: 'access_card', serialNumber: 'DEMO-AC-004', status: 'unassigned', isDemo: true },
    { name: 'Lenovo ThinkPad E14', category: 'laptop', serialNumber: 'DEMO-LT-005', status: 'damaged', notes: 'Screen cracked in transit.', isDemo: true },
    { name: 'Samsung Galaxy Tab', category: 'mobile', serialNumber: 'DEMO-MB-006', status: 'lost', notes: 'Reported lost by previous holder.', isDemo: true },
  ]);
  console.log('[seed] inserted 6 demo assets (3 assigned, 1 unassigned, 1 damaged, 1 lost)');

  // --- Events + RSVPs -----------------------------------------------------
  const events = await Event.insertMany([
    { title: 'Quarterly Town Hall', type: 'town_hall', date: daysFromNow(6), venue: 'Main Auditorium, Mohali', status: 'published', emoji: '🏛️', color: '#8E44AD', capacity: 150, createdByRef: superadmin._id, isDemo: true },
    { title: 'Monsoon Team Outing', type: 'team_outing', date: daysFromNow(14), venue: 'Sukhna Lake, Chandigarh', status: 'published', emoji: '🌧️', color: '#2E86AB', capacity: 80, createdByRef: superadmin._id, isDemo: true },
    { title: 'Cricket Tournament', type: 'sports', date: daysFromNow(21), venue: 'AII Sports Ground', status: 'published', emoji: '🏏', color: '#27AE60', capacity: 60, createdByRef: superadmin._id, isDemo: true },
  ]);
  const rsvpDocs = [];
  events.forEach((ev) => {
    employees.forEach((emp, i) => {
      if (Math.random() < 0.6) {
        const roll = Math.random();
        rsvpDocs.push({ eventRef: ev._id, employeeRef: emp._id, status: roll < 0.7 ? 'yes' : roll < 0.9 ? 'maybe' : 'no', isDemo: true });
      }
    });
  });
  await Rsvp.insertMany(rsvpDocs, { ordered: false }).catch(() => {});
  console.log(`[seed] inserted ${events.length} demo events + ${rsvpDocs.length} RSVPs`);

  // --- Wall posts (drives the Celebration Leaderboard) -----------------------
  const [u1, u2, u3] = linkedUsers;
  await WallPost.insertMany([
    {
      authorRef: u1._id,
      tag: 'birthday',
      text: '🎂 Happy Birthday Meera! Wishing you a fantastic year ahead full of great designs and good vibes! 🎉',
      reactions: { like: [u2._id, u3._id], love: [superadmin._id], celebrate: [] },
      comments: [{ authorRef: u2._id, text: 'Happy birthday! 🥳' }],
      isDemo: true,
    },
    {
      authorRef: u2._id,
      tag: 'anniversary',
      text: '🏆 3 years at Applied Information India today — grateful for this journey and this team! 💪',
      reactions: { like: [u1._id], love: [u3._id, superadmin._id], celebrate: [] },
      comments: [],
      isDemo: true,
    },
    {
      authorRef: u3._id,
      tag: 'general',
      text: 'Excited for the upcoming Monsoon Team Outing! Who else is going? 🌧️🚌',
      reactions: { like: [u1._id, u2._id], love: [], celebrate: [superadmin._id] },
      comments: [{ authorRef: u1._id, text: "Count me in! Can't wait 🙌" }],
      isDemo: true,
    },
  ]);
  console.log('[seed] inserted 3 demo wall posts with reactions/comments');

  // --- Notifications (drives the Monthly Engagement sparkline) ---------------
  const notifDocs = [];
  for (let i = 11; i >= 0; i--) {
    const count = i === 0 ? 4 : 1 + Math.floor(Math.random() * 4);
    for (let j = 0; j < count; j++) {
      notifDocs.push({
        icon: '🔔',
        bg: '#EBF5FB',
        type: ['info', 'event', 'birthday', 'anniversary'][j % 4],
        title: 'Demo activity notification',
        body: 'Sample engagement data seeded for the Monthly Engagement chart.',
        createdAt: i === 0 ? new Date() : monthsAgo(i, 5 + j),
        isDemo: true,
      });
    }
  }
  await Notification.insertMany(notifDocs);
  console.log(`[seed] inserted ${notifDocs.length} demo notifications across the last 12 months`);

  // --- Announcements (Hiring Alerts card + general announcements) -----------
  await Announcement.insertMany([
    {
      title: "We're Hiring: Senior React Developer",
      body: 'Join our Engineering team! Looking for 3+ years of React experience. Apply via the careers form.',
      type: 'hiring',
      priority: 'high',
      icon: '💼',
      pinned: true,
      postedByRef: superadmin._id,
      isDemo: true,
    },
    {
      title: 'Office WiFi Maintenance This Weekend',
      body: 'IT will be upgrading office WiFi infrastructure this Saturday 10 PM–2 AM. Expect brief connectivity drops if working remotely during this window.',
      type: 'general',
      priority: 'medium',
      icon: '📢',
      postedByRef: superadmin._id,
      isDemo: true,
    },
  ]);
  console.log('[seed] inserted 2 demo announcements (1 hiring alert, 1 general)');

  console.log('\n[seed] done — all demo records flagged isDemo: true, safe to clear from Settings > Danger Zone.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
