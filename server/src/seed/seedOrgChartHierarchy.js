// One-off script: builds a full 6-level org chart (President & CTO > Manager >
// Team Lead > Senior Engineer > Engineer / Developer > Intern)
// across two branches, so the Org Chart page has a real hierarchy to render
// instead of a flat employee list.
//
// Adds 3 new employees (1 President & CTO + 2 Managers, flagged isDemo: true)
// and reuses the 8 employees from the earlier dashboard dummy-data seed as the
// TL/Senior/Junior/Intern layers of each branch - additive only, no existing
// data (including the 3 real employees) is touched or removed.
require('dotenv').config();
const connectDB = require('../config/db');
const { disconnectDB } = require('../config/db');
const { prisma } = require('../db');

function pastDate(year, month, day) {
  return new Date(year, month, day);
}

// `db` is the PrismaClient by default; pass an interactive-transaction client
// to run it atomically.
async function seedOrgChartHierarchy(db = prisma) {
  const deptNames = ['Leadership', 'Dot Net', 'Design', 'Quality Assurance'];
  const depts = await db.department.findMany({ where: { name: { in: deptNames } } });
  const deptByName = Object.fromEntries(depts.map((d) => [d.name, d]));
  for (const n of deptNames) {
    if (!deptByName[n]) throw new Error(`Department "${n}" not found - cannot build org chart.`);
  }

  const existingNames = ['Aman Chopra', 'Yash Malhotra', 'Ishaan Kulkarni', 'Rajesh Pillai', 'Meera Kapoor', 'Lakshmi Pillai', 'Divya Menon', 'Tanvi Deshpande'];
  const existing = await db.employee.findMany({ where: { name: { in: existingNames } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  const byName = Object.fromEntries(existing.map((e) => [e.name, e]));
  const missing = existingNames.filter((n) => !byName[n]);
  if (missing.length) throw new Error(`Missing expected demo employees: ${missing.join(', ')} - run seedDummyDashboardData.js first.`);

  // --- New top of the chart: CEO + 2 Managers ---------------------------
  const ceo = await db.employee.create({
    data: {
      empId: 'DEMOORG001',
      name: 'Arjun Mehta',
      dept: 'Leadership',
      deptId: deptByName['Leadership'].id,
      desig: 'Chief Executive Officer',
      roleLabel: 'President & CTO',
      joined: pastDate(2016, 3, 1),
      dob: pastDate(1975, 5, 14),
      email: 'arjun.mehta@demo.aii.in',
      phone: '+91 9800009001',
      location: 'Mohali, India',
      status: 'active',
      avatarIndex: 1,
      isDemo: true,
    },
  });

  const engManager = await db.employee.create({
    data: {
      empId: 'DEMOORG002',
      name: 'Kavita Reddy',
      dept: 'Dot Net',
      deptId: deptByName['Dot Net'].id,
      desig: 'Engineering Manager',
      roleLabel: 'Manager',
      joined: pastDate(2018, 6, 15),
      dob: pastDate(1985, 2, 22),
      email: 'kavita.reddy@demo.aii.in',
      phone: '+91 9800009002',
      location: 'Mohali, India',
      status: 'active',
      avatarIndex: 3,
      isDemo: true,
      managerId: ceo.id,
    },
  });

  const designManager = await db.employee.create({
    data: {
      empId: 'DEMOORG003',
      name: 'Ritu Sharma',
      dept: 'Design',
      deptId: deptByName['Design'].id,
      desig: 'Design & QA Manager',
      roleLabel: 'Manager',
      joined: pastDate(2018, 8, 3),
      dob: pastDate(1986, 9, 10),
      email: 'ritu.sharma@demo.aii.in',
      phone: '+91 9800009003',
      location: 'Mohali, India',
      status: 'active',
      avatarIndex: 5,
      isDemo: true,
      managerId: ceo.id,
    },
  });

  // --- Branch A (Engineering): Manager > TL > Senior > Employee > Intern ----
  const branchA = [
    { name: 'Aman Chopra', desig: 'Team Lead - Engineering', roleLabel: 'Team Lead', dept: 'Dot Net', managerId: engManager.id },
    { name: 'Yash Malhotra', desig: 'Senior Software Engineer', roleLabel: 'Senior Engineer', dept: 'Dot Net', managerId: byName['Aman Chopra'].id },
    { name: 'Ishaan Kulkarni', desig: 'Software Engineer', roleLabel: 'Engineer / Developer', dept: 'Dot Net', managerId: byName['Yash Malhotra'].id },
    { name: 'Rajesh Pillai', desig: 'Engineering Intern', roleLabel: 'Intern', dept: 'Dot Net', managerId: byName['Ishaan Kulkarni'].id },
  ];

  // --- Branch B (Design & QA): Manager > TL > Senior > Employee > Intern ---
  const branchB = [
    { name: 'Meera Kapoor', desig: 'Team Lead - Design', roleLabel: 'Team Lead', dept: 'Design', managerId: designManager.id },
    { name: 'Lakshmi Pillai', desig: 'Senior QA Engineer', roleLabel: 'Senior Engineer', dept: 'Quality Assurance', managerId: byName['Meera Kapoor'].id },
    { name: 'Divya Menon', desig: 'QA Engineer', roleLabel: 'Engineer / Developer', dept: 'Quality Assurance', managerId: byName['Lakshmi Pillai'].id },
    { name: 'Tanvi Deshpande', desig: 'QA Intern', roleLabel: 'Intern', dept: 'Quality Assurance', managerId: byName['Divya Menon'].id },
  ];

  for (const step of [...branchA, ...branchB]) {
    const dept = deptByName[step.dept] || (await db.department.findFirst({ where: { name: step.dept } }));
    if (!dept) throw new Error(`Department "${step.dept}" not found.`);
    await db.employee.update({
      where: { id: byName[step.name].id },
      data: { desig: step.desig, roleLabel: step.roleLabel, dept: dept.name, deptId: dept.id, managerId: step.managerId },
    });
  }

  console.log('[seed] org chart hierarchy built:');
  console.log('  President & CTO: Arjun Mehta');
  console.log('  ├─ Manager: Kavita Reddy > TL: Aman Chopra > Senior: Yash Malhotra > Engineer: Ishaan Kulkarni > Intern: Rajesh Pillai');
  console.log('  └─ Manager: Ritu Sharma > TL: Meera Kapoor > Senior: Lakshmi Pillai > Engineer: Divya Menon > Intern: Tanvi Deshpande');
}

async function main() {
  await connectDB();
  await seedOrgChartHierarchy();
  await disconnectDB();
}

// Only when run directly (`node src/seed/seedOrgChartHierarchy.js`), never as a side effect of require().
if (require.main === module) {
  main().catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  });
}

module.exports = { seedOrgChartHierarchy };
