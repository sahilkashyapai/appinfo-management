const PDFDocument = require('pdfkit');
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const AttendanceCorrectionRequest = require('../models/AttendanceCorrectionRequest');
const User = require('../models/User');
const Notification = require('../models/Notification');
const writeAudit = require('../utils/audit');
const { sendPushToUsers } = require('../services/pushService');
const { APPROVER_ROLES } = require('../utils/roles');
const { excludeSuperadminEmployees, superadminUserIds } = require('../utils/hideSuperadmin');
const { countWorkingDays } = require('../utils/workingDays');
const { startOfDayUTC: startOfDay } = require('../utils/attendanceDate');

const STATUSES = ['office', 'wfh', 'leave', 'absent'];
const STATUS_LABEL_FULL = { office: 'Office', wfh: 'WFH', leave: 'On Leave', absent: 'Absent', not_marked: 'Not Marked' };

function monthRange(month) {
  // month is 'YYYY-MM'
  const [y, m] = month.split('-').map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 0, 23, 59, 59, 999);
  return { from, to };
}

async function resolveOwnEmployeeId(req) {
  const emp = await Employee.findOne({ userRef: req.user._id }, '_id');
  return emp?._id || null;
}

async function notifyAttendanceEvent({ recipientIds, icon, title, body, link = '/attendance' }) {
  const ids = recipientIds.filter(Boolean).map(String);
  if (!ids.length) return;
  try {
    await Promise.all(ids.map((id) => Notification.create({ recipientRef: id, icon, type: 'attendance', title, body, link })));
  } catch (err) {
    console.error('[attendance] failed to create notification:', err.message);
  }
  sendPushToUsers(ids, { title, body, url: link }).catch((err) => console.error('[attendance] push failed:', err.message));
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

  const records = await Attendance.find({ employeeRef: ownId, date: { $gte: from, $lte: to } }, 'status date').sort({ date: -1 });
  const counts = { office: 0, wfh: 0, leave: 0, absent: 0 };
  records.forEach((r) => { counts[r.status] += 1; });
  const daysElapsed = to < new Date() ? daysInMonth : Math.min(new Date().getDate(), daysInMonth);
  const workingDaysElapsed = await countWorkingDays(y, m, daysElapsed);
  const notMarked = Math.max(workingDaysElapsed - records.length, 0);

  res.json({ hasRecord: true, month, ...counts, notMarked, today: records.find((r) => startOfDay(r.date).getTime() === startOfDay(new Date()).getTime())?.status || null });
}

async function list(req, res) {
  const { employeeId, from, to, month } = req.query;
  const isAdmin = ['superadmin', 'hr', 'manager'].includes(req.user.role);

  const filter = {};

  if (isAdmin) {
    if (employeeId) filter.employeeRef = employeeId;
    await excludeSuperadminEmployees(filter, req.user.role);
  } else {
    const ownId = await resolveOwnEmployeeId(req);
    if (!ownId) return res.json({ items: [] });
    filter.employeeRef = ownId;
  }

  if (month) {
    const { from: f, to: t } = monthRange(month);
    filter.date = { $gte: f, $lte: t };
  } else if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = startOfDay(from);
    if (to) filter.date.$lte = startOfDay(to);
  }

  const items = await Attendance.find(filter)
    .sort({ date: -1 })
    .populate('employeeRef', 'name dept avatarIndex')
    .populate('markedBy', 'name');

  let shaped = items;
  if (req.user.role !== 'superadmin') {
    const saIds = new Set((await superadminUserIds()).map(String));
    shaped = items.map((it) => {
      if (it.markedBy && saIds.has(String(it.markedBy._id))) {
        const obj = it.toObject();
        obj.markedBy = { ...obj.markedBy, name: 'Admin' };
        return obj;
      }
      return it;
    });
  }

  res.json({ items: shaped });
}

async function today(req, res) {
  const filter = { date: startOfDay(new Date()) };
  await excludeSuperadminEmployees(filter, req.user.role);
  const items = await Attendance.find(filter, 'employeeRef status');
  const byEmployee = Object.fromEntries(items.map((a) => [String(a.employeeRef), a.status]));
  res.json({ date: startOfDay(new Date()), statuses: byEmployee });
}

