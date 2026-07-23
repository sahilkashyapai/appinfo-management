const Department = require('../models/Department');
const Employee = require('../models/Employee');
const writeAudit = require('../utils/audit');
const { excludeSuperadminEmployees } = require('../utils/hideSuperadmin');

// Unauthenticated — powers the department dropdown on the public signup page.
async function publicList(req, res) {
  const depts = await Department.find({}, 'name code icon').sort({ name: 1 });
  res.json({ items: depts });
}

async function list(req, res) {
  const depts = await Department.find({}).populate('headRef', 'name').sort({ name: 1 });
  const countFilter = {};
  await excludeSuperadminEmployees(countFilter, req.user.role, '_id');
  const counts = await Employee.aggregate([{ $match: countFilter }, { $group: { _id: '$dept', count: { $sum: 1 } } }]);
  const countMap = Object.fromEntries(counts.map((c) => [c._id, c.count]));
  res.json({
    items: depts.map((d) => ({ ...d.toObject(), count: countMap[d.name] || 0 })),
  });
}

async function create(req, res) {
  const { name, code, headRef, icon, color, description } = req.body;
  if (!name || !code) return res.status(400).json({ message: 'name and code are required.' });
  const dept = await Department.create({ name, code, headRef: headRef || null, icon, color, description });
  await writeAudit({ ip: req.ip, user: req.user, action: 'CREATE', entity: 'departments', recordId: dept.code, detail: `Created department: ${dept.name}` });
  res.status(201).json({ department: dept });
}

async function update(req, res) {
  const dept = await Department.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!dept) return res.status(404).json({ message: 'Department not found.' });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'departments', recordId: dept.code, detail: `Updated department: ${dept.name}` });
  res.json({ department: dept });
}

async function remove(req, res) {
  const dept = await Department.findById(req.params.id);
  if (!dept) return res.status(404).json({ message: 'Department not found.' });
  const inUse = await Employee.countDocuments({ dept: dept.name });
  if (inUse > 0) return res.status(409).json({ message: `Cannot delete: ${inUse} employee(s) still belong to this department.` });
  await dept.deleteOne();
  await writeAudit({ ip: req.ip, user: req.user, action: 'DELETE', entity: 'departments', recordId: dept.code, detail: `Deleted department: ${dept.name}` });
  res.json({ message: 'Department deleted.' });
}

module.exports = { list, publicList, create, update, remove };
