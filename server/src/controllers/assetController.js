const { AssetStatus, AssetCategory } = require('@prisma/client');
const { prisma, shape, shapeMany, sel, andWhere } = require('../db');
const writeAudit = require('../utils/audit');
const { ADMIN_ROLES } = require('../utils/roles');
const { excludeSuperadminEmployees } = require('../utils/hideSuperadmin');
const { resolveScopeLocation, isOutsideScope, scopedEmployeeIds } = require('../utils/officeScope');

const NO_MATCH = { id: { in: [] } };

async function list(req, res) {
  const { status, category, employeeRef, page = 1, limit = 25 } = req.query;
  const where = {};
  // An unknown status/category simply matched nothing on MongoDB; Prisma would
  // reject it as an invalid enum value, so filter to zero results instead.
  if (status && status !== 'all') {
    if (Object.values(AssetStatus).includes(status)) where.status = status;
    else andWhere(where, NO_MATCH);
  }
  if (category && category !== 'all') {
    if (Object.values(AssetCategory).includes(category)) where.category = category;
    else andWhere(where, NO_MATCH);
  }

  if (!ADMIN_ROLES.includes(req.user.role)) {
    if (!req.user.employeeRef) return res.status(400).json({ message: 'No employee record linked to this account.' });
    where.employeeId = String(req.user.employeeRef);
  } else {
    if (employeeRef) where.employeeId = String(employeeRef);
    await excludeSuperadminEmployees(where, req.user.role);

    // Assets aren't tied to an office themselves - a scoped superadmin sees
    // unassigned inventory plus anything assigned to their own office's employees.
    const scopedIds = await scopedEmployeeIds(req.user);
    if (scopedIds && !employeeRef) {
      andWhere(where, { OR: [{ employeeId: null }, { employeeId: { in: scopedIds } }] });
    } else if (scopedIds && employeeRef && !scopedIds.some((id) => String(id) === String(employeeRef))) {
      andWhere(where, NO_MATCH); // that employee isn't in this office - zero results
    }
  }

  const pg = Math.max(parseInt(page, 10) || 1, 1);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);

  const [items, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      include: { employeeRef: { select: sel('Employee', 'name avatarIndex dept') } },
      orderBy: { createdAt: 'desc' },
      skip: (pg - 1) * lim,
      take: lim,
    }),
    prisma.asset.count({ where }),
  ]);
  res.json({ items: shapeMany('Asset', items), total, page: pg, pages: Math.ceil(total / lim) || 1 });
}

async function create(req, res) {
  const { name, category, serialNumber, notes, employeeRef } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ message: 'name is required.' });

  let employee = null;
  if (employeeRef) {
    employee = await prisma.employee.findUnique({ where: { id: String(employeeRef) } });
    if (!employee) return res.status(404).json({ message: 'Employee not found.' });
    if (await isOutsideScope(req.user, employee.location)) {
      return res.status(404).json({ message: 'Employee not found.' });
    }
  }

  const asset = await prisma.asset.create({
    data: {
      name: String(name).trim(),
      category: category || 'other',
      serialNumber: String(serialNumber || '').trim(),
      notes: notes ? String(notes) : '',
      employeeId: employee?.id || null,
      status: employee ? 'assigned' : 'unassigned',
      assignedAt: employee ? new Date() : null,
    },
  });
  await writeAudit({ ip: req.ip, user: req.user, action: 'CREATE', entity: 'assets', recordId: asset.id, detail: `Added asset: ${asset.name}` });
  res.status(201).json({ item: shape('Asset', asset) });
}

async function assign(req, res) {
  const { employeeRef } = req.body;
  if (!employeeRef) return res.status(400).json({ message: 'employeeRef is required.' });
  const employee = await prisma.employee.findUnique({ where: { id: String(employeeRef) } });
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });
  if (await isOutsideScope(req.user, employee.location)) {
    return res.status(404).json({ message: 'Employee not found.' });
  }

  const existing = await prisma.asset.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!existing) return res.status(404).json({ message: 'Asset not found.' });

  const asset = await prisma.asset.update({
    where: { id: existing.id },
    data: { employeeId: employee.id, status: 'assigned', assignedAt: new Date(), returnedAt: null },
  });

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'assets',
    recordId: asset.id,
    detail: `Assigned asset "${asset.name}" to ${employee.name}`,
  });
  res.json({ item: shape('Asset', asset) });
}

async function updateStatus(req, res) {
  const { status, notes } = req.body;
  if (!['returned', 'damaged', 'lost'].includes(status)) {
    return res.status(400).json({ message: 'status must be one of returned, damaged, lost.' });
  }
  const withLocation = { employeeRef: { select: sel('Employee', 'location') } };
  const existing = await prisma.asset.findUnique({ where: { id: String(req.params.id) }, include: withLocation });
  if (!existing) return res.status(404).json({ message: 'Asset not found.' });
  if (existing.employeeRef && (await isOutsideScope(req.user, existing.employeeRef.location))) {
    return res.status(404).json({ message: 'Asset not found.' });
  }

  const data = { status };
  if (status === 'returned') data.returnedAt = new Date();
  if (notes !== undefined) data.notes = notes == null ? null : String(notes);
  const asset = await prisma.asset.update({ where: { id: existing.id }, data, include: withLocation });

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'assets',
    recordId: asset.id,
    detail: `Marked asset "${asset.name}" as ${status}`,
  });
  res.json({ item: shape('Asset', asset) });
}

async function remove(req, res) {
  const existing = await prisma.asset.findUnique({
    where: { id: String(req.params.id) },
    include: { employeeRef: { select: sel('Employee', 'location') } },
  });
  const scopeLoc = await resolveScopeLocation(req.user);
  if (scopeLoc && existing?.employeeRef && existing.employeeRef.location !== scopeLoc) {
    return res.status(404).json({ message: 'Asset not found.' });
  }
  if (!existing) return res.status(404).json({ message: 'Asset not found.' });
  await prisma.asset.deleteMany({ where: { id: existing.id } });
  await writeAudit({ ip: req.ip, user: req.user, action: 'DELETE', entity: 'assets', recordId: existing.id, detail: `Deleted asset: ${existing.name}` });
  res.json({ message: 'Asset deleted.' });
}

module.exports = { list, create, assign, updateStatus, remove };
