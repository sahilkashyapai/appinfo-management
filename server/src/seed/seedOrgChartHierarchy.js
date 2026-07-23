// One-off script: builds a full 6-level org chart (CEO > Manager > Team Lead >
// Senior Employee > Employee > Intern) across two branches, so the Org Chart
// page has a real hierarchy to render instead of a flat employee list.
//
// Adds 3 new employees (1 CEO + 2 Managers, flagged isDemo: true) and reuses
// the 8 employees from the earlier dashboard dummy-data seed as the
// TL/Senior/Junior/Intern layers of each branch — additive only, no existing
// data (including the 3 real employees) is touched or removed.
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Department = require('../models/Department');
const Employee = require('../models/Employee');

function pastDate(year, month, day) {
  return new Date(year, month, day);
}

async function main() {
  await connectDB();

  const deptNames = ['HEAD OF COMPANY', 'Dot Net', 'Design', 'Quality Assurance'];
  const depts = await Department.find({ name: { $in: deptNames } });
  const deptByName = Object.fromEntries(depts.map((d) => [d.name, d]));
  for (const n of deptNames) {
    if (!deptByName[n]) throw new Error(`Department "${n}" not found — cannot build org chart.`);
  }

  const existingNames = ['Aman Chopra', 'Yash Malhotra', 'Ishaan Kulkarni', 'Rajesh Pillai', 'Meera Kapoor', 'Lakshmi Pillai', 'Divya Menon', 'Tanvi Deshpande'];
  const existing = await Employee.find({ name: { $in: existingNames } });
  const byName = Object.fromEntries(existing.map((e) => [e.name, e]));
  const missing = existingNames.filter((n) => !byName[n]);
  if (missing.length) throw new Error(`Missing expected demo employees: ${missing.join(', ')} — run seedDummyDashboardData.js first.`);

  // --- New top of the chart: CEO + 2 Managers ---------------------------
  const ceo = await Employee.create({
    empId: 'DEMOORG001',
    name: 'Arjun Mehta',
    dept: 'HEAD OF COMPANY',
    deptRef: deptByName['HEAD OF COMPANY']._id,
    desig: 'Chief Executive Officer',
    roleLabel: 'CEO',
    joined: pastDate(2016, 3, 1),
    dob: pastDate(1975, 5, 14),
    email: 'arjun.mehta@demo.aii.in',
    phone: '+91 9800009001',
    location: 'Mohali, India',
    status: 'active',
    avatarIndex: 1,
    isDemo: true,
  });

  const engManager = await Employee.create({
    empId: 'DEMOORG002',
    name: 'Kavita Reddy',
    dept: 'Dot Net',
    deptRef: deptByName['Dot Net']._id,
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
    managerRef: ceo._id,
  });

  const designManager = await Employee.create({
    empId: 'DEMOORG003',
    name: 'Ritu Sharma',
    dept: 'Design',
    deptRef: deptByName['Design']._id,
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
    managerRef: ceo._id,
  });

  // --- Branch A (Engineering): Manager > TL > Senior > Employee > Intern ----
  const branchA = [
    { name: 'Aman Chopra', desig: 'Team Lead - Engineering', roleLabel: 'Team Lead', dept: 'Dot Net', managerRef: engManager._id },
    { name: 'Yash Malhotra', desig: 'Senior Software Engineer', roleLabel: 'Senior Employee', dept: 'Dot Net', managerRef: byName['Aman Chopra']._id },
    { name: 'Ishaan Kulkarni', desig: 'Software Engineer', roleLabel: 'Employee', dept: 'Dot Net', managerRef: byName['Yash Malhotra']._id },
    { name: 'Rajesh Pillai', desig: 'Engineering Intern', roleLabel: 'Intern', dept: 'Dot Net', managerRef: byName['Ishaan Kulkarni']._id },
  ];

  // --- Branch B (Design & QA): Manager > TL > Senior > Employee > Intern ---
  const branchB = [
    { name: 'Meera Kapoor', desig: 'Team Lead - Design', roleLabel: 'Team Lead', dept: 'Design', managerRef: designManager._id },
    { name: 'Lakshmi Pillai', desig: 'Senior QA Engineer', roleLabel: 'Senior Employee', dept: 'Quality Assurance', managerRef: byName['Meera Kapoor']._id },
    { name: 'Divya Menon', desig: 'QA Engineer', roleLabel: 'Employee', dept: 'Quality Assurance', managerRef: byName['Lakshmi Pillai']._id },
    { name: 'Tanvi Deshpande', desig: 'QA Intern', roleLabel: 'Intern', dept: 'Quality Assurance', managerRef: byName['Divya Menon']._id },
  ];

  for (const step of [...branchA, ...branchB]) {
    const dept = deptByName[step.dept] || (await Department.findOne({ name: step.dept }));
    if (!dept) throw new Error(`Department "${step.dept}" not found.`);
    await Employee.updateOne(
      { _id: byName[step.name]._id },
      { desig: step.desig, roleLabel: step.roleLabel, dept: dept.name, deptRef: dept._id, managerRef: step.managerRef }
    );
  }

  console.log('[seed] org chart hierarchy built:');
  console.log('  CEO: Arjun Mehta');
  console.log('  ├─ Manager: Kavita Reddy > TL: Aman Chopra > Senior: Yash Malhotra > Employee: Ishaan Kulkarni > Intern: Rajesh Pillai');
  console.log('  └─ Manager: Ritu Sharma > TL: Meera Kapoor > Senior: Lakshmi Pillai > Employee: Divya Menon > Intern: Tanvi Deshpande');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
