const { prisma, shape, shapeMany, sel, INCLUDE } = require('../db');
const { createNotification } = require('../services/notify');
const getSettings = require('../utils/getSettings');
const writeAudit = require('../utils/audit');
const { sendPushToUser, sendPushToUsers } = require('../services/pushService');
const { ADMIN_ROLES, APPROVER_ROLES } = require('../utils/roles');
const { excludeSuperadminEmployees } = require('../utils/hideSuperadmin');
const { resolveScopeLocation, scopeEmployeeLocationFilter, scopeByEmployeeRef } = require('../utils/officeScope');

const LEAVE_TYPES = ['casual', 'sick', 'earned'];
const LEAVE_STATUSES = ['pending', 'on_hold', 'approved', 'rejected', 'cancelled'];
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// The employee fields the decide/hold/comment handlers need (the old
// `.populate('employeeRef', 'name managerRef userRef location')`), plus the
// comments[] array every leave-request response carries.
const WITH_EMPLOYEE = {
  ...INCLUDE.LeaveRequest,
  employeeRef: { select: sel('Employee', 'name managerRef userRef location') },
};

function daysBetweenInclusive(start, end) {
  return Math.round((end - start) / ONE_DAY_MS) + 1;
}

// An unknown status/type simply matched nothing on Mongo; Prisma rejects an
// invalid enum value outright, so turn it into an always-empty filter.
function enumFilter(value, allowed) {
  return allowed.includes(value) ? value : { in: [] };
}

async function computeBalance(employeeId, year) {
  const settings = await getSettings();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

  const used = await prisma.leaveRequest.groupBy({
    by: ['type'],
    where: { employeeId: String(employeeId), status: 'approved', startDate: { gte: yearStart, lte: yearEnd } },
    _sum: { days: true },
  });
  const usedMap = Object.fromEntries(used.map((u) => [u.type, u._sum.days || 0]));

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
    await Promise.all(ids.map((id) => createNotification({ recipientId: id, icon, type: 'leave', title, body, link })));
  } catch (err) {
    console.error('[leave] failed to create notification:', err.message);
  }
  sendPushToUsers(ids, { title, body, url: link }).catch((err) => console.error('[leave] push failed:', err.message));
}

// Employee-wise leave report for a given year - admins get every active employee,
// a regular employee gets just their own row (same shape, so the frontend can
// reuse one table for both).
async function report(req, res) {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const isAdmin = ADMIN_ROLES.includes(req.user.role);
  const employeeSelect = sel('Employee', 'name dept desig avatarIndex');

  let employees;
  if (isAdmin) {
    const filter = { status: 'active' };
    await excludeSuperadminEmployees(filter);
    await scopeEmployeeLocationFilter(filter, req.user);
    // Insertion order, as Mongo's natural order returned them.
    employees = await prisma.employee.findMany({ where: filter, select: employeeSelect, orderBy: { createdAt: 'asc' } });
  } else {
    if (!req.user.employeeRef) return res.status(400).json({ message: 'No employee record linked to this account.' });
    employees = await prisma.employee.findMany({ where: { id: String(req.user.employeeRef) }, select: employeeSelect });
  }

  const settings = await getSettings();
  const allocations = settings.leavePolicy.allocations;
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
  const employeeIds = employees.map((e) => e.id);

  const [usedAgg, statusAgg] = await Promise.all([
    prisma.leaveRequest.groupBy({
      by: ['employeeId', 'type'],
      where: { employeeId: { in: employeeIds }, status: 'approved', startDate: { gte: yearStart, lte: yearEnd } },
      _sum: { days: true },
    }),
    prisma.leaveRequest.groupBy({
      by: ['employeeId', 'status'],
      where: { employeeId: { in: employeeIds }, startDate: { gte: yearStart, lte: yearEnd } },
      _count: { _all: true },
    }),
  ]);

  const usedMap = {};
  usedAgg.forEach((a) => {
    const id = String(a.employeeId);
    usedMap[id] = usedMap[id] || {};
    usedMap[id][a.type] = a._sum.days || 0;
  });
  const statusMap = {};
  statusAgg.forEach((a) => {
    const id = String(a.employeeId);
    statusMap[id] = statusMap[id] || {};
    statusMap[id][a.status] = a._count._all;
  });

  const items = employees.map((e) => {
    const id = String(e.id);
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
      employeeId: e.id,
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
  if (req.query.employeeId && APPROVER_ROLES.includes(req.user.role)) {
    const scopeLoc = await resolveScopeLocation(req.user);
    if (scopeLoc) {
      const target = await prisma.employee.findUnique({ where: { id: String(req.query.employeeId) }, select: { location: true } });
      if (target && target.location === scopeLoc) employeeRef = req.query.employeeId;
    } else {
      employeeRef = req.query.employeeId;
    }
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

  const filter = { employeeId: String(req.user.employeeRef) };
  const [items, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: filter,
      include: INCLUDE.LeaveRequest,
      orderBy: { createdAt: 'desc' },
      skip: (pg - 1) * lim,
      take: lim,
    }),
    prisma.leaveRequest.count({ where: filter }),
  ]);
  res.json({ items: shapeMany('LeaveRequest', items), total, page: pg, pages: Math.ceil(total / lim) || 1 });
}

