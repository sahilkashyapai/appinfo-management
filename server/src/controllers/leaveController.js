const LeaveRequest = require('../models/LeaveRequest');
const Employee = require('../models/Employee');
const User = require('../models/User');
const Notification = require('../models/Notification');
const getSettings = require('../utils/getSettings');
const writeAudit = require('../utils/audit');
const { sendPushToUser, sendPushToUsers } = require('../services/pushService');
const { ADMIN_ROLES, APPROVER_ROLES } = require('../utils/roles');

const LEAVE_TYPES = ['casual', 'sick', 'earned'];
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function daysBetweenInclusive(start, end) {
  return Math.round((end - start) / ONE_DAY_MS) + 1;
}

async function computeBalance(employeeId, year) {
  const settings = await getSettings();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

  const used = await LeaveRequest.aggregate([
    { $match: { employeeRef: employeeId, status: 'approved', startDate: { $gte: yearStart, $lte: yearEnd } } },
    { $group: { _id: '$type', used: { $sum: '$days' } } },
  ]);
  const usedMap = Object.fromEntries(used.map((u) => [u._id, u.used]));

  const allocations = settings.leavePolicy.allocations;
  return Object.fromEntries(
    LEAVE_TYPES.map((type) => {
      const allocated = allocations[type] ?? 0;
      const usedDays = usedMap[type] || 0;
      return [type, { allocated, used: usedDays, remaining: Math.max(allocated - usedDays, 0) }];
    })
  );
}

async function notifyLeaveEvent({ recipientIds, icon, title, body, link = '/leave' }) {
  const ids = recipientIds.filter(Boolean).map(String);
  if (!ids.length) return;
  try {
    await Promise.all(ids.map((id) => Notification.create({ recipientRef: id, icon, type: 'leave', title, body, link })));
  } catch (err) {
    console.error('[leave] failed to create notification:', err.message);
  }
  sendPushToUsers(ids, { title, body, url: link }).catch((err) => console.error('[leave] push failed:', err.message));
}

// Employee-wise leave report for a given year — admins get every active employee,
// a regular employee gets just their own row (same shape, so the frontend can
// reuse one table for both).
async function report(req, res) {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const isAdmin = ADMIN_ROLES.includes(req.user.role);

  let employees;
  if (isAdmin) {
    employees = await Employee.find({ status: 'active' }).select('name dept desig avatarIndex');
  } else {
    if (!req.user.employeeRef) return res.status(400).json({ message: 'No employee record linked to this account.' });
    employees = await Employee.find({ _id: req.user.employeeRef }).select('name dept desig avatarIndex');
  }

  const settings = await getSettings();
  const allocations = settings.leavePolicy.allocations;
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
  const employeeIds = employees.map((e) => e._id);

  const [usedAgg, statusAgg] = await Promise.all([
    LeaveRequest.aggregate([
      { $match: { employeeRef: { $in: employeeIds }, status: 'approved', startDate: { $gte: yearStart, $lte: yearEnd } } },
      { $group: { _id: { employeeRef: '$employeeRef', type: '$type' }, used: { $sum: '$days' } } },
    ]),
    LeaveRequest.aggregate([
      { $match: { employeeRef: { $in: employeeIds }, startDate: { $gte: yearStart, $lte: yearEnd } } },
      { $group: { _id: { employeeRef: '$employeeRef', status: '$status' }, count: { $sum: 1 } } },
    ]),
  ]);

  const usedMap = {};
  usedAgg.forEach((a) => {
    const id = String(a._id.employeeRef);
    usedMap[id] = usedMap[id] || {};
    usedMap[id][a._id.type] = a.used;
  });
  const statusMap = {};
  statusAgg.forEach((a) => {
    const id = String(a._id.employeeRef);
    statusMap[id] = statusMap[id] || {};
    statusMap[id][a._id.status] = a.count;
  });

  const items = employees.map((e) => {
    const id = String(e._id);
    const used = usedMap[id] || {};
    const statuses = statusMap[id] || {};
    const byType = Object.fromEntries(
      LEAVE_TYPES.map((type) => {
        const allocated = allocations[type] ?? 0;
        const usedDays = used[type] || 0;
        return [type, { allocated, used: usedDays, remaining: Math.max(allocated - usedDays, 0) }];
      })
    );
    return {
      employeeId: e._id,
      name: e.name,
      dept: e.dept,
      desig: e.desig,
      avatarIndex: e.avatarIndex,
      byType,
      totalUsed: LEAVE_TYPES.reduce((sum, t) => sum + byType[t].used, 0),
      pending: statuses.pending || 0,
      onHold: statuses.on_hold || 0,
      approved: statuses.approved || 0,
      rejected: statuses.rejected || 0,
      cancelled: statuses.cancelled || 0,
    };
  });

  res.json({ year, items });
}