// Full employee list behind a single today's-attendance stat (dashboard drill-down).
async function todayByStatus(req, res) {
  const { status } = req.query;
  if (![...STATUSES, 'not_marked'].includes(status)) {
    return res.status(400).json({ message: `status must be one of ${STATUSES.join(', ')}, not_marked.` });
  }

  const employeeFilter = { status: 'active' };
  await excludeSuperadminEmployees(employeeFilter, req.user.role, '_id');

  if (status === 'not_marked') {
    const marked = await Attendance.find({ date: startOfDay(new Date()) }, 'employeeRef');
    employeeFilter._id = { $nin: marked.map((a) => a.employeeRef) };
    const items = await Employee.find(employeeFilter, 'name dept avatarIndex').sort({ name: 1 });
    return res.json({ items });
  }

  const attendanceFilter = { date: startOfDay(new Date()), status };
  await excludeSuperadminEmployees(attendanceFilter, req.user.role);
  const records = await Attendance.find(attendanceFilter).populate('employeeRef', 'name dept avatarIndex status');
  const items = records
    .filter((r) => r.employeeRef && r.employeeRef.status === 'active')
    .map((r) => ({ _id: r.employeeRef._id, name: r.employeeRef.name, dept: r.employeeRef.dept, avatarIndex: r.employeeRef.avatarIndex }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json({ items });
}

// All four today's-attendance groups (plus not-marked) in one call — powers the
// dashboard's "View all" breakdown, grouped separately rather than one flat list.
async function todayBreakdown(req, res) {
  const employeeFilter = { status: 'active' };
  await excludeSuperadminEmployees(employeeFilter, req.user.role, '_id');
  const activeEmployees = await Employee.find(employeeFilter, 'name dept avatarIndex');

  const attendanceFilter = { date: startOfDay(new Date()) };
  await excludeSuperadminEmployees(attendanceFilter, req.user.role);
  const records = await Attendance.find(attendanceFilter).populate('employeeRef', 'name dept avatarIndex status');

  const groups = { office: [], wfh: [], leave: [], absent: [] };
  const markedIds = new Set();
  records.forEach((r) => {
    if (!r.employeeRef || r.employeeRef.status !== 'active') return;
    markedIds.add(String(r.employeeRef._id));
    groups[r.status].push({ _id: r.employeeRef._id, name: r.employeeRef.name, dept: r.employeeRef.dept, avatarIndex: r.employeeRef.avatarIndex });
  });
  const notMarked = activeEmployees
    .filter((e) => !markedIds.has(String(e._id)))
    .map((e) => ({ _id: e._id, name: e.name, dept: e.dept, avatarIndex: e.avatarIndex }));

  Object.values(groups).forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
  notMarked.sort((a, b) => a.name.localeCompare(b.name));

  res.json({ ...groups, notMarked });
}

async function upsert(req, res) {
  const { employeeRef, date, status, note } = req.body;
  if (!employeeRef || !date || !STATUSES.includes(status)) {
    return res.status(400).json({ message: `employeeRef, date and a status (${STATUSES.join(', ')}) are required.` });
  }

  const employee = await Employee.findById(employeeRef, 'name');
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });

  const day = startOfDay(date);
  const record = await Attendance.findOneAndUpdate(
    { employeeRef, date: day },
    { employeeRef, date: day, status, note: note || '', markedBy: req.user._id },
    { new: true, upsert: true, runValidators: true }
  ).populate('employeeRef', 'name dept avatarIndex');

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'attendance',
    recordId: record._id,
    detail: `Marked ${employee.name} as ${status} on ${day.toDateString()}`,
  });

  res.json({ record });
}

async function bulkUpsert(req, res) {
  const { date, entries } = req.body;
  if (!date || !Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ message: 'date and a non-empty entries array are required.' });
  }
  const day = startOfDay(date);

  const results = [];
  for (const { employeeRef, status, note } of entries) {
    if (!employeeRef || !STATUSES.includes(status)) continue;
    const record = await Attendance.findOneAndUpdate(
      { employeeRef, date: day },
      { employeeRef, date: day, status, note: note || '', markedBy: req.user._id },
      { new: true, upsert: true, runValidators: true }
    );
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
    const employeeFilter = { _id: employeeId };
    await excludeSuperadminEmployees(employeeFilter, req.user.role, '_id');
    const employee = await Employee.findOne(employeeFilter, 'name empId dept desig');
    if (!employee) {
      doc.text('Employee not found.');
      doc.end();
      return;
    }
    const records = await Attendance.find({ employeeRef: employeeId, date: { $gte: from, $lte: to } }).sort({ date: 1 });

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
    await excludeSuperadminEmployees(employeesFilter, req.user.role, '_id');
    const employees = await Employee.find(employeesFilter, 'name empId dept').sort({ name: 1 });
    const records = await Attendance.find({ date: { $gte: from, $lte: to } }, 'employeeRef status');

    const byEmployee = {};
    records.forEach((r) => {
      const id = String(r.employeeRef);
      byEmployee[id] = byEmployee[id] || { office: 0, wfh: 0, leave: 0, absent: 0 };
      byEmployee[id][r.status] += 1;
    });

    doc.fontSize(16).text('Attendance Report — All Employees', { align: 'center' });
    doc.fontSize(10).fillColor('#666').text(monthLabel, { align: 'center' });
    doc.fillColor('#000').moveDown(1);

    doc.fontSize(9);
    employees.forEach((e) => {
      const c = byEmployee[String(e._id)] || { office: 0, wfh: 0, leave: 0, absent: 0 };
      doc.text(`${e.name} (${e.dept})  —  Office: ${c.office}   WFH: ${c.wfh}   Leave: ${c.leave}   Absent: ${c.absent}`);
    });
  }

  doc.end();
}

