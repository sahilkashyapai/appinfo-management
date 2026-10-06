const PDFDocument = require('pdfkit');
const { prisma, shape, shapeMany, sel, andWhere } = require('../db');
const { createNotification } = require('../services/notify');
const writeAudit = require('../utils/audit');
const { sendPushToUsers } = require('../services/pushService');
const { ADMIN_ROLES, APPROVER_ROLES } = require('../utils/roles');
const { excludeAdminAttendanceForEmployee, excludeSuperadminAttendance, superadminEmployeeIds } = require('../utils/hideSuperadmin');
const { resolveScopeLocation, isOutsideScope, scopeEmployeeLocationFilter, scopeByEmployeeRef, scopedEmployeeIds } = require('../utils/officeScope');
const { countWorkingDays } = require('../utils/workingDays');
const { startOfDayUTC: startOfDay } = require('../utils/attendanceDate');

const STATUSES = ['office', 'wfh', 'leave', 'absent'];
const REQUEST_STATUSES = ['pending', 'approved', 'rejected'];
const STATUS_LABEL_FULL = { office: 'Office', wfh: 'WFH', leave: 'On Leave', absent: 'Absent', not_marked: 'Not Marked' };

// The employee fields a populated attendance row carries.
const EMPLOYEE_CARD = 'name dept avatarIndex';

function monthRange(month) {
  // month is 'YYYY-MM'
  const [y, m] = month.split('-').map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 0, 23, 59, 59, 999);
  return { from, to };
}

async function resolveOwnEmployeeId(req) {
  const emp = await prisma.employee.findFirst({ where: { userId: String(req.user._id) }, select: { id: true } });
  return emp?.id || null;
}

async function notifyAttendanceEvent({ recipientIds, icon, title, body, link = '/attendance' }) {
  const ids = recipientIds.filter(Boolean).map(String);
  if (!ids.length) return;
  try {
    await Promise.all(ids.map((id) => createNotification({ recipientId: id, icon, type: 'attendance', title, body, link })));
  } catch (err) {
    console.error('[attendance] failed to create notification:', err.message);
  }
  sendPushToUsers(ids, { title, body, url: link }).catch((err) => console.error('[attendance] push failed:', err.message));
}

// One row per employee per day (unique employeeId+date): create it, or
// overwrite status/note/markedBy on the existing row.
function upsertAttendance({ employeeId, date, status, note, markedById }, include) {
  return prisma.attendance.upsert({
    where: { employeeId_date: { employeeId, date } },
    create: { employeeId, date, status, note, markedById },
    update: { status, note, markedById },
    ...(include ? { include } : {}),
  });
}

// A correction request with the employee fields approve/reject need (the old
// `.populate('employeeRef', 'name userRef location')`).
const CORRECTION_EMPLOYEE = { employeeRef: { select: sel('Employee', 'name userRef location') } };

function loadCorrectionRequest(id) {
  return prisma.attendanceCorrectionRequest.findUnique({ where: { id: String(id) }, include: CORRECTION_EMPLOYEE });
}

function decideCorrectionRequest(id, data) {
  return prisma.attendanceCorrectionRequest.update({ where: { id }, data, include: CORRECTION_EMPLOYEE });
}

// Self-only monthly snapshot for the dashboard — always the caller's own record,
// regardless of role (an admin viewing their own dashboard still wants "my" attendance).
async function mySummary(req, res) {
  const ownId = await resolveOwnEmployeeId(req);
  if (!ownId) return res.json({ hasRecord: false });

  const month = req.query.month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const { from, to } = monthRange(month);
  const daysInMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
  const [y, m] = month.split('-').map(Number);

  const records = await prisma.attendance.findMany({
    where: { employeeId: ownId, date: { gte: from, lte: to } },
    select: { id: true, status: true, date: true },
    orderBy: { date: 'desc' },
  });
  const counts = { office: 0, wfh: 0, leave: 0, absent: 0 };
  records.forEach((r) => { counts[r.status] += 1; });
  const daysElapsed = to < new Date() ? daysInMonth : Math.min(new Date().getDate(), daysInMonth);
  const workingDaysElapsed = await countWorkingDays(y, m, daysElapsed);
  const notMarked = Math.max(workingDaysElapsed - records.length, 0);

  res.json({ hasRecord: true, month, ...counts, notMarked, today: records.find((r) => startOfDay(r.date).getTime() === startOfDay(new Date()).getTime())?.status || null });
}

