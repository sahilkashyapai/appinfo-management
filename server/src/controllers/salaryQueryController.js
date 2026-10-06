const { prisma, shape, shapeMany, sel, andWhere } = require('../db');
const writeAudit = require('../utils/audit');
const { createNotification, createNotifications } = require('../services/notify');
const { scopeEmployeeLocationFilter, isOutsideScope } = require('../utils/officeScope');
const { parsePeriod } = require('../services/payroll');

// Salary queries: an employee questions a published salary slip (usually a
// deduction); HR in that office answers and resolves or rejects it. HR is
// notified when a query is raised, the employee when it's answered.

const SLIP_SUMMARY = {
  select: {
    id: true, period: true, currency: true, status: true, daysInMonth: true, paidDays: true, lopDays: true, paidLeaveDays: true,
    grossEarnings: true, totalDeductions: true, netPay: true, earnings: true, deductions: true, documentId: true,
  },
};
const QUERY_INCLUDE = {
  slip: SLIP_SUMMARY,
  employeeRef: { select: sel('Employee', 'name empId dept desig location avatarIndex') },
  respondedByRef: { select: sel('User', 'name') },
};

function periodLabel(period) {
  return parsePeriod(period)?.label || period;
}

// HR users who look after an employee's office: unscoped admins/superadmins,
// plus those managing that office.
async function hrRecipients(location) {
  const users = await prisma.user.findMany({
    where: { role: { in: ['admin', 'superadmin'] }, isActive: true, OR: [{ managedLocation: '' }, { managedLocation: location || '' }] },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

// ─── Employee ───────────────────────────────────────────────────────────────

async function mine(req, res) {
  if (!req.user.employeeRef) return res.json({ items: [] });
  const items = await prisma.salaryQuery.findMany({
    where: { employeeId: String(req.user.employeeRef) },
    include: { slip: SLIP_SUMMARY, respondedByRef: { select: sel('User', 'name') } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items: shapeMany('SalaryQuery', items) });
}

// Body: { documentId | slipId, message }. Only the employee's own published slip.
async function create(req, res) {
  if (!req.user.employeeRef) return res.status(400).json({ message: 'No employee record linked to this account.' });
  const message = String(req.body?.message || '').trim();
  if (message.length < 5) return res.status(400).json({ message: 'Please describe your query (at least a few words).' });
  if (message.length > 2000) return res.status(400).json({ message: 'Please keep the query under 2000 characters.' });

  const where = { employeeId: String(req.user.employeeRef), status: 'published' };
  if (req.body?.slipId) where.id = String(req.body.slipId);
  else if (req.body?.documentId) where.documentId = String(req.body.documentId);
  else return res.status(400).json({ message: 'Choose the salary slip your query is about.' });

  const slip = await prisma.salarySlip.findFirst({ where, include: { employeeRef: { select: { name: true, location: true } } } });
  if (!slip) return res.status(404).json({ message: 'Salary slip not found.' });

  const open = await prisma.salaryQuery.findFirst({ where: { slipId: slip.id, status: 'open' }, select: { id: true } });
  if (open) return res.status(409).json({ message: 'You already have an open query for this slip. HR will reply to it soon.' });

  const query = await prisma.salaryQuery.create({
    data: { slipId: slip.id, employeeId: slip.employeeId, raisedById: String(req.user._id), message },
    include: QUERY_INCLUDE,
  });
  const label = periodLabel(slip.period);
  await createNotifications(await hrRecipients(slip.employeeRef.location), {
    icon: 'fa-solid fa-circle-question',
    type: 'payroll',
    title: `Salary query from ${slip.employeeRef.name}`,
    body: `${slip.employeeRef.name} raised a query about their ${label} salary slip.`,
    link: '/payroll?tab=queries',
  });
  await writeAudit({ ip: req.ip, user: req.user, action: 'CREATE', entity: 'payroll', recordId: query.id, detail: `Raised a salary query for ${label}` });
  res.status(201).json({ item: shape('SalaryQuery', query) });
}

// ─── HR ─────────────────────────────────────────────────────────────────────

async function list(req, res) {
  const where = {};
  if (req.query.status) {
    if (!['open', 'resolved', 'rejected'].includes(req.query.status)) return res.json({ items: [] });
    where.status = req.query.status;
  }
  const empWhere = {};
  await scopeEmployeeLocationFilter(empWhere, req.user);
  if (Object.keys(empWhere).length) andWhere(where, { employeeRef: empWhere });
  const items = await prisma.salaryQuery.findMany({ where, include: QUERY_INCLUDE, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] });
  res.json({ items: shapeMany('SalaryQuery', items) });
}

// Body: { status: 'resolved' | 'rejected', response }
async function respond(req, res) {
  const query = await prisma.salaryQuery.findUnique({ where: { id: String(req.params.id) }, include: { employeeRef: { select: { name: true, location: true } }, slip: { select: { period: true } } } });
  if (!query || (await isOutsideScope(req.user, query.employeeRef.location))) return res.status(404).json({ message: 'Query not found.' });
  const status = req.body?.status;
  if (!['resolved', 'rejected'].includes(status)) return res.status(400).json({ message: "status must be 'resolved' or 'rejected'." });
  const response = String(req.body?.response || '').trim();
  if (!response) return res.status(400).json({ message: 'Write a reply for the employee.' });
  if (response.length > 2000) return res.status(400).json({ message: 'Please keep the reply under 2000 characters.' });

  const updated = await prisma.salaryQuery.update({
    where: { id: query.id },
    data: { status, response, respondedById: String(req.user._id), respondedAt: new Date() },
    include: QUERY_INCLUDE,
  });
  const label = periodLabel(query.slip.period);
  if (query.raisedById) {
    await createNotification({
      recipientId: query.raisedById,
      icon: status === 'resolved' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark',
      type: 'payroll',
      title: `Salary query ${status === 'resolved' ? 'resolved' : 'answered'}`,
      body: `HR replied to your query about the ${label} salary slip: ${response.slice(0, 140)}${response.length > 140 ? '…' : ''}`,
      link: '/documents',
    });
  }
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'payroll', recordId: query.id, detail: `Marked ${query.employeeRef.name}'s ${label} salary query as ${status}` });
  res.json({ item: shape('SalaryQuery', updated) });
}

module.exports = { mine, create, list, respond };
