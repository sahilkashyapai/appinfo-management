const PDFDocument = require('pdfkit');
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const writeAudit = require('../utils/audit');

const STATUSES = ['office', 'wfh', 'leave', 'absent'];

function startOfDay(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
}

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

async function list(req, res) {
  const { employeeId, from, to, month } = req.query;
  const isAdmin = ['superadmin', 'hr', 'manager'].includes(req.user.role);

  const filter = {};

  if (isAdmin) {
    if (employeeId) filter.employeeRef = employeeId;
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

  res.json({ items });
}

async function today(req, res) {
  const items = await Attendance.find({ date: startOfDay(new Date()) }, 'employeeRef status');
  const byEmployee = Object.fromEntries(items.map((a) => [String(a.employeeRef), a.status]));
  res.json({ date: startOfDay(new Date()), statuses: byEmployee });
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
    const employee = await Employee.findById(employeeId, 'name empId dept desig');
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
    const employees = await Employee.find({}, 'name empId dept').sort({ name: 1 });
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

module.exports = { list, today, upsert, bulkUpsert, remove, exportPdf };
