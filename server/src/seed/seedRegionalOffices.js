// One-off script: adds a small demo org-chart branch (Manager > Team Lead >
// Senior Engineer > Engineer / Developer > Intern) for each of the two offices
// that had no employees yet — Alpharetta, United States and Cape Town, South
// Africa — so office-scoped superadmin accounts (see adminController's
// managedLocation) have real data to be scoped to. Additive only, flagged
// isDemo: true, no existing data touched.
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Department = require('../models/Department');
const Employee = require('../models/Employee');

function pastDate(year, month, day) {
  return new Date(year, month, day);
}

const OFFICES = [
  {
    location: 'Alpharetta, United States',
    empIdPrefix: 'DEMOUS',
    branch: [
      {
        name: 'Michael Turner',
        desig: 'Sales Operations Manager',
        roleLabel: 'Manager',
        dept: 'Sales Force',
        email: 'michael.turner@demo.aii.in',
        phone: '+1 4045550101',
        joined: pastDate(2017, 5, 12),
        dob: pastDate(1982, 4, 18),
        avatarIndex: 2,
      },
      {
        name: 'Rachel Kim',
        desig: 'Team Lead - Sales Force',
        roleLabel: 'Team Lead',
        dept: 'Sales Force',
        email: 'rachel.kim@demo.aii.in',
        phone: '+1 4045550102',
        joined: pastDate(2019, 2, 20),
        dob: pastDate(1988, 8, 3),
        avatarIndex: 6,
        managerName: 'Michael Turner',
      },
      {
        name: 'David Chen',
        desig: 'Senior Data Analyst',
        roleLabel: 'Senior Engineer',
        dept: 'Power BI / Data Analytics',
        email: 'david.chen@demo.aii.in',
        phone: '+1 4045550103',
        joined: pastDate(2020, 6, 8),
        dob: pastDate(1990, 11, 27),
        avatarIndex: 9,
        managerName: 'Rachel Kim',
      },
      {
        name: 'Sophia Martinez',
        desig: 'Data Analyst',
        roleLabel: 'Engineer / Developer',
        dept: 'Power BI / Data Analytics',
        email: 'sophia.martinez@demo.aii.in',
        phone: '+1 4045550104',
        joined: pastDate(2022, 1, 17),
        dob: pastDate(1994, 3, 9),
        avatarIndex: 4,
        managerName: 'David Chen',
      },
      {
        name: 'Ethan Brooks',
        desig: 'Sales Intern',
        roleLabel: 'Intern',
        dept: 'Sales Force',
        email: 'ethan.brooks@demo.aii.in',
        phone: '+1 4045550105',
        joined: pastDate(2025, 6, 2),
        dob: pastDate(2001, 9, 30),
        avatarIndex: 7,
        managerName: 'Rachel Kim',
      },
    ],
  },
  {
    location: 'Cape Town, South Africa',
    empIdPrefix: 'DEMOSA',
    branch: [
      {
        name: 'Thabo Nkosi',
        desig: 'IT Operations Manager',
        roleLabel: 'Manager',
        dept: 'IT Engineer',
        email: 'thabo.nkosi@demo.aii.in',
        phone: '+27 214550201',
        joined: pastDate(2016, 9, 5),
        dob: pastDate(1980, 6, 14),
        avatarIndex: 1,
      },
      {
        name: 'Naledi Dlamini',
        desig: 'Team Lead - IT Engineering',
        roleLabel: 'Team Lead',
        dept: 'IT Engineer',
        email: 'naledi.dlamini@demo.aii.in',
        phone: '+27 214550202',
        joined: pastDate(2018, 11, 19),
        dob: pastDate(1987, 2, 22),
        avatarIndex: 5,
        managerName: 'Thabo Nkosi',
      },
      {
        name: 'Sipho Mokoena',
        desig: 'Senior Database Engineer',
        roleLabel: 'Senior Engineer',
        dept: 'Database',
        email: 'sipho.mokoena@demo.aii.in',
        phone: '+27 214550203',
        joined: pastDate(2019, 4, 3),
        dob: pastDate(1989, 12, 5),
        avatarIndex: 3,
        managerName: 'Naledi Dlamini',
      },
      {
        name: 'Amahle Khumalo',
        desig: 'Database Engineer',
        roleLabel: 'Engineer / Developer',
        dept: 'Database',
        email: 'amahle.khumalo@demo.aii.in',
        phone: '+27 214550204',
        joined: pastDate(2021, 8, 23),
        dob: pastDate(1995, 7, 11),
        avatarIndex: 8,
        managerName: 'Sipho Mokoena',
      },
      {
        name: 'Liam van der Merwe',
        desig: 'IT Intern',
        roleLabel: 'Intern',
        dept: 'IT Engineer',
        email: 'liam.vandermerwe@demo.aii.in',
        phone: '+27 214550205',
        joined: pastDate(2025, 7, 14),
        dob: pastDate(2002, 1, 26),
        avatarIndex: 0,
        managerName: 'Naledi Dlamini',
      },
    ],
  },
];

async function main() {
  await connectDB();

  const allDeptNames = [...new Set(OFFICES.flatMap((o) => o.branch.map((b) => b.dept)))];
  const depts = await Department.find({ name: { $in: allDeptNames } });
  const deptByName = Object.fromEntries(depts.map((d) => [d.name, d]));
  for (const n of allDeptNames) {
    if (!deptByName[n]) throw new Error(`Department "${n}" not found — cannot seed regional office demo data.`);
  }

  for (const office of OFFICES) {
    const existing = await Employee.findOne({ location: office.location });
    if (existing) {
      console.log(`[seed] skipping ${office.location} — already has employees (e.g. ${existing.name})`);
      continue;
    }

    const byName = {};
    let seq = 1;
    for (const step of office.branch) {
      const dept = deptByName[step.dept];
      const empId = `${office.empIdPrefix}${String(seq).padStart(3, '0')}`;
      seq += 1;
      const emp = await Employee.create({
        empId,
        name: step.name,
        dept: dept.name,
        deptRef: dept._id,
        desig: step.desig,
        roleLabel: step.roleLabel,
        joined: step.joined,
        dob: step.dob,
        email: step.email,
        phone: step.phone,
        location: office.location,
        status: 'active',
        avatarIndex: step.avatarIndex,
        isDemo: true,
        managerRef: step.managerName ? byName[step.managerName]._id : null,
      });
      byName[step.name] = emp;
    }

    console.log(`[seed] ${office.location} branch built:`);
    console.log(`  ${office.branch.map((b) => `${b.roleLabel}: ${b.name}`).join(' > ')}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
