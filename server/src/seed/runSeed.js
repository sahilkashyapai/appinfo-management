const bcrypt = require('bcryptjs');

const { prisma } = require('../db');
const { SETTINGS_DEFAULTS } = require('../utils/getSettings');

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

// Every step takes `db` (the PrismaClient by default) so the whole seed can
// also run inside an interactive transaction (`prisma.$transaction(async (tx) => seedAll(tx))`).

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

// Wipes the same data the Mongo seed wiped, children before parents so no
// foreign key blocks a delete. Note: in MySQL, deleting users/employees also
// cascades to the rows that hang off them (attendance, leave requests, time
// logs, documents, chat memberships, ...) instead of leaving them orphaned.
async function wipeCollections(db = prisma) {
  console.log('[seed] wiping existing collections...');
  await db.rsvp.deleteMany({});
  await db.wallPollVote.deleteMany({});
  await db.wallPollOption.deleteMany({});
  await db.wallReaction.deleteMany({});
  await db.wallComment.deleteMany({});
  await db.wallPost.deleteMany({});
  await db.notificationRead.deleteMany({});
  await db.notificationClear.deleteMany({});
  await db.notification.deleteMany({});
  await db.announcement.deleteMany({});
  await db.event.deleteMany({});
  await db.holiday.deleteMany({});
  await db.auditLog.deleteMany({});
  await db.settings.deleteMany({});
  // Break the user <-> employee <-> department cross-references first.
  await db.department.updateMany({ data: { headId: null } });
  await db.employee.updateMany({ data: { managerId: null, userId: null } });
  await db.user.updateMany({ data: { employeeId: null } });
  await db.user.deleteMany({});
  await db.employee.deleteMany({});
  await db.department.deleteMany({});
}