async function list(req, res) {
  const { employeeId, from, to, month } = req.query;
  const isAdmin = ADMIN_ROLES.includes(req.user.role);

  const filter = {};

  if (isAdmin) {
    if (employeeId) filter.employeeId = String(employeeId);
    await excludeSuperadminAttendance(filter);
    await scopeByEmployeeRef(filter, req.user);
  } else {
    const ownId = await resolveOwnEmployeeId(req);
    if (!ownId) return res.json({ items: [] });
    filter.employeeId = ownId;
  }

  if (month) {
    const { from: f, to: t } = monthRange(month);
    filter.date = { gte: f, lte: t };
  } else if (from || to) {
    filter.date = {};
    if (from) filter.date.gte = startOfDay(from);
    if (to) filter.date.lte = startOfDay(to);
  }

  const items = await prisma.attendance.findMany({
    where: filter,
    orderBy: { date: 'desc' },
    include: {
      employeeRef: { select: sel('Employee', EMPLOYEE_CARD) },
      markedBy: { select: sel('User', 'name') },
    },
  });

  res.json({ items: shapeMany('Attendance', items) });
}

async function today(req, res) {
  const filter = { date: startOfDay(new Date()) };
  await excludeSuperadminAttendance(filter);
  await scopeByEmployeeRef(filter, req.user);
  await excludeAdminAttendanceForEmployee(filter, req.user.role);
  const items = await prisma.attendance.findMany({ where: filter, select: { employeeId: true, status: true } });
  const byEmployee = Object.fromEntries(items.map((a) => [String(a.employeeId), a.status]));
  // Superadmins are exempt from attendance tracking entirely — the client uses
  // this to show "N/A" instead of "Not marked", without needing to know the
  // viewer-restricted login-access role.
  const exemptIds = (await superadminEmployeeIds()).map(String);
  res.json({ date: startOfDay(new Date()), statuses: byEmployee, exemptIds });
}

// Full employee list behind a single today's-attendance stat (dashboard drill-down).
async function todayByStatus(req, res) {
  const { status } = req.query;
  if (![...STATUSES, 'not_marked'].includes(status)) {
    return res.status(400).json({ message: `status must be one of ${STATUSES.join(', ')}, not_marked.` });
  }

  const employeeFilter = { status: 'active' };
  await excludeSuperadminAttendance(employeeFilter, 'id');
  await excludeAdminAttendanceForEmployee(employeeFilter, req.user.role, 'id');
  await scopeEmployeeLocationFilter(employeeFilter, req.user);

  if (status === 'not_marked') {
    const marked = await prisma.attendance.findMany({ where: { date: startOfDay(new Date()) }, select: { employeeId: true } });
    andWhere(employeeFilter, { id: { notIn: marked.map((a) => a.employeeId) } });
    const items = await prisma.employee.findMany({ where: employeeFilter, select: sel('Employee', EMPLOYEE_CARD), orderBy: { name: 'asc' } });
    return res.json({ items: shapeMany('Employee', items) });
  }

  const attendanceFilter = { date: startOfDay(new Date()), status };
  await excludeSuperadminAttendance(attendanceFilter);
  await scopeByEmployeeRef(attendanceFilter, req.user);
  await excludeAdminAttendanceForEmployee(attendanceFilter, req.user.role);
  const records = await prisma.attendance.findMany({
    where: attendanceFilter,
    include: { employeeRef: { select: sel('Employee', `${EMPLOYEE_CARD} status`) } },
  });
  const items = records
    .filter((r) => r.employeeRef && r.employeeRef.status === 'active')
    .map((r) => ({ _id: r.employeeRef.id, name: r.employeeRef.name, dept: r.employeeRef.dept, avatarIndex: r.employeeRef.avatarIndex }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json({ items });
}

// All four today's-attendance groups (plus not-marked) in one call — powers the
// dashboard's "View all" breakdown, grouped separately rather than one flat list.
async function todayBreakdown(req, res) {
  const employeeFilter = { status: 'active' };
  await excludeSuperadminAttendance(employeeFilter, 'id');
  await excludeAdminAttendanceForEmployee(employeeFilter, req.user.role, 'id');
  await scopeEmployeeLocationFilter(employeeFilter, req.user);
  const activeEmployees = await prisma.employee.findMany({ where: employeeFilter, select: sel('Employee', EMPLOYEE_CARD) });

  const attendanceFilter = { date: startOfDay(new Date()) };
  await excludeSuperadminAttendance(attendanceFilter);
  await scopeByEmployeeRef(attendanceFilter, req.user);
  await excludeAdminAttendanceForEmployee(attendanceFilter, req.user.role);
  const records = await prisma.attendance.findMany({
    where: attendanceFilter,
    include: { employeeRef: { select: sel('Employee', `${EMPLOYEE_CARD} status`) } },
  });

  const groups = { office: [], wfh: [], leave: [], absent: [] };
  const markedIds = new Set();
  records.forEach((r) => {
    if (!r.employeeRef || r.employeeRef.status !== 'active') return;
    markedIds.add(String(r.employeeRef.id));
    groups[r.status].push({ _id: r.employeeRef.id, name: r.employeeRef.name, dept: r.employeeRef.dept, avatarIndex: r.employeeRef.avatarIndex });
  });
  const notMarked = activeEmployees
    .filter((e) => !markedIds.has(String(e.id)))
    .map((e) => ({ _id: e.id, name: e.name, dept: e.dept, avatarIndex: e.avatarIndex }));

  Object.values(groups).forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
  notMarked.sort((a, b) => a.name.localeCompare(b.name));

  res.json({ ...groups, notMarked });
}

async function upsert(req, res) {
  const { employeeRef, date, status, note } = req.body;
  if (!employeeRef || !date || !STATUSES.includes(status)) {
    return res.status(400).json({ message: `employeeRef, date and a status (${STATUSES.join(', ')}) are required.` });
  }

  const employee = await prisma.employee.findUnique({ where: { id: String(employeeRef) }, select: { id: true, name: true, location: true } });
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });
  if (await isOutsideScope(req.user, employee.location)) {
    return res.status(404).json({ message: 'Employee not found.' });
  }

  const day = startOfDay(date);
  const record = await upsertAttendance(
    { employeeId: employee.id, date: day, status, note: note || '', markedById: String(req.user._id) },
    { employeeRef: { select: sel('Employee', EMPLOYEE_CARD) } }
  );

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'attendance',
    recordId: record.id,
    detail: `Marked ${employee.name} as ${status} on ${day.toDateString()}`,
  });

  res.json({ record: shape('Attendance', record) });
}