async function list(req, res) {
  const { status, type, employeeRef, page = 1, limit = 25 } = req.query;
  const filter = {};
  // "pending" from the Approvals tab means "still needs a decision" - on-hold
  // requests are shown there too since they haven't been finally decided yet.
  if (status === 'pending') filter.status = { in: ['pending', 'on_hold'] };
  else if (status && status !== 'all') filter.status = enumFilter(status, LEAVE_STATUSES);
  if (type && type !== 'all') filter.type = enumFilter(type, LEAVE_TYPES);
  if (employeeRef) filter.employeeId = String(employeeRef);

  await excludeSuperadminEmployees(filter, req.user.role);
  await scopeByEmployeeRef(filter, req.user);

  const pg = Math.max(parseInt(page, 10) || 1, 1);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);

  const [items, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: filter,
      include: { ...INCLUDE.LeaveRequest, employeeRef: { select: sel('Employee', 'name avatarIndex dept desig managerRef userRef') } },
      orderBy: { createdAt: 'desc' },
      skip: (pg - 1) * lim,
      take: lim,
    }),
    prisma.leaveRequest.count({ where: filter }),
  ]);
  res.json({ items: shapeMany('LeaveRequest', items), total, page: pg, pages: Math.ceil(total / lim) || 1 });
}

