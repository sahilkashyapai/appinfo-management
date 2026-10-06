const { JobStatus } = require('@prisma/client');
const { prisma, shape, shapeMany, sel } = require('../db');
const writeAudit = require('../utils/audit');

const MAX_RESUME_CHARS = 6 * 1024 * 1024; // ~4.5MB decoded
const GENDERS = ['male', 'female', 'other'];
const JOB_STATUSES = Object.values(JobStatus);

// The base64 resume is only sent by getOne — list/update responses omit it.
const OMIT_RESUME = { resumeUrl: true };

// The Mongoose schema trimmed these string fields on save.
function trim(value) {
  return String(value ?? '').trim();
}

function validateResume(resumeUrl) {
  if (!resumeUrl || typeof resumeUrl !== 'string' || !resumeUrl.startsWith('data:')) return 'A resume file is required.';
  if (resumeUrl.length > MAX_RESUME_CHARS) return 'Resume must be under ~4.5MB.';
  return null;
}

// Public: candidate submits the application form.
async function apply(req, res) {
  const { name, email, phone, department, gender, experienceYears, permanentAddress, currentAddress, resumeUrl, resumeName } = req.body;
  if (!name || !email || !phone || !department || !gender || experienceYears === undefined || experienceYears === '') {
    return res.status(400).json({ message: 'Name, email, mobile number, department, gender, and years of experience are required.' });
  }
  if (!GENDERS.includes(gender)) return res.status(400).json({ message: 'Invalid gender.' });
  const experience = Number(experienceYears);
  if (Number.isNaN(experience) || experience < 0) return res.status(400).json({ message: 'Years of experience must be a non-negative number.' });

  const resumeError = validateResume(resumeUrl);
  if (resumeError) return res.status(400).json({ message: resumeError });

  const application = await prisma.jobApplication.create({
    data: {
      name: trim(name),
      email: trim(email).toLowerCase(),
      phone: trim(phone),
      department: trim(department),
      gender,
      experienceYears: experience,
      permanentAddress: trim(permanentAddress),
      currentAddress: trim(currentAddress),
      resumeUrl,
      resumeName: resumeName || '',
    },
    select: { id: true },
  });

  await writeAudit({
    ip: req.ip,
    user: null,
    action: 'CREATE',
    entity: 'job_applications',
    recordId: application.id,
    detail: `New job application from ${name} for "${department}"`,
  });

  res.status(201).json({ message: 'Application submitted.' });
}

// Authenticated (any employee): refer a candidate. Referrer identity comes from
// the session, not the request body, so it can't be spoofed.
async function submitReferral(req, res) {
  const { candidateName, candidatePhone, department, resumeUrl, resumeName } = req.body;
  if (!candidateName || !candidatePhone || !department) {
    return res.status(400).json({ message: 'Candidate name, mobile number, and department are required.' });
  }
  const resumeError = validateResume(resumeUrl);
  if (resumeError) return res.status(400).json({ message: resumeError });

  const application = await prisma.jobApplication.create({
    data: {
      name: trim(candidateName),
      phone: trim(candidatePhone),
      department: trim(department),
      resumeUrl,
      resumeName: resumeName || '',
      source: 'referral',
      referrerId: String(req.user._id),
    },
    select: { id: true },
  });

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'CREATE',
    entity: 'job_applications',
    recordId: application.id,
    detail: `${req.user.name} referred ${candidateName} for "${department}"`,
  });

  res.status(201).json({ message: 'Referral submitted.' });
}

// Authenticated (any employee): the candidates *they* referred, with status
// and any HR feedback meant for the referrer — never internal notes or the resume.
async function myReferrals(req, res) {
  const items = await prisma.jobApplication.findMany({
    where: { referrerId: String(req.user._id), source: 'referral' },
    select: sel('JobApplication', 'name phone department status referrerComment resumeName createdAt'),
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items: shapeMany('JobApplication', items) });
}

