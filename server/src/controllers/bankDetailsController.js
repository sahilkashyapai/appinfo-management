const { prisma, shape, shapeMany, sel, andWhere } = require('../db');
const writeAudit = require('../utils/audit');
const { createNotification, createNotifications } = require('../services/notify');
const { scopeEmployeeLocationFilter, isOutsideScope } = require('../utils/officeScope');
const { cleanBankDetails, hasAny, toBankDetails } = require('../utils/bankDetails');
const { findBankDetails, saveBankDetails } = require('../services/bankDetails');

// An employee's PAN and salary account.
//  - The employee can save them once (sign-up or profile); after that they're
//    locked for the employee, who must ask HR to change them.
//  - HR can fill or edit them only while the employee hasn't saved them
//    (Payroll > Salary Structures), and decides change requests.
// Audit entries never include the numbers.

function viewOf(row, pending) {
  return {
    bankDetails: toBankDetails(row),
    locked: !!row?.lockedAt,
    lockedAt: row?.lockedAt || null,
    updatedAt: row?.updatedAt || null,
    pendingRequest: pending ? shape('BankDetailRequest', pending) : null,
  };
}

async function hrRecipients(location) {
  const users = await prisma.user.findMany({
    where: { role: { in: ['admin', 'superadmin'] }, isActive: true, OR: [{ managedLocation: '' }, { managedLocation: location || '' }] },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

// ─── Employee (own details) ─────────────────────────────────────────────────

async function mine(req, res) {
  const userId = String(req.user._id);
  const [row, pending, lastDecided] = await Promise.all([
    findBankDetails({ userId, employeeId: req.user.employeeRef }),
    prisma.bankDetailRequest.findFirst({ where: { userId, status: 'pending' }, orderBy: { createdAt: 'desc' } }),
    prisma.bankDetailRequest.findFirst({ where: { userId, status: { not: 'pending' } }, orderBy: { decidedAt: 'desc' } }),
  ]);
  res.json({ ...viewOf(row, pending), lastDecision: lastDecided ? shape('BankDetailRequest', lastDecided) : null });
}

// First save by the employee; locks the details for them.
async function saveMine(req, res) {
  const userId = String(req.user._id);
  const existing = await findBankDetails({ userId, employeeId: req.user.employeeRef });
  if (existing?.lockedAt) {
    return res.status(409).json({ message: 'Your bank and PAN details are locked. Send a change request to HR instead.' });
  }
  const data = cleanBankDetails(req.body);
  if (!hasAny(data)) return res.status(400).json({ message: 'Enter at least your PAN or bank account details.' });
  const row = await saveBankDetails({ userId, employeeId: req.user.employeeRef, data: { ...data, lockedAt: new Date(), updatedById: userId } });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'profile', recordId: userId, detail: 'Saved own bank and PAN details (now locked)' });
  res.json(viewOf(row, null));
}

// Ask HR to change locked details. Body: new values + reason.
async function requestChange(req, res) {
  const userId = String(req.user._id);
  const existing = await findBankDetails({ userId, employeeId: req.user.employeeRef });
  if (!existing?.lockedAt) return res.status(400).json({ message: 'Your details are not locked yet, so you can update them directly.' });
  const pending = await prisma.bankDetailRequest.findFirst({ where: { userId, status: 'pending' }, select: { id: true } });
  if (pending) return res.status(409).json({ message: 'You already have a change request waiting for HR.' });

  const data = cleanBankDetails(req.body);
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 5) return res.status(400).json({ message: 'Tell HR why the details need to change.' });
  const proposed = { ...toBankDetails(existing), ...data };
  const current = toBankDetails(existing);
  if (Object.keys(proposed).every((k) => proposed[k] === current[k])) {
    return res.status(400).json({ message: 'The new details are the same as your current ones.' });
  }

  const request = await prisma.bankDetailRequest.create({
    data: { ...proposed, reason: reason.slice(0, 1000), userId, employeeId: req.user.employeeRef ? String(req.user.employeeRef) : null },
  });
  const emp = req.user.employeeRef ? await prisma.employee.findUnique({ where: { id: String(req.user.employeeRef) }, select: { location: true } }) : null;
  await createNotifications(await hrRecipients(emp?.location), {
    icon: 'fa-solid fa-building-columns',
    type: 'payroll',
    title: `Bank details change request from ${req.user.name}`,
    body: `${req.user.name} asked to change their bank/PAN details.`,
    link: '/payroll?tab=bank',
  });
  await writeAudit({ ip: req.ip, user: req.user, action: 'CREATE', entity: 'profile', recordId: request.id, detail: 'Requested a bank/PAN details change' });
  res.status(201).json(viewOf(existing, request));
}