async function getOne(req, res) {
  const row = await prisma.leaveRequest.findUnique({
    where: { id: String(req.params.id) },
    include: { ...INCLUDE.LeaveRequest, employeeRef: { select: sel('Employee', 'name avatarIndex dept desig managerRef userRef location') } },
  });
  if (!row) return res.status(404).json({ message: 'Leave request not found.' });
  const request = shape('LeaveRequest', row);

  const isOwner = String(request.employeeRef._id) === String(req.user.employeeRef);
  const isManager = request.employeeRef.managerRef && String(request.employeeRef.managerRef) === String(req.user.employeeRef);
  const scopeLoc = await resolveScopeLocation(req.user);
  const isApprover = APPROVER_ROLES.includes(req.user.role) && (!scopeLoc || request.employeeRef.location === scopeLoc);
  if (!isOwner && !isManager && !isApprover) {
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

  const employee = await prisma.employee.findUnique({ where: { id: String(req.user.employeeRef) } });
  if (!employee) return res.status(404).json({ message: 'Employee record not found.' });

  const settings = await getSettings();
  if (settings.leavePolicy.blockOverlapping) {
    const overlapping = await prisma.leaveRequest.findFirst({
      where: {
        employeeId: employee.id,
        status: { in: ['pending', 'approved'] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: { id: true },
    });
    if (overlapping) return res.status(400).json({ message: 'This overlaps an existing pending or approved leave request.' });
  }

  const bal = await computeBalance(employee.id, start.getFullYear());
  if (days > bal[type].remaining) {
    return res.status(400).json({ message: `Only ${bal[type].remaining} day(s) of ${type} leave remaining.` });
  }

  const request = await prisma.leaveRequest.create({
    data: { employeeId: employee.id, type, startDate: start, endDate: end, days, reason: reason.trim() },
    include: INCLUDE.LeaveRequest,
  });
  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'CREATE',
    entity: 'leave_requests',
    recordId: request.id,
    detail: `Requested ${type} leave: ${start.toDateString()} - ${end.toDateString()}`,
  });

  // A superadmin scoped to another office shouldn't be pinged about this
  // employee's request - only unscoped approvers and this employee's own office.
  const approverUsers = await prisma.user.findMany({ where: { role: { in: APPROVER_ROLES } }, select: { id: true, managedLocation: true } });
  const recipientIds = approverUsers
    .filter((u) => !u.managedLocation || u.managedLocation === employee.location)
    .map((u) => u.id);
  if (employee.managerId) {
    const manager = await prisma.employee.findUnique({ where: { id: employee.managerId }, select: { userId: true } });
    if (manager?.userId) recipientIds.push(manager.userId);
  }
  notifyLeaveEvent({
    recipientIds,
    icon: 'fa-solid fa-calendar-days',
    title: 'New leave request',
    body: `${employee.name} requested ${days} day(s) of ${type} leave.`,
    link: '/leave?tab=approvals',
  });

  res.status(201).json({ item: shape('LeaveRequest', request) });
}

function decide(status) {
  return async function handler(req, res) {
    const { note } = req.body;
    const request = await prisma.leaveRequest.findUnique({ where: { id: String(req.params.id) }, include: WITH_EMPLOYEE });
    if (!request) return res.status(404).json({ message: 'Leave request not found.' });
    if (!['pending', 'on_hold'].includes(request.status)) return res.status(400).json({ message: 'This request has already been decided.' });

    const isManager = request.employeeRef.managerId && String(request.employeeRef.managerId) === String(req.user.employeeRef);
    const scopeLoc = await resolveScopeLocation(req.user);
    const isApprover = APPROVER_ROLES.includes(req.user.role) && (!scopeLoc || request.employeeRef.location === scopeLoc);
    if (!isApprover && !isManager) {
      return res.status(403).json({ message: 'You do not have permission to decide this request.' });
    }

    const updated = await prisma.leaveRequest.update({
      where: { id: request.id },
      data: { status, approverId: String(req.user._id), approverNote: note || '', decidedAt: new Date() },
      include: WITH_EMPLOYEE,
    });

    await writeAudit({
      ip: req.ip,
      user: req.user,
      action: 'UPDATE',
      entity: 'leave_requests',
      recordId: request.id,
      detail: `${status === 'approved' ? 'Approved' : 'Rejected'} ${request.type} leave for ${request.employeeRef.name} (${request.startDate.toDateString()} - ${request.endDate.toDateString()})`,
    });

    if (request.employeeRef.userId) {
      notifyLeaveEvent({
        recipientIds: [request.employeeRef.userId],
        icon: status === 'approved' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark',
        title: `Leave request ${status}`,
        body: `Your ${request.type} leave request (${request.startDate.toDateString()} - ${request.endDate.toDateString()}) was ${status}.${note ? ` Note: ${note}` : ''}`,
      });
    }

    res.json({ item: shape('LeaveRequest', updated) });
  };
}

async function hold(req, res) {
  const { note } = req.body;
  const request = await prisma.leaveRequest.findUnique({ where: { id: String(req.params.id) }, include: WITH_EMPLOYEE });
  if (!request) return res.status(404).json({ message: 'Leave request not found.' });
  if (request.status !== 'pending') return res.status(400).json({ message: 'Only pending requests can be put on hold.' });

  const isManager = request.employeeRef.managerId && String(request.employeeRef.managerId) === String(req.user.employeeRef);
  const scopeLoc = await resolveScopeLocation(req.user);
  const isApprover = APPROVER_ROLES.includes(req.user.role) && (!scopeLoc || request.employeeRef.location === scopeLoc);
  if (!isApprover && !isManager) {
    return res.status(403).json({ message: 'You do not have permission to update this request.' });
  }

  const updated = await prisma.leaveRequest.update({
    where: { id: request.id },
    data: { status: 'on_hold', approverNote: note || '' },
    include: WITH_EMPLOYEE,
  });

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'leave_requests',
    recordId: request.id,
    detail: `Put ${request.type} leave for ${request.employeeRef.name} on hold`,
  });

  if (request.employeeRef.userId) {
    notifyLeaveEvent({
      recipientIds: [request.employeeRef.userId],
      icon: 'fa-solid fa-pause',
      title: 'Leave request on hold',
      body: `Your ${request.type} leave request (${request.startDate.toDateString()} - ${request.endDate.toDateString()}) is on hold.${note ? ` Note: ${note}` : ''}`,
    });
  }

  res.json({ item: shape('LeaveRequest', updated) });
}

