const { prisma, shape, shapeMany, sel } = require('../db');
const writeAudit = require('../utils/audit');
const { excludeSuperadminEmployees } = require('../utils/hideSuperadmin');

// Unauthenticated - powers the department dropdown on the public signup page.
async function publicList(req, res) {
  const depts = await prisma.department.findMany({ select: sel('Department', 'name code icon'), orderBy: { name: 'asc' } });
  res.json({ items: shapeMany('Department', depts) });
}

async function list(req, res) {
  const depts = await prisma.department.findMany({
    include: { headRef: { select: sel('Employee', 'name') } },
    orderBy: { name: 'asc' },
  });
  const countWhere = {};
  await excludeSuperadminEmployees(countWhere);
  // Employee count per department, keyed by the denormalized `dept` name.
  const counts = await prisma.employee.groupBy({ by: ['dept'], where: countWhere, _count: { _all: true } });
  const countMap = Object.fromEntries(counts.map((c) => [c.dept, c._count._all]));
  res.json({
    items: shapeMany('Department', depts).map((d) => ({ ...d, count: countMap[d.name] || 0 })),
  });
}

// Mirrors the old Mongoose schema: name/code trimmed, code stored uppercase,
// '' for an optional ref means "none".
function departmentData(body) {
  const data = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.code !== undefined) data.code = String(body.code).trim().toUpperCase();
  if (body.headRef !== undefined) data.headId = body.headRef ? String(body.headRef) : null;
  if (body.icon !== undefined) data.icon = body.icon;
  if (body.color !== undefined) data.color = body.color;
  if (body.description !== undefined) data.description = body.description ?? '';
  return data;
}

async function create(req, res) {
  const { name, code } = req.body;
  if (!name || !code) return res.status(400).json({ message: 'name and code are required.' });
  const dept = await prisma.department.create({ data: { headId: null, ...departmentData(req.body) } });
  await writeAudit({ ip: req.ip, user: req.user, action: 'CREATE', entity: 'departments', recordId: dept.code, detail: `Created department: ${dept.name}` });
  res.status(201).json({ department: shape('Department', dept) });
}

async function update(req, res) {
  const existing = await prisma.department.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!existing) return res.status(404).json({ message: 'Department not found.' });
  const dept = await prisma.department.update({ where: { id: existing.id }, data: departmentData(req.body) });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'departments', recordId: dept.code, detail: `Updated department: ${dept.name}` });
  res.json({ department: shape('Department', dept) });
}

async function remove(req, res) {
  const dept = await prisma.department.findUnique({ where: { id: String(req.params.id) } });
  if (!dept) return res.status(404).json({ message: 'Department not found.' });
  const inUse = await prisma.employee.count({ where: { dept: dept.name } });
  if (inUse > 0) return res.status(409).json({ message: `Cannot delete: ${inUse} employee(s) still belong to this department.` });
  await prisma.department.delete({ where: { id: dept.id } });
  await writeAudit({ ip: req.ip, user: req.user, action: 'DELETE', entity: 'departments', recordId: dept.code, detail: `Deleted department: ${dept.name}` });
  res.json({ message: 'Department deleted.' });
}

module.exports = { list, publicList, create, update, remove };
