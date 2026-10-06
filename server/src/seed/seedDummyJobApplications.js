// One-off script: seeds realistic-looking sample job applications/referrals into
// Hiring Management for demoing the feature. Every record is flagged isDemo: true
// so a superadmin can wipe them cleanly from Settings > Danger Zone before go-live.
require('dotenv').config();
const connectDB = require('../config/db');
const { disconnectDB } = require('../config/db');
const { prisma } = require('../db');

function resumeText({ name, department, experienceYears, email, phone }) {
  return `${name}
${email} | ${phone}

OBJECTIVE
Experienced ${department} professional with ${experienceYears} year(s) of experience, seeking to
contribute to Applied Information India's ${department} team.

EXPERIENCE
${experienceYears >= 1 ? `${Math.floor(experienceYears)}+ years across product and services companies, delivering ${department.toLowerCase()} work in cross-functional teams.` : 'Recent graduate with internship/project experience in ' + department + '.'}

SKILLS
Strong communication, problem solving, and collaboration skills relevant to ${department}.

EDUCATION
Bachelor's degree relevant to ${department}.

(This is placeholder sample content generated for demo purposes.)`;
}

function toResumeDataUrl(text) {
  return `data:text/plain;base64,${Buffer.from(text, 'utf-8').toString('base64')}`;
}

const CANDIDATES = [
  { name: 'Aditi Sharma', gender: 'female', experienceYears: 3, city: 'Chandigarh' },
  { name: 'Rohan Verma', gender: 'male', experienceYears: 5.5, city: 'Mohali' },
  { name: 'Priya Nair', gender: 'female', experienceYears: 1, city: 'Bengaluru' },
  { name: 'Karan Mehta', gender: 'male', experienceYears: 8, city: 'Pune' },
  { name: 'Simran Kaur', gender: 'female', experienceYears: 0.5, city: 'Chandigarh' },
  { name: 'Arjun Rao', gender: 'male', experienceYears: 2, city: 'Hyderabad' },
  { name: 'Neha Gupta', gender: 'female', experienceYears: 6, city: 'Mohali' },
  { name: 'Vikram Singh', gender: 'male', experienceYears: 4, city: 'Delhi' },
  { name: 'Ananya Iyer', gender: 'female', experienceYears: 10, city: 'Chennai' },
  { name: 'Farhan Khan', gender: 'other', experienceYears: 1.5, city: 'Mumbai' },
  { name: 'Ritika Bansal', gender: 'female', experienceYears: 3.5, city: 'Chandigarh' },
  { name: 'Devansh Joshi', gender: 'male', experienceYears: 12, city: 'Mohali' },
];

const STATUSES = ['new', 'new', 'new', 'reviewed', 'reviewed', 'shortlisted', 'shortlisted', 'rejected', 'hired'];

function emailFor(name) {
  return `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`;
}

function phoneFor(i) {
  return `+91 9${(800000000 + i * 137).toString().slice(0, 9)}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// `db` is the PrismaClient by default; pass an interactive-transaction client
// to run it atomically.
async function seedJobApplications(db = prisma) {
  const natural = [{ createdAt: 'asc' }, { id: 'asc' }];
  const depts = await db.department.findMany({
    where: { NOT: { name: { contains: 'Leadership' } } },
    select: { id: true, name: true },
    orderBy: natural,
  });
  if (depts.length === 0) throw new Error('No departments found - seed departments first.');

  const referrers = await db.user.findMany({
    where: { isActive: true, employeeId: { not: null } },
    select: { id: true, name: true },
    orderBy: natural,
    take: 3,
  });
  const fallbackReferrer =
    referrers[0] || (await db.user.findFirst({ where: { isActive: true }, select: { id: true, name: true }, orderBy: natural }));

  const docs = CANDIDATES.map((c, i) => {
    const dept = depts[i % depts.length].name;
    const isReferral = i % 5 === 4 && fallbackReferrer; // ~1 in 5 as a referral
    const email = emailFor(c.name);
    const phone = phoneFor(i);
    const address = `${100 + i} Sector ${10 + (i % 20)}, ${c.city}, India`;
    const status = STATUSES[i % STATUSES.length];
    const createdAt = daysAgo(i * 3 + 1);

    const base = {
      name: c.name,
      phone,
      department: dept,
      resumeUrl: toResumeDataUrl(resumeText({ name: c.name, department: dept, experienceYears: c.experienceYears, email, phone })),
      resumeName: `${c.name.replace(/\s+/g, '_')}_Resume.txt`,
      status,
      isDemo: true,
      createdAt,
    };

    if (isReferral) {
      return { ...base, source: 'referral', referrerId: referrers[i % referrers.length]?.id || fallbackReferrer.id };
    }
    return {
      ...base,
      source: 'careers_page',
      email,
      gender: c.gender,
      experienceYears: c.experienceYears,
      permanentAddress: address,
      currentAddress: address,
    };
  });

  await db.jobApplication.createMany({ data: docs });
  console.log(`[seed] inserted ${docs.length} dummy job application(s), flagged isDemo: true.`);
}

async function main() {
  await connectDB();
  await seedJobApplications();
  await disconnectDB();
}

// Only when run directly (`node src/seed/seedDummyJobApplications.js`), never as a side effect of require().
if (require.main === module) {
  main().catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  });
}

module.exports = { seedJobApplications };