// ─── HR ─────────────────────────────────────────────────────────────────────

const REQUEST_INCLUDE = {
  user: { select: sel('User', 'name email') },
  employeeRef: { select: sel('Employee', 'name empId dept location avatarIndex') },
  decidedByRef: { select: sel('User', 'name') },
};

async function listRequests(req, res) {
  const where = {};
  if (req.query.status) {
    if (!['pending', 'approved', 'rejected'].includes(req.query.status)) return res.json({ items: [] });
    where.status = req.query.status;
  }
  const empWhere = {};
  await scopeEmployeeLocationFilter(empWhere, req.user);
  if (Object.keys(empWhere).length) andWhere(where, { employeeRef: empWhere });
  const rows = await prisma.bankDetailRequest.findMany({ where, include: REQUEST_INCLUDE, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] });
  // Attach the current values so HR can compare.
  const items = await Promise.all(
    rows.map(async (r) => ({
      ...shape('BankDetailRequest', r),
      current: toBankDetails(await findBankDetails({ userId: r.userId, employeeId: r.employeeId })),
    }))
  );
  res.json({ items });
}

// Body: { status: 'approved' | 'rejected', note }
async function decide(req, res) {
  const request = await prisma.bankDetailRequest.findUnique({ where: { id: String(req.params.id) }, include: { employeeRef: { select: { location: true } } } });
  if (!request || (request.employeeRef && (await isOutsideScope(req.user, request.employeeRef.location)))) {
    return res.status(404).json({ message: 'Request not found.' });
  }
  if (request.status !== 'pending') return res.status(409).json({ message: 'This request has already been decided.' });
  const status = req.body?.status;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ message: "status must be 'approved' or 'rejected'." });
  const note = String(req.body?.note || '').trim().slice(0, 1000);
  if (status === 'rejected' && !note) return res.status(400).json({ message: 'Tell the employee why the request was rejected.' });

  const updated = await prisma.$transaction(async (tx) => {
    if (status === 'approved') {
      const data = toBankDetails(request);
      await saveBankDetails({ userId: request.userId, employeeId: request.employeeId, data: { ...data, updatedById: String(req.user._id) }, db: tx });
    }
    return tx.bankDetailRequest.update({
      where: { id: request.id },
      data: { status, decisionNote: note || null, decidedById: String(req.user._id), decidedAt: new Date() },
      include: REQUEST_INCLUDE,
    });
  });

  await createNotification({
    recipientId: request.userId,
    icon: status === 'approved' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark',
    type: 'payroll',
    title: status === 'approved' ? 'Bank details updated' : 'Bank details change rejected',
    body: status === 'approved' ? 'HR approved your request; your new bank/PAN details are now on file.' : `HR rejected your request: ${note.slice(0, 140)}`,
    link: '/profile',
  });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'payroll', recordId: request.id, detail: `${status === 'approved' ? 'Approved' : 'Rejected'} a bank/PAN details change request` });
  res.json({ item: shape('BankDetailRequest', updated) });
}

module.exports = { mine, saveMine, requestChange, listRequests, decide };