async function bulkUpsert(req, res) {
  const { date, entries } = req.body;
  if (!date || !Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ message: 'date and a non-empty entries array are required.' });
  }
  const day = startOfDay(date);

  const scopedIds = await scopedEmployeeIds(req.user);
  const allowed = scopedIds ? new Set(scopedIds.map(String)) : null;

  // MySQL enforces the employee foreign key (Mongo didn't), so an entry for an
  // employee that doesn't exist is skipped like any other invalid entry
  // instead of failing the whole batch halfway through.
  const requestedIds = [...new Set(entries.map((e) => e?.employeeRef).filter(Boolean).map(String))];
  const existing = await prisma.employee.findMany({ where: { id: { in: requestedIds } }, select: { id: true } });
  const existingIds = new Set(existing.map((e) => e.id));

  const results = [];
  for (const { employeeRef, status, note } of entries) {
    if (!employeeRef || !STATUSES.includes(status)) continue;
    if (allowed && !allowed.has(String(employeeRef))) continue;
    if (!existingIds.has(String(employeeRef))) continue;
    const record = await upsertAttendance({ employeeId: String(employeeRef), date: day, status, note: note || '', markedById: String(req.user._id) });
    results.push(record);
  }

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'attendance',
    recordId: day.toISOString(),
    detail: `Bulk-marked attendance for ${results.length} employee(s) on ${day.toDateString()}`,
  });

  res.json({ count: results.length });
}

const STATUS_LABEL = { office: 'Office', wfh: 'WFH', leave: 'On Leave', absent: 'Absent' };

