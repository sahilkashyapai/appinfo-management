// One-off script: seeds realistic-looking sample job applications/referrals into
// Hiring Management for demoing the feature. Every record is flagged isDemo: true
// so a superadmin can wipe them cleanly from Settings > Danger Zone before go-live.
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Department = require('../models/Department');
const User = require('../models/User');
const JobApplication = require('../models/JobApplication');

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

async function main() {
  await connectDB();

  const depts = await Department.find({ name: { $not: /Head of Company/i } }).select('name');
  if (depts.length === 0) throw new Error('No departments found — seed departments first.');

  const referrers = await User.find({ isActive: true, employeeRef: { $ne: null } }).limit(3).select('_id name');
  const fallbackReferrer = referrers[0] || (await User.findOne({ isActive: true }).select('_id name'));

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
      return { ...base, source: 'referral', referrerRef: referrers[i % referrers.length]?._id || fallbackReferrer._id };
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

  await JobApplication.insertMany(docs);
  console.log(`[seed] inserted ${docs.length} dummy job application(s), flagged isDemo: true.`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
