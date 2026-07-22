const Asset = require('../models/Asset');
const Employee = require('../models/Employee');
const writeAudit = require('../utils/audit');
const { ADMIN_ROLES } = require('../utils/roles');

async function list(req, res) {
  const { status, category, employeeRef, page = 1, limit = 25 } = req.query;
  const filter = {};
  if (status && status !== 'all') filter.status = status;
  if (category && category !== 'all') filter.category = category;

  if (!ADMIN_ROLES.includes(req.user.role)) {
    if (!req.user.employeeRef) return res.status(400).json({ message: 'No employee record linked to this account.' });
    filter.employeeRef = req.user.employeeRef;
  } else if (employeeRef) {
    filter.employeeRef = employeeRef;
  }

  const pg = Math.max(parseInt(page, 10) || 1, 1);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);

  const [items, total] = await Promise.all([
    Asset.find(filter)
      .populate('employeeRef', 'name avatarIndex dept')
      .sort({ createdAt: -1 })
      .skip((pg - 1) * lim)
      .limit(lim),
    Asset.countDocuments(filter),
  ]);
  res.json({ items, total, page: pg, pages: Math.ceil(total / lim) || 1 });
}

async function create(req, res) {
  const { name, category, serialNumber, notes, employeeRef } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ message: 'name is required.' });

  let employee = null;
  if (employeeRef) {
    employee = await Employee.findById(employeeRef);
    if (!employee) return res.status(404).json({ message: 'Employee not found.' });
  }

  const asset = await Asset.create({
    name: name.trim(),
    category: category || 'other',
    serialNumber: serialNumber || '',
    notes: notes || '',
    employeeRef: employee?._id || null,
    status: employee ? 'assigned' : 'unassigned',
    assignedAt: employee ? new Date() : null,
  });
  await writeAudit({ ip: req.ip, user: req.user, action: 'CREATE', entity: 'assets', recordId: asset._id, detail: `Added asset: ${asset.name}` });
  res.status(201).json({ item: asset });
}

async function assign(req, res) {
  const { employeeRef } = req.body;
  if (!employeeRef) return res.status(400).json({ message: 'employeeRef is required.' });
  const employee = await Employee.findById(employeeRef);
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });

  const asset = await Asset.findById(req.params.id);
  if (!asset) return res.status(404).json({ message: 'Asset not found.' });

  asset.employeeRef = employee._id;
  asset.status = 'assigned';
  asset.assignedAt = new Date();
  asset.returnedAt = null;
  await asset.save();

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'assets',
    recordId: asset._id,
    detail: `Assigned asset "${asset.name}" to ${employee.name}`,
  });
  res.json({ item: asset });
}

async function updateStatus(req, res) {
  const { status, notes } = req.body;
  if (!['returned', 'damaged', 'lost'].includes(status)) {
    return res.status(400).json({ message: 'status must be one of returned, damaged, lost.' });
  }
  const asset = await Asset.findById(req.params.id);
  if (!asset) return res.status(404).json({ message: 'Asset not found.' });

  asset.status = status;
  if (status === 'returned') asset.returnedAt = new Date();
  if (notes !== undefined) asset.notes = notes;
  await asset.save();

  await writeAudit({
    ip: req.ip,
    user: req.user,
    action: 'UPDATE',
    entity: 'assets',
    recordId: asset._id,
    detail: `Marked asset "${asset.name}" as ${status}`,
  });
  res.json({ item: asset });
}

async function remove(req, res) {
  const asset = await Asset.findByIdAndDelete(req.params.id);
  if (!asset) return res.status(404).json({ message: 'Asset not found.' });
  await writeAudit({ ip: req.ip, user: req.user, action: 'DELETE', entity: 'assets', recordId: asset._id, detail: `Deleted asset: ${asset.name}` });
  res.json({ message: 'Asset deleted.' });
}

module.exports = { list, create, assign, updateStatus, remove };