async function balance(req, res) {
  let employeeRef = req.user.employeeRef;
  if (req.query.employeeId && ['superadmin', 'hr'].includes(req.user.role)) {
    employeeRef = req.query.employeeId;
  } else if (req.query.employeeId && req.user.role === 'manager') {
    const target = await Employee.findById(req.query.employeeId, 'managerRef');
    if (target && String(target.managerRef) === String(req.user.employeeRef)) employeeRef = req.query.employeeId;
  }
  if (!employeeRef) return res.status(400).json({ message: 'No employee record linked to this account.' });

  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  res.json({ year, balance: await computeBalance(employeeRef, year) });
}

async function mine(req, res) {
  if (!req.user.employeeRef) return res.status(400).json({ message: 'No employee record linked to this account.' });
  const { page = 1, limit = 25 } = req.query;
  const pg = Math.max(parseInt(page, 10) || 1, 1);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);

  const filter = { employeeRef: req.user.employeeRef };
  const [items, total] = await Promise.all([
    LeaveRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((pg - 1) * lim)
      .limit(lim),
    LeaveRequest.countDocuments(filter),
  ]);
  res.json({ items, total, page: pg, pages: Math.ceil(total / lim) || 1 });
}

async function list(req, res) {
  const { status, type, employeeRef, page = 1, limit = 25 } = req.query;
  const filter = {};
  // "pending" from the Approvals tab means "still needs a decision" — on-hold
  // requests are shown there too since they haven't been finally decided yet.
  if (status === 'pending') filter.status = { $in: ['pending', 'on_hold'] };
  else if (status && status !== 'all') filter.status = status;
  if (type && type !== 'all') filter.type = type;
  if (employeeRef) filter.employeeRef = employeeRef;

  if (req.user.role === 'manager') {
    const reports = await Employee.find({ managerRef: req.user.employeeRef }, '_id');
    filter.employeeRef = { $in: reports.map((r) => r._id) };
  }

  const pg = Math.max(parseInt(page, 10) || 1, 1);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);

  const [items, total] = await Promise.all([
    LeaveRequest.find(filter)
      .populate('employeeRef', 'name avatarIndex dept desig managerRef userRef')
      .sort({ createdAt: -1 })
      .skip((pg - 1) * lim)
      .limit(lim),
    LeaveRequest.countDocuments(filter),
  ]);
  res.json({ items, total, page: pg, pages: Math.ceil(total / lim) || 1 });
}

async function getOne(req, res) {
  const request = await LeaveRequest.findById(req.params.id).populate('employeeRef', 'name avatarIndex dept desig managerRef userRef');
  if (!request) return res.status(404).json({ message: 'Leave request not found.' });

  const isOwner = String(request.employeeRef._id) === String(req.user.employeeRef);
  const isManager = request.employeeRef.managerRef && String(request.employeeRef.managerRef) === String(req.user.employeeRef);
  if (!isOwner && !isManager && !APPROVER_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission to view this request.' });
  }
  res.json({ item: request });
}

async function create(req, res) {
  const { type, startDate, endDate, reason } = req.body;
  if (!LEAVE_TYPES.includes(type)) return res.status(400).json({ message: `type must be one of ${LEAVE_TYPES.join(', ')}` });
  if (!startDate || !endDate) return res.status(400).json({ message: 'startDate and endDate are required.' });
  if (!reason || !reason.trim()) return res.status(400).json({ message: 'A reason is required.' });
  if (!req.user.employeeRef) return res.status(400).json({ message: 'No employee record linked to this account to request leave with.' });

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return res.status(400).json({ message: 'endDate must be on or after startDate.' });
  }
  const days = daysBetweenInclusive(start, end);

  const employee = await Employee.findById(req.user.employeeRef);
  if (!employee) return res.status(404).json({ message: 'Employee record not found.' });

  const settings = await getSettings();
  if (settings.leavePolicy.blockOverlapping) {
    const overlapping = await LeaveRequest.findOne({
      employeeRef: employee._id,
      status: { $in: ['pending', 'approved'] },
      startDate: { $lte: end },
      endDate: { $gte: start },
    });
    if (overlapping) return res.status(400).json({ message: 'This overlaps an existing pending or approved leave request.' });
  }

  const bal = await computeBalance(employee._id, start.getFullYear());
  if (days > bal[type].remaining) {
    return res.status(400).json({ message: `Only ${bal[type].remaining} day(s) of ${type} leave remaining.` });
  }

  const request = await LeaveRequest.create({ employeeRef: employee._id, type, startDate: start, endDate: end, days, reason: reason.trim() });
  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'CREATE',
    entity: 'leave_requests',
    recordId: request._id,
    detail: `Requested ${type} leave: ${start.toDateString()} – ${end.toDateString()}`,
  });

  const approverUsers = await User.find({ role: { $in: APPROVER_ROLES } }, '_id');
  const recipientIds = approverUsers.map((u) => u._id);
  if (employee.managerRef) {
    const manager = await Employee.findById(employee.managerRef, 'userRef');
    if (manager?.userRef) recipientIds.push(manager.userRef);
  }
  notifyLeaveEvent({
    recipientIds,
    icon: '🗓️',
    title: 'New leave request',
    body: `${employee.name} requested ${days} day(s) of ${type} leave.`,
    link: '/leave?tab=approvals',
  });

  res.status(201).json({ item: request });
}