async function exportPdf(req, res) {
  const { employeeId, month } = req.query;
  if (!month) return res.status(400).json({ message: 'month (YYYY-MM) is required.' });
  const { from, to } = monthRange(month);
  const monthLabel = from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const doc = new PDFDocument({ margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-${month}${employeeId ? '' : '-all'}.pdf"`);
  doc.pipe(res);

  if (employeeId) {
    const employeeFilter = { id: String(employeeId) };
    await excludeSuperadminAttendance(employeeFilter, 'id');
    await scopeEmployeeLocationFilter(employeeFilter, req.user);
    const employee = await prisma.employee.findFirst({ where: employeeFilter, select: sel('Employee', 'name empId dept desig') });
    if (!employee) {
      doc.text('Employee not found.');
      doc.end();
      return;
    }
    const records = await prisma.attendance.findMany({
      where: { employeeId: String(employeeId), date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });

    doc.fontSize(16).text('Attendance Report', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(11).text(`${employee.name} (${employee.empId}) — ${employee.desig}, ${employee.dept}`, { align: 'center' });
    doc.fontSize(10).fillColor('#666').text(monthLabel, { align: 'center' });
    doc.fillColor('#000').moveDown(1);

    const counts = { office: 0, wfh: 0, leave: 0, absent: 0 };
    records.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    const notMarked = Math.max(to.getDate() - records.length, 0);

    doc.fontSize(11).text(
      `Office: ${counts.office}   WFH: ${counts.wfh}   Leave: ${counts.leave}   Absent: ${counts.absent}   Not marked: ${notMarked}`
    );
    doc.moveDown(0.8);

    doc.fontSize(10);
    records.forEach((r) => {
      doc.text(`${r.date.toISOString().slice(0, 10)}     ${STATUS_LABEL[r.status]}`);
    });
    if (records.length === 0) doc.fontSize(10).fillColor('#666').text('No attendance records for this month.');
  } else {
    const employeesFilter = {};
    await excludeSuperadminAttendance(employeesFilter, 'id');
    await scopeEmployeeLocationFilter(employeesFilter, req.user);
    const employees = await prisma.employee.findMany({ where: employeesFilter, select: sel('Employee', 'name empId dept'), orderBy: { name: 'asc' } });
    const records = await prisma.attendance.findMany({ where: { date: { gte: from, lte: to } }, select: { employeeId: true, status: true } });

    const byEmployee = {};
    records.forEach((r) => {
      const id = String(r.employeeId);
      byEmployee[id] = byEmployee[id] || { office: 0, wfh: 0, leave: 0, absent: 0 };
      byEmployee[id][r.status] += 1;
    });

    doc.fontSize(16).text('Attendance Report — All Employees', { align: 'center' });
    doc.fontSize(10).fillColor('#666').text(monthLabel, { align: 'center' });
    doc.fillColor('#000').moveDown(1);

    doc.fontSize(9);
    employees.forEach((e) => {
      const c = byEmployee[String(e.id)] || { office: 0, wfh: 0, leave: 0, absent: 0 };
      doc.text(`${e.name} (${e.dept})  —  Office: ${c.office}   WFH: ${c.wfh}   Leave: ${c.leave}   Absent: ${c.absent}`);
    });
  }

  doc.end();
}

async function remove(req, res) {
  const id = String(req.params.id);
  const scopeLoc = await resolveScopeLocation(req.user);
  if (scopeLoc) {
    const existing = await prisma.attendance.findUnique({ where: { id }, select: { id: true, employeeRef: { select: { location: true } } } });
    if (!existing || existing.employeeRef?.location !== scopeLoc) {
      return res.status(404).json({ message: 'Attendance record not found.' });
    }
  }
  const { count } = await prisma.attendance.deleteMany({ where: { id } });
  if (!count) return res.status(404).json({ message: 'Attendance record not found.' });
  res.json({ message: 'Attendance record deleted.' });
}

// --- Attendance correction requests: an employee disputes a marked (or missing) day ---

async function createCorrectionRequest(req, res) {
  const { date, requestedStatus, reason } = req.body;
  if (!date || !STATUSES.includes(requestedStatus) || !reason || !reason.trim()) {
    return res.status(400).json({ message: `date, a requestedStatus (${STATUSES.join(', ')}) and a reason are required.` });
  }
  const ownId = await resolveOwnEmployeeId(req);
  if (!ownId) return res.status(400).json({ message: 'No employee record linked to this account.' });

  const day = startOfDay(date);
  if (day > startOfDay(new Date())) return res.status(400).json({ message: 'You cannot dispute a future date.' });

  const existingPending = await prisma.attendanceCorrectionRequest.findFirst({
    where: { employeeId: ownId, date: day, status: 'pending' },
    select: { id: true },
  });
  if (existingPending) return res.status(409).json({ message: 'You already have a pending correction request for this date.' });

  const existingRecord = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: ownId, date: day } },
    select: { status: true },
  });
  const currentStatus = existingRecord?.status || 'not_marked';
  if (currentStatus === requestedStatus) return res.status(400).json({ message: 'Requested status matches the current status.' });

  const employee = await prisma.employee.findUnique({ where: { id: ownId }, select: { name: true } });
  const request = await prisma.attendanceCorrectionRequest.create({
    data: { employeeId: ownId, date: day, currentStatus, requestedStatus, reason: reason.trim() },
  });

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'CREATE',
    entity: 'attendance_corrections',
    recordId: request.id,
    detail: `Requested attendance correction for ${day.toDateString()}: ${STATUS_LABEL_FULL[currentStatus]} → ${STATUS_LABEL_FULL[requestedStatus]}`,
  });

  const approvers = await prisma.user.findMany({ where: { role: { in: APPROVER_ROLES } }, select: { id: true } });
  notifyAttendanceEvent({
    recipientIds: approvers.map((u) => u.id),
    icon: 'fa-solid fa-calendar-days',
    title: 'Attendance correction requested',
    body: `${employee?.name || 'An employee'} disputed ${day.toDateString()}: ${STATUS_LABEL_FULL[currentStatus]} → ${STATUS_LABEL_FULL[requestedStatus]}.`,
    link: '/attendance?tab=corrections',
  });

  res.status(201).json({ item: shape('AttendanceCorrectionRequest', request) });
}

