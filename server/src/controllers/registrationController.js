const { prisma, shape, shapeMany } = require('../db');
const { toSafeUser } = require('../db/users');
const writeAudit = require('../utils/audit');
const { sendMail, templates } = require('../services/emailService');
const { EMP_ID_REGEX, nextEmpId } = require('../utils/empId');
const { excludeSuperadminUsers } = require('../utils/hideSuperadmin');

const APPROVAL_STATUSES = ['approved', 'pending', 'rejected'];

// Everything except credentials/secrets — the old `-passwordHash -totpSecret -passwordResetToken` projection.
function stripSecrets(user) {
  const { passwordHash, totpSecret, passwordResetToken, passwordResetExpires, ...rest } = user;
  return rest;
}

async function list(req, res) {
  const { status = 'pending' } = req.query;
  // approvalStatus is a MySQL enum: an unknown value would make Prisma throw,
  // where Mongo just matched nothing.
  if (status !== 'all' && !APPROVAL_STATUSES.includes(status)) return res.json({ items: [] });
  const where = status === 'all' ? {} : { approvalStatus: status };
  await excludeSuperadminUsers(where, req.user.role, 'id');
  const rows = await prisma.user.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json({ items: shapeMany('User', rows).map(stripSecrets) });
}

async function approve(req, res) {
  const { desig, location, managerRef } = req.body;
  if (!desig) return res.status(400).json({ message: 'Designation is required to approve this registration.' });

  const user = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
  if (!user) return res.status(404).json({ message: 'Registration not found.' });
  if (user.approvalStatus !== 'pending') return res.status(409).json({ message: 'This registration has already been reviewed.' });

  const dept = await prisma.department.findFirst({ where: { name: { equals: user.department } } });
  if (!dept) return res.status(400).json({ message: `Unknown department: ${user.department}` });

  const empId = EMP_ID_REGEX.test(user.empId) ? user.empId : await nextEmpId();

  // Create the Employee and link it both ways (employees.userId <-> users.employeeId) atomically.
  const [employee, updated] = await prisma.$transaction(async (tx) => {
    const emp = await tx.employee.create({
      data: {
        empId,
        name: user.name,
        dept: dept.name,
        deptId: dept.id,
        desig,
        joined: user.joined,
        dob: user.dob,
        email: user.email,
        phone: user.phone,
        location: location || '',
        status: 'active',
        managerId: managerRef ? String(managerRef) : null,
        userId: user.id,
        avatarIndex: Math.floor(Math.random() * 10),
      },
    });
    const u = await tx.user.update({
      where: { id: user.id },
      data: { approvalStatus: 'approved', isActive: true, employeeId: emp.id },
    });
    // Bank/PAN details given at sign-up now belong to the new employee record too.
    await tx.bankDetails.updateMany({ where: { userId: user.id, employeeId: null }, data: { employeeId: emp.id } });
    return [emp, u];
  });

  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'users', recordId: updated.id, detail: `Approved registration for ${updated.name}, created employee ${employee.empId}` });

  const { subject, html } = templates.registrationApproved(updated.name);
  await sendMail({ to: updated.email, subject, html });

  res.json({ user: toSafeUser(shape('User', updated)), employee: shape('Employee', employee) });
}

async function reject(req, res) {
  const { reason } = req.body;

  const user = await prisma.user.findUnique({ where: { id: String(req.params.id) }, select: { id: true, approvalStatus: true } });
  if (!user) return res.status(404).json({ message: 'Registration not found.' });
  if (user.approvalStatus !== 'pending') return res.status(409).json({ message: 'This registration has already been reviewed.' });

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { approvalStatus: 'rejected', rejectionReason: reason || '', isActive: false },
  });

  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'users', recordId: updated.id, detail: `Rejected registration for ${updated.name}${reason ? `: ${reason}` : ''}` });

  const { subject, html } = templates.registrationRejected(updated.name, reason);
  await sendMail({ to: updated.email, subject, html });

  res.json({ user: toSafeUser(shape('User', updated)) });
}

module.exports = { list, approve, reject };