function decide(status) {
  return async function handler(req, res) {
    const { note } = req.body;
    const request = await LeaveRequest.findById(req.params.id).populate('employeeRef', 'name managerRef userRef');
    if (!request) return res.status(404).json({ message: 'Leave request not found.' });
    if (!['pending', 'on_hold'].includes(request.status)) return res.status(400).json({ message: 'This request has already been decided.' });

    const isManager = request.employeeRef.managerRef && String(request.employeeRef.managerRef) === String(req.user.employeeRef);
    if (!APPROVER_ROLES.includes(req.user.role) && !isManager) {
      return res.status(403).json({ message: 'You do not have permission to decide this request.' });
    }

    request.status = status;
    request.approverRef = req.user._id;
    request.approverNote = note || '';
    request.decidedAt = new Date();
    await request.save();

    await writeAudit({
      ip: req.ip,
      user: req.user,
      action: 'UPDATE',
      entity: 'leave_requests',
      recordId: request._id,
      detail: `${status === 'approved' ? 'Approved' : 'Rejected'} ${request.type} leave for ${request.employeeRef.name} (${request.startDate.toDateString()} – ${request.endDate.toDateString()})`,
    });

    if (request.employeeRef.userRef) {
      notifyLeaveEvent({
        recipientIds: [request.employeeRef.userRef],
        icon: status === 'approved' ? '✅' : '❌',
        title: `Leave request ${status}`,
        body: `Your ${request.type} leave request (${request.startDate.toDateString()} – ${request.endDate.toDateString()}) was ${status}.${note ? ` Note: ${note}` : ''}`,
      });
    }

    res.json({ item: request });
  };
}

async function hold(req, res) {
  const { note } = req.body;
  const request = await LeaveRequest.findById(req.params.id).populate('employeeRef', 'name managerRef userRef');
  if (!request) return res.status(404).json({ message: 'Leave request not found.' });
  if (request.status !== 'pending') return res.status(400).json({ message: 'Only pending requests can be put on hold.' });

  const isManager = request.employeeRef.managerRef && String(request.employeeRef.managerRef) === String(req.user.employeeRef);
  if (!APPROVER_ROLES.includes(req.user.role) && !isManager) {
    return res.status(403).json({ message: 'You do not have permission to update this request.' });
  }

  request.status = 'on_hold';
  request.approverNote = note || '';
  await request.save();

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'leave_requests',
    recordId: request._id,
    detail: `Put ${request.type} leave for ${request.employeeRef.name} on hold`,
  });

  if (request.employeeRef.userRef) {
    notifyLeaveEvent({
      recipientIds: [request.employeeRef.userRef],
      icon: '⏸️',
      title: 'Leave request on hold',
      body: `Your ${request.type} leave request (${request.startDate.toDateString()} – ${request.endDate.toDateString()}) is on hold.${note ? ` Note: ${note}` : ''}`,
    });
  }

  res.json({ item: request });
}

async function addComment(req, res) {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ message: 'Comment text is required.' });

  const request = await LeaveRequest.findById(req.params.id).populate('employeeRef', 'name managerRef userRef');
  if (!request) return res.status(404).json({ message: 'Leave request not found.' });

  const isOwner = String(request.employeeRef._id) === String(req.user.employeeRef);
  const isManager = request.employeeRef.managerRef && String(request.employeeRef.managerRef) === String(req.user.employeeRef);
  if (!isOwner && !isManager && !APPROVER_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission to comment on this request.' });
  }

  request.comments.push({ authorRef: req.user._id, text: text.trim() });
  await request.save();

  if (!isOwner && request.employeeRef.userRef) {
    notifyLeaveEvent({
      recipientIds: [request.employeeRef.userRef],
      icon: '💬',
      title: 'New comment on your leave request',
      body: `${req.user.name}: ${text.trim()}`,
    });
  }

  res.status(201).json({ item: request });
}

async function cancel(req, res) {
  const request = await LeaveRequest.findById(req.params.id);
  if (!request) return res.status(404).json({ message: 'Leave request not found.' });
  if (String(request.employeeRef) !== String(req.user.employeeRef)) {
    return res.status(403).json({ message: 'You can only cancel your own requests.' });
  }
  if (request.status !== 'pending') return res.status(400).json({ message: 'Only pending requests can be cancelled.' });

  request.status = 'cancelled';
  await request.save();
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'leave_requests', recordId: request._id, detail: 'Cancelled leave request' });
  res.json({ item: request });
}

module.exports = { balance, mine, list, getOne, create, approve: decide('approved'), reject: decide('rejected'), hold, addComment, cancel, report };