async function addComment(req, res) {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ message: 'Comment text is required.' });

  const request = await prisma.leaveRequest.findUnique({ where: { id: String(req.params.id) }, include: WITH_EMPLOYEE });
  if (!request) return res.status(404).json({ message: 'Leave request not found.' });

  const isOwner = String(request.employeeRef.id) === String(req.user.employeeRef);
  const isManager = request.employeeRef.managerId && String(request.employeeRef.managerId) === String(req.user.employeeRef);
  const scopeLoc = await resolveScopeLocation(req.user);
  const isApprover = APPROVER_ROLES.includes(req.user.role) && (!scopeLoc || request.employeeRef.location === scopeLoc);
  if (!isOwner && !isManager && !isApprover) {
    return res.status(403).json({ message: 'You do not have permission to comment on this request.' });
  }

  // Comments live in leave_comments now; bump the request's updatedAt too, as
  // saving the parent document did when comments were embedded.
  const updated = await prisma.leaveRequest.update({
    where: { id: request.id },
    data: { updatedAt: new Date(), comments: { create: { authorId: String(req.user._id), text: text.trim() } } },
    include: WITH_EMPLOYEE,
  });

  if (!isOwner && request.employeeRef.userId) {
    notifyLeaveEvent({
      recipientIds: [request.employeeRef.userId],
      icon: 'fa-solid fa-comment-dots',
      title: 'New comment on your leave request',
      body: `${req.user.name}: ${text.trim()}`,
    });
  }

  res.status(201).json({ item: shape('LeaveRequest', updated) });
}

async function cancel(req, res) {
  const request = await prisma.leaveRequest.findUnique({ where: { id: String(req.params.id) }, select: { id: true, employeeId: true, status: true } });
  if (!request) return res.status(404).json({ message: 'Leave request not found.' });
  if (String(request.employeeId) !== String(req.user.employeeRef)) {
    return res.status(403).json({ message: 'You can only cancel your own requests.' });
  }
  if (request.status !== 'pending') return res.status(400).json({ message: 'Only pending requests can be cancelled.' });

  const updated = await prisma.leaveRequest.update({ where: { id: request.id }, data: { status: 'cancelled' }, include: INCLUDE.LeaveRequest });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'leave_requests', recordId: request.id, detail: 'Cancelled leave request' });
  res.json({ item: shape('LeaveRequest', updated) });
}

module.exports = { balance, mine, list, getOne, create, approve: decide('approved'), reject: decide('rejected'), hold, addComment, cancel, report, computeBalance };
