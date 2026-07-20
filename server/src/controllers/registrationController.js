const User = require('../models/User');
const Employee = require('../models/Employee');
const Department = require('../models/Department');
const writeAudit = require('../utils/audit');
const { sendMail, templates } = require('../services/emailService');
const { EMP_ID_REGEX, nextEmpId } = require('../utils/empId');

async function list(req, res) {
  const { status = 'pending' } = req.query;
  const filter = status === 'all' ? {} : { approvalStatus: status };
  const items = await User.find(filter).sort({ createdAt: -1 }).select('-passwordHash -totpSecret -passwordResetToken');
  res.json({ items });
}

async function approve(req, res) {
  const { desig, location, managerRef } = req.body;
  if (!desig) return res.status(400).json({ message: 'Designation is required to approve this registration.' });

  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'Registration not found.' });
  if (user.approvalStatus !== 'pending') return res.status(409).json({ message: 'This registration has already been reviewed.' });

  const dept = await Department.findOne({ name: new RegExp(`^${user.department}$`, 'i') });
  if (!dept) return res.status(400).json({ message: `Unknown department: ${user.department}` });

  const empId = EMP_ID_REGEX.test(user.empId) ? user.empId : await nextEmpId(Employee);

  const employee = await Employee.create({
    empId,
    name: user.name,
    dept: dept.name,
    deptRef: dept._id,
    desig,
    joined: user.joined,
    dob: user.dob,
    email: user.email,
    phone: user.phone,
    location: location || '',
    status: 'active',
    managerRef: managerRef || null,
    userRef: user._id,
    avatarIndex: Math.floor(Math.random() * 10),
  });

  user.approvalStatus = 'approved';
  user.isActive = true;
  user.employeeRef = employee._id;
  await user.save();

  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'users', recordId: user._id, detail: `Approved registration for ${user.name}, created employee ${employee.empId}` });

  const { subject, html } = templates.registrationApproved(user.name);
  await sendMail({ to: user.email, subject, html });

  res.json({ user: user.toSafeJSON(), employee });
}

async function reject(req, res) {
  const { reason } = req.body;

  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'Registration not found.' });
  if (user.approvalStatus !== 'pending') return res.status(409).json({ message: 'This registration has already been reviewed.' });

  user.approvalStatus = 'rejected';
  user.rejectionReason = reason || '';
  user.isActive = false;
  await user.save();

  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'users', recordId: user._id, detail: `Rejected registration for ${user.name}${reason ? `: ${reason}` : ''}` });

  const { subject, html } = templates.registrationRejected(user.name, reason);
  await sendMail({ to: user.email, subject, html });

  res.json({ user: user.toSafeJSON() });
}

module.exports = { list, approve, reject };
