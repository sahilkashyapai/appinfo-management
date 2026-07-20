const bcrypt = require('bcryptjs');

const Department = require('../models/Department');
const Employee = require('../models/Employee');
const User = require('../models/User');
const Event = require('../models/Event');
const Rsvp = require('../models/Rsvp');
const WallPost = require('../models/WallPost');
const Notification = require('../models/Notification');
const Announcement = require('../models/Announcement');
const Holiday = require('../models/Holiday');
const AuditLog = require('../models/AuditLog');
const Settings = require('../models/Settings');

const {
  DEPARTMENTS,
  NAMED_EMPLOYEES,
  FIRST_NAMES,
  LAST_NAMES,
  LOCATIONS,
  DESIGNATIONS_BY_DEPT,
  DEPT_WEIGHTS,
  EVENTS,
  ANNOUNCEMENTS,
  HOLIDAYS,
} = require('./data');

const GENERATED_EMPLOYEE_COUNT = 40;

function pad(n) {
  return String(n).padStart(2, '0');
}
function todayMD() {
  const d = new Date();
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dateFromYearAndMD(year, md) {
  const [m, d] = md.split('-').map(Number);
  return new Date(year, m - 1, d);
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}
function weightedDept() {
  const entries = Object.entries(DEPT_WEIGHTS);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = randInt(1, total);
  for (const [dept, w] of entries) {
    if (r <= w) return dept;
    r -= w;
  }
  return entries[0][0];
}

async function wipeCollections() {
  console.log('[seed] wiping existing collections...');
  await Promise.all([
    Department.deleteMany({}),
    Employee.deleteMany({}),
    User.deleteMany({}),
    Event.deleteMany({}),
    Rsvp.deleteMany({}),
    WallPost.deleteMany({}),
    Notification.deleteMany({}),
    Announcement.deleteMany({}),
    Holiday.deleteMany({}),
    AuditLog.deleteMany({}),
    Settings.deleteMany({}),
  ]);
}

async function seedDepartments() {
  const depts = await Department.insertMany(
    DEPARTMENTS.map((d) => ({ name: d.name, code: d.code, emoji: d.emoji, color: d.color, description: d.desc }))
  );
  return Object.fromEntries(depts.map((d) => [d.name, d]));
}

function buildNamedEmployeeDocs(deptMap) {
  const md = todayMD();
  return NAMED_EMPLOYEES.map((e) => {
    let dobMD = e.dobMD;
    let joinedMD = e.joinedMD;
    // Rewrite these two so "today's birthdays" / "today's anniversaries" are visible right after seeding.
    if (e.empId === 'EMP001') dobMD = md;
    if (e.empId === 'EMP009') joinedMD = md;

    return {
      empId: e.empId,
      name: e.name,
      dept: e.dept,
      deptRef: deptMap[e.dept]._id,
      desig: e.desig,
      joined: dateFromYearAndMD(e.joinedYear, joinedMD),
      dob: dateFromYearAndMD(e.dobYear, dobMD),
      email: e.email,
      phone: e.phone,
      location: e.location,
      status: e.status,
      avatarIndex: randInt(0, 9),
      _mgrName: e.mgr,
    };
  });
}

function buildGeneratedEmployeeDocs(deptMap, startIndex) {
  const usedEmails = new Set();
  const docs = [];
  for (let i = 0; i < GENERATED_EMPLOYEE_COUNT; i++) {
    const dept = weightedDept();
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    let email = `${first.toLowerCase()}.${last.toLowerCase()}@aii.in`;
    let n = 1;
    while (usedEmails.has(email)) {
      email = `${first.toLowerCase()}.${last.toLowerCase()}${n}@aii.in`;
      n += 1;
    }
    usedEmails.add(email);

    const joinYear = randInt(2015, 2024);
    const dobYear = randInt(1980, 2001);
    const statusRoll = Math.random();
    const status = statusRoll < 0.9 ? 'active' : statusRoll < 0.96 ? 'inactive' : 'leave';

    docs.push({
      empId: `EMP${String(startIndex + i).padStart(3, '0')}`,
      name: `${first} ${last}`,
      dept,
      deptRef: deptMap[dept]._id,
      desig: pick(DESIGNATIONS_BY_DEPT[dept]),
      joined: new Date(joinYear, randInt(0, 11), randInt(1, 28)),
      dob: new Date(dobYear, randInt(0, 11), randInt(1, 28)),
      email,
      phone: `+91 9${randInt(1000000000, 9999999999).toString().slice(0, 8)}`,
      location: pick(LOCATIONS),
      status,
      avatarIndex: randInt(0, 9),
      _mgrName: null,
    });
  }
  return docs;
}

async function seedEmployees(deptMap) {
  const namedDocs = buildNamedEmployeeDocs(deptMap);
  const generatedDocs = buildGeneratedEmployeeDocs(deptMap, NAMED_EMPLOYEES.length + 1);
  const allDocs = [...namedDocs, ...generatedDocs];

  const created = await Employee.insertMany(allDocs.map(({ _mgrName, ...doc }) => doc));
  const byName = new Map();
  created.forEach((e) => {
    if (!byName.has(e.name)) byName.set(e.name, e);
  });

  // Resolve manager references now that every employee has an _id.
  const mgrUpdates = [];
  allDocs.forEach((doc, idx) => {
    if (doc._mgrName && byName.has(doc._mgrName)) {
      mgrUpdates.push({ updateOne: { filter: { _id: created[idx]._id }, update: { managerRef: byName.get(doc._mgrName)._id } } });
    }
  });
  if (mgrUpdates.length) await Employee.bulkWrite(mgrUpdates);

  return { employees: created, byName };
}

async function attachDepartmentHeads(deptMap, byName) {
  const updates = DEPARTMENTS.filter((d) => byName.has(d.head)).map((d) => ({
    updateOne: { filter: { _id: deptMap[d.name]._id }, update: { headRef: byName.get(d.head)._id } },
  }));
  if (updates.length) await Department.bulkWrite(updates);
}

async function seedUsers(byName) {
  const superadminEmail = (process.env.SEED_SUPERADMIN_EMAIL || 'superadmin@aii.in').toLowerCase();
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD || 'Admin@123';

  const [superHash, hrHash, mgrHash, empHash] = await Promise.all(
    [superadminPassword, 'Welcome@123', 'Welcome@123', 'Welcome@123'].map((p) => bcrypt.hash(p, 10))
  );

  const superadmin = await User.create({
    name: 'Super Administrator',
    email: superadminEmail,
    passwordHash: superHash,
    role: 'superadmin',
    department: 'IT Administration',
    location: 'Bangalore, Karnataka',
    branch: 'Headquarters',
    phone: '+91 98765 43210',
  });

  const roleLinks = [
    { name: 'Priya Nair', role: 'hr', hash: hrHash },
    { name: 'Vijay Kumar', role: 'manager', hash: mgrHash },
    { name: 'Rahul Sharma', role: 'employee', hash: empHash },
  ];

  const linkedUsers = [superadmin];
  for (const link of roleLinks) {
    const emp = byName.get(link.name);
    if (!emp) continue;
    const user = await User.create({
      name: emp.name,
      email: emp.email,
      passwordHash: link.hash,
      role: link.role,
      employeeRef: emp._id,
      department: emp.dept,
      location: emp.location,
    });
    await Employee.updateOne({ _id: emp._id }, { userRef: user._id });
    linkedUsers.push(user);
  }

  console.log('[seed] seeded users (email / password):');
  console.log(`  superadmin: ${superadminEmail} / ${superadminPassword}`);
  roleLinks.forEach((l) => byName.has(l.name) && console.log(`  ${l.role}: ${byName.get(l.name).email} / Welcome@123`));

  return linkedUsers; // [superadmin, hr?, manager?, employee?]
}

async function seedEvents() {
  const now = Date.now();
  const created = await Event.insertMany(
    EVENTS.map((e) => ({
      title: e.title,
      type: e.type,
      date: new Date(now + e.dayOffset * 24 * 60 * 60 * 1000),
      venue: e.venue,
      status: e.status,
      emoji: e.emoji,
      color: e.color,
      capacity: e.capacity,
    }))
  );
  return created;
}

async function seedRsvps(events, employees) {
  const rsvpDocs = [];
  for (const event of events) {
    if (event.status !== 'published') continue;
    const attendeePool = employees.filter(() => Math.random() < 0.55);
    for (const emp of attendeePool) {
      const roll = Math.random();
      const status = roll < 0.75 ? 'yes' : roll < 0.9 ? 'maybe' : 'no';
      rsvpDocs.push({ eventRef: event._id, employeeRef: emp._id, status, respondedAt: new Date() });
    }
  }
  if (rsvpDocs.length) await Rsvp.insertMany(rsvpDocs, { ordered: false }).catch(() => {});
}

async function seedWall(users) {
  const [superadmin, hr, manager, employee] = users;
  const author = (u) => u || superadmin;

  const posts = [
    {
      authorRef: author(hr)._id,
      tag: 'birthday',
      text: "🎂 Happy Birthday! Wishing you a year full of amazing code, zero bugs, and lots of chai! You're a rockstar developer and an even better colleague. Have a blast! 🚀",
      reactions: { like: [author(manager)._id], love: [author(employee)._id], celebrate: [superadmin._id] },
      comments: [
        { authorRef: author(manager)._id, text: 'Happy birthday! 🎉' },
        { authorRef: superadmin._id, text: 'Many happy returns! 🥳' },
      ],
    },
    {
      authorRef: author(hr)._id,
      tag: 'anniversary',
      text: '🎉 Congratulations on completing another incredible year with Applied Information India! Your dedication has been truly outstanding. Thank you for being such a vital part of our journey! 🌟',
      reactions: { like: [superadmin._id, author(manager)._id], love: [author(employee)._id], celebrate: [] },
      comments: [{ authorRef: author(employee)._id, text: 'Absolutely legendary! 🏆' }],
    },
    {
      authorRef: author(manager)._id,
      tag: 'anniversary',
      text: '🏆 Proud to be part of this journey at Applied Information India! Grateful for every team member who made this possible. Here\'s to many more! 💪',
      reactions: { like: [superadmin._id], love: [author(hr)._id], celebrate: [author(employee)._id] },
      comments: [],
    },
    {
      authorRef: author(employee)._id,
      tag: 'event',
      text: 'What an amazing celebration! 🌙 A huge thank you to the HR team for organizing such a beautiful event. Looking forward to more celebrations together 🎊',
      reactions: { like: [author(hr)._id], love: [], celebrate: [superadmin._id] },
      comments: [],
    },
  ];

  await WallPost.insertMany(posts);
}

async function seedNotifications() {
  await Notification.insertMany([
    { icon: '🎂', bg: '#FDEBD0', type: 'birthday', title: 'Birthday reminders are live', body: 'Employees with a birthday today will surface here automatically every morning.' },
    { icon: '📅', bg: '#EBF5FB', type: 'event', title: 'Event reminders are live', body: 'Published events send D-7 and D-1 reminders automatically.' },
    { icon: '🛡️', bg: '#F0FDF4', type: 'info', title: 'Welcome to AII Celebrations', body: 'Your account was seeded successfully. Explore the sidebar to get started.' },
  ]);
}

async function seedAnnouncements(users) {
  const [superadmin, hr] = users;
  const now = Date.now();
  await Announcement.insertMany(
    ANNOUNCEMENTS.map((a, i) => ({
      title: a.title,
      body: a.body,
      priority: a.priority,
      icon: a.icon,
      pinned: a.pinned,
      postedByRef: (i % 2 === 0 ? hr : superadmin)?._id || superadmin._id,
      createdAt: new Date(now - (i + 1) * 24 * 60 * 60 * 1000),
    }))
  );
}

async function seedHolidays() {
  const year = new Date().getFullYear();
  await Holiday.insertMany(
    HOLIDAYS.map((h) => ({
      name: h.name,
      date: dateFromYearAndMD(year, h.monthDay),
      type: h.type,
      description: h.desc,
    }))
  );
}

async function seedAuditLog(users) {
  const [superadmin, hr] = users;
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  await AuditLog.insertMany([
    { actorRef: superadmin._id, actorName: superadmin.name, action: 'LOGIN', entity: 'users', recordId: String(superadmin._id), ip: '127.0.0.1', detail: 'Seed script initial login placeholder', createdAt: new Date(now - 5 * hour) },
    { actorRef: (hr || superadmin)._id, actorName: (hr || superadmin).name, action: 'CREATE', entity: 'employees', recordId: 'EMP001', ip: '127.0.0.1', detail: 'Seeded demo employee records', createdAt: new Date(now - 4 * hour) },
    { actorRef: superadmin._id, actorName: superadmin.name, action: 'UPDATE', entity: 'settings', recordId: '—', ip: '127.0.0.1', detail: 'Initialized default settings', createdAt: new Date(now - 3 * hour) },
  ]);
}

async function seedSettings() {
  await Settings.create({ singletonKey: 'global' });
}

async function seedAll() {
  await wipeCollections();

  const deptMap = await seedDepartments();
  const { employees, byName } = await seedEmployees(deptMap);
  await attachDepartmentHeads(deptMap, byName);
  const users = await seedUsers(byName);

  const events = await seedEvents();
  await seedRsvps(events, employees);

  await seedWall(users);
  await seedNotifications();
  await seedAnnouncements(users);
  await seedHolidays();
  await seedAuditLog(users);
  await seedSettings();

  console.log(`[seed] done — ${employees.length} employees, ${events.length} events, ${DEPARTMENTS.length} departments.`);
}

// Blank-slate seed: just the login account + default settings, no demo data.
// Used for the in-memory dev fallback so restarting the server doesn't keep
// repopulating demo records over whatever the user has added manually.
async function seedMinimal() {
  await wipeCollections();

  const superadminEmail = (process.env.SEED_SUPERADMIN_EMAIL || 'superadmin@aii.in').toLowerCase();
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD || 'Admin@123';
  const superHash = await bcrypt.hash(superadminPassword, 10);

  await User.create({
    name: 'Super Administrator',
    email: superadminEmail,
    passwordHash: superHash,
    role: 'superadmin',
    department: 'IT Administration',
    location: 'Bangalore, Karnataka',
    branch: 'Headquarters',
    phone: '+91 98765 43210',
  });
  await seedSettings();

  console.log('[seed] minimal seed done — blank slate, only the login account was created.');
  console.log(`[seed]   superadmin: ${superadminEmail} / ${superadminPassword}`);
}

module.exports = seedAll;
module.exports.seedAll = seedAll;
module.exports.seedMinimal = seedMinimal;
