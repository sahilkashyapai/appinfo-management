const JobApplication = require('../models/JobApplication');
const writeAudit = require('../utils/audit');

const MAX_RESUME_CHARS = 6 * 1024 * 1024; // ~4.5MB decoded
const GENDERS = ['male', 'female', 'other'];

function validateResume(resumeUrl) {
  if (!resumeUrl || !resumeUrl.startsWith('data:')) return 'A resume file is required.';
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

  const application = await JobApplication.create({
    name,
    email,
    phone,
    department,
    gender,
    experienceYears: experience,
    permanentAddress: permanentAddress || '',
    currentAddress: currentAddress || '',
    resumeUrl,
    resumeName: resumeName || '',
  });

  await writeAudit({
    ip: req.ip,
    user: null,
    action: 'CREATE',
    entity: 'job_applications',
    recordId: application._id,
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

  const application = await JobApplication.create({
    name: candidateName,
    phone: candidatePhone,
    department,
    resumeUrl,
    resumeName: resumeName || '',
    source: 'referral',
    referrerRef: req.user._id,
  });

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'CREATE',
    entity: 'job_applications',
    recordId: application._id,
    detail: `${req.user.name} referred ${candidateName} for "${department}"`,
  });

  res.status(201).json({ message: 'Referral submitted.' });
}

async function list(req, res) {
  const { status, department, from, to } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (department) filter.department = department;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
  }
  const items = await JobApplication.find(filter).select('-resumeUrl').populate('referrerRef', 'name email').sort({ createdAt: -1 });
  res.json({ items });
}

async function getOne(req, res) {
  const application = await JobApplication.findById(req.params.id);
  if (!application) return res.status(404).json({ message: 'Application not found.' });
  res.json({ item: application });
}

async function updateStatus(req, res) {
  const { status, notes } = req.body;
  const application = await JobApplication.findById(req.params.id);
  if (!application) return res.status(404).json({ message: 'Application not found.' });

  if (status) {
    if (!JobApplication.schema.path('status').enumValues.includes(status)) {
      return res.status(400).json({ message: 'Invalid status.' });
    }
    application.status = status;
  }
  if (notes !== undefined) application.notes = notes;
  await application.save();

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'job_applications',
    recordId: application._id,
    detail: `Updated application from ${application.name} (status: ${application.status})`,
  });

  const { resumeUrl: _omit, ...rest } = application.toObject();
  res.json({ item: rest });
}

async function remove(req, res) {
  const application = await JobApplication.findByIdAndDelete(req.params.id);
  if (!application) return res.status(404).json({ message: 'Application not found.' });
  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'DELETE',
    entity: 'job_applications',
    recordId: application._id,
    detail: `Deleted application from ${application.name}`,
  });
  res.json({ message: 'Application deleted.' });
}

module.exports = { apply, submitReferral, list, getOne, updateStatus, remove };