async function remove(req, res) {
  const record = await Attendance.findByIdAndDelete(req.params.id);
  if (!record) return res.status(404).json({ message: 'Attendance record not found.' });
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

  const existingPending = await AttendanceCorrectionRequest.findOne({ employeeRef: ownId, date: day, status: 'pending' });
  if (existingPending) return res.status(409).json({ message: 'You already have a pending correction request for this date.' });

  const existingRecord = await Attendance.findOne({ employeeRef: ownId, date: day }, 'status');
  const currentStatus = existingRecord?.status || 'not_marked';
  if (currentStatus === requestedStatus) return res.status(400).json({ message: 'Requested status matches the current status.' });

  const employee = await Employee.findById(ownId, 'name');
  const request = await AttendanceCorrectionRequest.create({ employeeRef: ownId, date: day, currentStatus, requestedStatus, reason: reason.trim() });

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'CREATE',
    entity: 'attendance_corrections',
    recordId: request._id,
    detail: `Requested attendance correction for ${day.toDateString()}: ${STATUS_LABEL_FULL[currentStatus]} → ${STATUS_LABEL_FULL[requestedStatus]}`,
  });

  const approvers = await User.find({ role: { $in: APPROVER_ROLES } }, '_id');
  notifyAttendanceEvent({
    recipientIds: approvers.map((u) => u._id),
    icon: '📅',
    title: 'Attendance correction requested',
    body: `${employee?.name || 'An employee'} disputed ${day.toDateString()}: ${STATUS_LABEL_FULL[currentStatus]} → ${STATUS_LABEL_FULL[requestedStatus]}.`,
    link: '/attendance?tab=corrections',
  });

  res.status(201).json({ item: request });
}

async function myCorrectionRequests(req, res) {
  const ownId = await resolveOwnEmployeeId(req);
  if (!ownId) return res.json({ items: [] });
  const items = await AttendanceCorrectionRequest.find({ employeeRef: ownId }).sort({ date: -1 });
  res.json({ items });
}

async function listCorrectionRequests(req, res) {
  const { status } = req.query;
  const filter = {};
  if (status && status !== 'all') filter.status = status;
  await excludeSuperadminEmployees(filter, req.user.role);
  const items = await AttendanceCorrectionRequest.find(filter)
    .populate('employeeRef', 'name avatarIndex dept')
    .sort({ createdAt: -1 });
  res.json({ items });
}

async function approveCorrectionRequest(req, res) {
  const request = await AttendanceCorrectionRequest.findById(req.params.id).populate('employeeRef', 'name userRef');
  if (!request) return res.status(404).json({ message: 'Correction request not found.' });
  if (request.status !== 'pending') return res.status(400).json({ message: 'This request has already been decided.' });

  await Attendance.findOneAndUpdate(
    { employeeRef: request.employeeRef._id, date: request.date },
    { employeeRef: request.employeeRef._id, date: request.date, status: request.requestedStatus, note: `Corrected via request ${request._id}`, markedBy: req.user._id },
    { upsert: true, runValidators: true }
  );

  request.status = 'approved';
  request.decidedByRef = req.user._id;
  request.decidedAt = new Date();
  await request.save();

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'attendance_corrections',
    recordId: request._id,
    detail: `Approved attendance correction for ${request.employeeRef.name} on ${request.date.toDateString()}: now ${STATUS_LABEL_FULL[request.requestedStatus]}`,
  });

  if (request.employeeRef.userRef) {
    notifyAttendanceEvent({
      recipientIds: [request.employeeRef.userRef],
      icon: '✅',
      title: 'Attendance correction approved',
      body: `Your ${request.date.toDateString()} attendance was updated to ${STATUS_LABEL_FULL[request.requestedStatus]}.`,
    });
  }

  res.json({ item: request });
}

async function rejectCorrectionRequest(req, res) {
  const { note } = req.body;
  const request = await AttendanceCorrectionRequest.findById(req.params.id).populate('employeeRef', 'name userRef');
  if (!request) return res.status(404).json({ message: 'Correction request not found.' });
  if (request.status !== 'pending') return res.status(400).json({ message: 'This request has already been decided.' });

  request.status = 'rejected';
  request.decidedByRef = req.user._id;
  request.decisionNote = note || '';
  request.decidedAt = new Date();
  await request.save();

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'attendance_corrections',
    recordId: request._id,
    detail: `Rejected attendance correction for ${request.employeeRef.name} on ${request.date.toDateString()}`,
  });

  if (request.employeeRef.userRef) {
    notifyAttendanceEvent({
      recipientIds: [request.employeeRef.userRef],
      icon: '❌',
      title: 'Attendance correction rejected',
      body: `Your correction request for ${request.date.toDateString()} was rejected.${note ? ` Note: ${note}` : ''}`,
    });
  }

  res.json({ item: request });
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