// Only the referrer who submitted it may edit/withdraw, and only before HR has
// started reviewing — once it's moved past 'new' the record is no longer theirs to change.
async function assertOwnEditableReferral(req, res) {
  const application = await prisma.jobApplication.findUnique({
    where: { id: String(req.params.id) },
    select: sel('JobApplication', 'name source referrerRef status'),
  });
  if (!application) {
    res.status(404).json({ message: 'Referral not found.' });
    return null;
  }
  if (application.source !== 'referral' || String(application.referrerId) !== String(req.user._id)) {
    res.status(403).json({ message: 'You can only manage referrals you submitted.' });
    return null;
  }
  if (application.status !== 'new') {
    res.status(400).json({ message: 'This referral is already being reviewed and can no longer be changed.' });
    return null;
  }
  return application;
}

async function updateReferral(req, res) {
  const application = await assertOwnEditableReferral(req, res);
  if (!application) return;

  const { candidateName, candidatePhone, department, resumeUrl, resumeName } = req.body;
  if (!candidateName || !candidatePhone || !department) {
    return res.status(400).json({ message: 'Candidate name, mobile number, and department are required.' });
  }
  const data = { name: trim(candidateName), phone: trim(candidatePhone), department: trim(department) };
  if (resumeUrl) {
    const resumeError = validateResume(resumeUrl);
    if (resumeError) return res.status(400).json({ message: resumeError });
    data.resumeUrl = resumeUrl;
    data.resumeName = resumeName || '';
  }
  await prisma.jobApplication.update({ where: { id: application.id }, data, select: { id: true } });

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'job_applications',
    recordId: application.id,
    detail: `${req.user.name} edited referral for ${candidateName}`,
  });

  res.json({ message: 'Referral updated.' });
}

async function deleteReferral(req, res) {
  const application = await assertOwnEditableReferral(req, res);
  if (!application) return;

  await prisma.jobApplication.deleteMany({ where: { id: application.id } });
  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'DELETE',
    entity: 'job_applications',
    recordId: application.id,
    detail: `${req.user.name} withdrew referral for ${application.name}`,
  });
  res.json({ message: 'Referral withdrawn.' });
}

async function list(req, res) {
  const { status, department, from, to } = req.query;
  const where = {};
  if (status) {
    // An unknown status simply matched nothing on MongoDB; Prisma would reject it.
    if (!JOB_STATUSES.includes(status)) return res.json({ items: [] });
    where.status = status;
  }
  if (department) where.department = String(department);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(new Date(to).setHours(23, 59, 59, 999));
  }
  const items = await prisma.jobApplication.findMany({
    where,
    omit: OMIT_RESUME,
    include: { referrerRef: { select: sel('User', 'name email') } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items: shapeMany('JobApplication', items) });
}

async function getOne(req, res) {
  const application = await prisma.jobApplication.findUnique({ where: { id: String(req.params.id) } });
  if (!application) return res.status(404).json({ message: 'Application not found.' });
  res.json({ item: shape('JobApplication', application) });
}

async function updateStatus(req, res) {
  const { status, notes, referrerComment } = req.body;
  const existing = await prisma.jobApplication.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!existing) return res.status(404).json({ message: 'Application not found.' });

  const data = {};
  if (status) {
    if (!JOB_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Invalid status.' });
    }
    data.status = status;
  }
  if (notes !== undefined) data.notes = notes == null ? null : String(notes);
  if (referrerComment !== undefined) data.referrerComment = referrerComment == null ? null : String(referrerComment);
  const application = await prisma.jobApplication.update({ where: { id: existing.id }, data, omit: OMIT_RESUME });

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'job_applications',
    recordId: application.id,
    detail: `Updated application from ${application.name} (status: ${application.status})`,
  });

  res.json({ item: shape('JobApplication', application) });
}

async function remove(req, res) {
  const application = await prisma.jobApplication.findUnique({ where: { id: String(req.params.id) }, select: sel('JobApplication', 'name') });
  if (!application) return res.status(404).json({ message: 'Application not found.' });
  await prisma.jobApplication.deleteMany({ where: { id: application.id } });
  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'DELETE',
    entity: 'job_applications',
    recordId: application.id,
    detail: `Deleted application from ${application.name}`,
  });
  res.json({ message: 'Application deleted.' });
}

module.exports = { apply, submitReferral, myReferrals, updateReferral, deleteReferral, list, getOne, updateStatus, remove };