async function seedDepartments(db = prisma) {
  const depts = [];
  for (const d of DEPARTMENTS) {
    depts.push(await db.department.create({ data: { name: d.name, code: d.code, icon: d.icon, color: d.color, description: d.desc } }));
  }
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
      deptId: deptMap[e.dept].id,
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
      deptId: deptMap[dept].id,
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

async function seedEmployees(deptMap, db = prisma) {
  const namedDocs = buildNamedEmployeeDocs(deptMap);
  const generatedDocs = buildGeneratedEmployeeDocs(deptMap, NAMED_EMPLOYEES.length + 1);
  const allDocs = [...namedDocs, ...generatedDocs];

  // One create per row (createMany doesn't return the new ids on MySQL).
  const created = [];
  for (const { _mgrName, ...doc } of allDocs) {
    created.push(await db.employee.create({ data: doc }));
  }
  const byName = new Map();
  created.forEach((e) => {
    if (!byName.has(e.name)) byName.set(e.name, e);
  });

  // Resolve manager references now that every employee has an id.
  for (const [idx, doc] of allDocs.entries()) {
    if (doc._mgrName && byName.has(doc._mgrName)) {
      const managerId = byName.get(doc._mgrName).id;
      await db.employee.update({ where: { id: created[idx].id }, data: { managerId } });
      created[idx].managerId = managerId;
    }
  }

  return { employees: created, byName };
}

async function attachDepartmentHeads(deptMap, byName, db = prisma) {
  for (const d of DEPARTMENTS.filter((dept) => byName.has(dept.head))) {
    await db.department.update({ where: { id: deptMap[d.name].id }, data: { headId: byName.get(d.head).id } });
  }
}

async function seedUsers(byName, db = prisma) {
  const superadminEmail = (process.env.SEED_SUPERADMIN_EMAIL || 'superadmin@aii.in').toLowerCase();
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD || 'Admin@123';

  const [superHash, hrHash, mgrHash, empHash] = await Promise.all(
    [superadminPassword, 'Welcome@123', 'Welcome@123', 'Welcome@123'].map((p) => bcrypt.hash(p, 10))
  );

  const superadmin = await db.user.create({
    data: {
      name: 'Super Administrator',
      email: superadminEmail,
      passwordHash: superHash,
      role: 'superadmin',
      department: 'IT Administration',
      location: 'Bangalore, Karnataka',
      branch: 'Headquarters',
      phone: '+91 98765 43210',
    },
  });

  const roleLinks = [
    { name: 'Priya Nair', role: 'admin', hash: hrHash },
    { name: 'Vijay Kumar', role: 'admin', hash: mgrHash },
    { name: 'Rahul Sharma', role: 'employee', hash: empHash },
  ];

  const linkedUsers = [superadmin];
  for (const link of roleLinks) {
    const emp = byName.get(link.name);
    if (!emp) continue;
    const user = await db.user.create({
      data: {
        name: emp.name,
        email: emp.email,
        passwordHash: link.hash,
        role: link.role,
        employeeId: emp.id,
        department: emp.dept,
        location: emp.location,
      },
    });
    await db.employee.update({ where: { id: emp.id }, data: { userId: user.id } });
    linkedUsers.push(user);
  }

  console.log('[seed] seeded users (email / password):');
  console.log(`  superadmin: ${superadminEmail} / ${superadminPassword}`);
  roleLinks.forEach((l) => byName.has(l.name) && console.log(`  ${l.role}: ${byName.get(l.name).email} / Welcome@123`));

  return linkedUsers; // [superadmin, hr?, manager?, employee?]
}

async function seedEvents(db = prisma) {
  const now = Date.now();
  const created = [];
  for (const e of EVENTS) {
    created.push(
      await db.event.create({
        data: {
          title: e.title,
          type: e.type,
          date: new Date(now + e.dayOffset * 24 * 60 * 60 * 1000),
          venue: e.venue,
          status: e.status,
          emoji: e.emoji,
          color: e.color,
          capacity: e.capacity,
        },
      })
    );
  }
  return created;
}

async function seedRsvps(events, employees, db = prisma) {
  const rsvpDocs = [];
  for (const event of events) {
    if (event.status !== 'published') continue;
    const attendeePool = employees.filter(() => Math.random() < 0.55);
    for (const emp of attendeePool) {
      const roll = Math.random();
      const status = roll < 0.75 ? 'yes' : roll < 0.9 ? 'maybe' : 'no';
      rsvpDocs.push({ eventId: event.id, employeeId: emp.id, status, respondedAt: new Date() });
    }
  }
  if (rsvpDocs.length) await db.rsvp.createMany({ data: rsvpDocs, skipDuplicates: true }).catch(() => {});
}

// Builds the nested creates for a wall post's old embedded arrays
// (reactions.{like,love,celebrate}[] and comments[]). A user can hold a given
// reaction type only once in MySQL, so duplicate ids within one type are dropped.
function wallPostData({ authorId, reactions = {}, comments = [], ...rest }) {
  const reactionRows = [];
  for (const type of ['like', 'love', 'celebrate']) {
    for (const userId of new Set(reactions[type] || [])) reactionRows.push({ userId, type });
  }
  return {
    ...rest,
    authorId,
    reactions: { create: reactionRows },
    comments: { create: comments.map((c) => ({ authorId: c.authorId, text: c.text })) },
  };
}

async function seedWall(users, db = prisma) {
  const [superadmin, hr, manager, employee] = users;
  const author = (u) => u || superadmin;

  const posts = [
    {
      authorId: author(hr).id,
      tag: 'birthday',
      text: "Happy Birthday! Wishing you a year full of amazing code, zero bugs, and lots of chai! You're a rockstar developer and an even better colleague. Have a blast!",
      reactions: { like: [author(manager).id], love: [author(employee).id], celebrate: [superadmin.id] },
      comments: [
        { authorId: author(manager).id, text: 'Happy birthday!' },
        { authorId: superadmin.id, text: 'Many happy returns!' },
      ],
    },
    {
      authorId: author(hr).id,
      tag: 'anniversary',
      text: 'Congratulations on completing another incredible year with Applied Information India! Your dedication has been truly outstanding. Thank you for being such a vital part of our journey!',
      reactions: { like: [superadmin.id, author(manager).id], love: [author(employee).id], celebrate: [] },
      comments: [{ authorId: author(employee).id, text: 'Absolutely legendary!' }],
    },
    {
      authorId: author(manager).id,
      tag: 'anniversary',
      text: 'Proud to be part of this journey at Applied Information India! Grateful for every team member who made this possible. Here\'s to many more!',
      reactions: { like: [superadmin.id], love: [author(hr).id], celebrate: [author(employee).id] },
      comments: [],
    },
    {
      authorId: author(employee).id,
      tag: 'event',
      text: 'What an amazing celebration! A huge thank you to the HR team for organizing such a beautiful event. Looking forward to more celebrations together.',
      reactions: { like: [author(hr).id], love: [], celebrate: [superadmin.id] },
      comments: [],
    },
  ];

  for (const post of posts) {
    await db.wallPost.create({ data: wallPostData(post) });
  }
}

async function seedNotifications(db = prisma) {
  await db.notification.createMany({
    data: [
      { icon: 'fa-solid fa-cake-candles', bg: '#FDEBD0', type: 'birthday', title: 'Birthday reminders are live', body: 'Employees with a birthday today will surface here automatically every morning.' },
      { icon: 'fa-solid fa-calendar-days', bg: '#EBF5FB', type: 'event', title: 'Event reminders are live', body: 'Published events send D-7 and D-1 reminders automatically.' },
      { icon: 'fa-solid fa-shield-halved', bg: '#F0FDF4', type: 'info', title: 'Welcome to AII Celebrations', body: 'Your account was seeded successfully. Explore the sidebar to get started.' },
    ],
  });
}

async function seedAnnouncements(users, db = prisma) {
  const [superadmin, hr] = users;
  const now = Date.now();
  await db.announcement.createMany({
    data: ANNOUNCEMENTS.map((a, i) => ({
      title: a.title,
      body: a.body,
      priority: a.priority,
      icon: a.icon,
      pinned: a.pinned,
      postedById: (i % 2 === 0 ? hr : superadmin)?.id || superadmin.id,
      createdAt: new Date(now - (i + 1) * 24 * 60 * 60 * 1000),
    })),
  });
}

async function seedHolidays(db = prisma) {
  const year = new Date().getFullYear();
  await db.holiday.createMany({
    data: HOLIDAYS.map((h) => ({
      name: h.name,
      date: dateFromYearAndMD(year, h.monthDay),
      type: h.type,
      description: h.desc,
    })),
  });
}

async function seedAuditLog(users, db = prisma) {
  const [superadmin, hr] = users;
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  await db.auditLog.createMany({
    data: [
      { actorId: superadmin.id, actorName: superadmin.name, action: 'LOGIN', entity: 'users', recordId: String(superadmin.id), ip: '127.0.0.1', detail: 'Seed script initial login placeholder', createdAt: new Date(now - 5 * hour) },
      { actorId: (hr || superadmin).id, actorName: (hr || superadmin).name, action: 'CREATE', entity: 'employees', recordId: 'EMP001', ip: '127.0.0.1', detail: 'Seeded demo employee records', createdAt: new Date(now - 4 * hour) },
      { actorId: superadmin.id, actorName: superadmin.name, action: 'UPDATE', entity: 'settings', recordId: '-', ip: '127.0.0.1', detail: 'Initialized default settings', createdAt: new Date(now - 3 * hour) },
    ],
  });
}

async function seedSettings(db = prisma) {
  await db.settings.create({ data: { singletonKey: 'global', ...SETTINGS_DEFAULTS } });
}

async function seedAll(db = prisma) {
  await wipeCollections(db);

  const deptMap = await seedDepartments(db);
  const { employees, byName } = await seedEmployees(deptMap, db);
  await attachDepartmentHeads(deptMap, byName, db);
  const users = await seedUsers(byName, db);

  const events = await seedEvents(db);
  await seedRsvps(events, employees, db);

  await seedWall(users, db);
  await seedNotifications(db);
  await seedAnnouncements(users, db);
  await seedHolidays(db);
  await seedAuditLog(users, db);
  await seedSettings(db);

  console.log(`[seed] done - ${employees.length} employees, ${events.length} events, ${DEPARTMENTS.length} departments.`);
}

// Blank-slate seed: just the login account + default settings, no demo data.
// Wipes the same data as seedAll first, so it must never run against a
// database holding real records.
async function seedMinimal(db = prisma) {
  await wipeCollections(db);

  const superadminEmail = (process.env.SEED_SUPERADMIN_EMAIL || 'superadmin@aii.in').toLowerCase();
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD || 'Admin@123';
  const superHash = await bcrypt.hash(superadminPassword, 10);

  await db.user.create({
    data: {
      name: 'Super Administrator',
      email: superadminEmail,
      passwordHash: superHash,
      role: 'superadmin',
      department: 'IT Administration',
      location: 'Bangalore, Karnataka',
      branch: 'Headquarters',
      phone: '+91 98765 43210',
    },
  });
  await seedSettings(db);

  console.log('[seed] minimal seed done - blank slate, only the login account was created.');
  console.log(`[seed]   superadmin: ${superadminEmail} / ${superadminPassword}`);
}

module.exports = seedAll;
module.exports.seedAll = seedAll;
module.exports.seedMinimal = seedMinimal;