async function myCorrectionRequests(req, res) {
  const ownId = await resolveOwnEmployeeId(req);
  if (!ownId) return res.json({ items: [] });
  const items = await prisma.attendanceCorrectionRequest.findMany({ where: { employeeId: ownId }, orderBy: { date: 'desc' } });
  res.json({ items: shapeMany('AttendanceCorrectionRequest', items) });
}

async function listCorrectionRequests(req, res) {
  const { status } = req.query;
  const filter = {};
  // An unknown status simply matched nothing on Mongo; Prisma rejects an
  // invalid enum value outright, so turn it into an always-empty filter.
  if (status && status !== 'all') filter.status = REQUEST_STATUSES.includes(status) ? status : { in: [] };
  await excludeSuperadminAttendance(filter);
  await scopeByEmployeeRef(filter, req.user);
  const items = await prisma.attendanceCorrectionRequest.findMany({
    where: filter,
    include: { employeeRef: { select: sel('Employee', 'name avatarIndex dept') } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items: shapeMany('AttendanceCorrectionRequest', items) });
}

async function approveCorrectionRequest(req, res) {
  const request = await loadCorrectionRequest(req.params.id);
  if (!request) return res.status(404).json({ message: 'Correction request not found.' });
  if (await isOutsideScope(req.user, request.employeeRef?.location)) {
    return res.status(404).json({ message: 'Correction request not found.' });
  }
  if (request.status !== 'pending') return res.status(400).json({ message: 'This request has already been decided.' });

  await upsertAttendance({
    employeeId: request.employeeRef.id,
    date: request.date,
    status: request.requestedStatus,
    note: `Corrected via request ${request.id}`,
    markedById: String(req.user._id),
  });

  const updated = await decideCorrectionRequest(request.id, { status: 'approved', decidedById: String(req.user._id), decidedAt: new Date() });

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'attendance_corrections',
    recordId: request.id,
    detail: `Approved attendance correction for ${request.employeeRef.name} on ${request.date.toDateString()}: now ${STATUS_LABEL_FULL[request.requestedStatus]}`,
  });

  if (request.employeeRef.userId) {
    notifyAttendanceEvent({
      recipientIds: [request.employeeRef.userId],
      icon: 'fa-solid fa-circle-check',
      title: 'Attendance correction approved',
      body: `Your ${request.date.toDateString()} attendance was updated to ${STATUS_LABEL_FULL[request.requestedStatus]}.`,
    });
  }

  res.json({ item: shape('AttendanceCorrectionRequest', updated) });
}

async function rejectCorrectionRequest(req, res) {
  const { note } = req.body;
  const request = await loadCorrectionRequest(req.params.id);
  if (!request) return res.status(404).json({ message: 'Correction request not found.' });
  if (await isOutsideScope(req.user, request.employeeRef?.location)) {
    return res.status(404).json({ message: 'Correction request not found.' });
  }
  if (request.status !== 'pending') return res.status(400).json({ message: 'This request has already been decided.' });

  const updated = await decideCorrectionRequest(request.id, {
    status: 'rejected',
    decidedById: String(req.user._id),
    decisionNote: note || '',
    decidedAt: new Date(),
  });

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'attendance_corrections',
    recordId: request.id,
    detail: `Rejected attendance correction for ${request.employeeRef.name} on ${request.date.toDateString()}`,
  });

  if (request.employeeRef.userId) {
    notifyAttendanceEvent({
      recipientIds: [request.employeeRef.userId],
      icon: 'fa-solid fa-circle-xmark',
      title: 'Attendance correction rejected',
      body: `Your correction request for ${request.date.toDateString()} was rejected.${note ? ` Note: ${note}` : ''}`,
    });
  }

  res.json({ item: shape('AttendanceCorrectionRequest', updated) });
}

module.exports = {
  list,
  today,
  todayByStatus,
  todayBreakdown,
  upsert,
  bulkUpsert,
  remove,
  exportPdf,
  mySummary,
  createCorrectionRequest,
  myCorrectionRequests,
  listCorrectionRequests,
  approveCorrectionRequest,
  rejectCorrectionRequest,
};
