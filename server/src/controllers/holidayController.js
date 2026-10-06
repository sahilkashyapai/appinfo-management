const { prisma, shape, shapeMany } = require('../db');
const writeAudit = require('../utils/audit');

async function list(req, res) {
  const items = await prisma.holiday.findMany({ orderBy: { date: 'asc' } });
  res.json({ items: shapeMany('Holiday', items) });
}

async function create(req, res) {
  const { name, date, type, description } = req.body;
  if (!name || !date) return res.status(400).json({ message: 'name and date are required.' });
  const holiday = await prisma.holiday.create({
    data: { name: String(name).trim(), date: new Date(date), type: type || 'National', description: description ?? '' },
  });
  await writeAudit({ ip: req.ip, user: req.user, action: 'CREATE', entity: 'holidays', recordId: holiday.id, detail: `Created holiday: ${holiday.name}` });
  res.status(201).json({ holiday: shape('Holiday', holiday) });
}

async function update(req, res) {
  // Whitelisted — Prisma rejects unknown fields that Mongo silently ignored.
  const { name, date, type, description } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (date) updates.date = new Date(date);
  if (type !== undefined) updates.type = type;
  if (description !== undefined) updates.description = description ?? '';

  const existing = await prisma.holiday.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!existing) return res.status(404).json({ message: 'Holiday not found.' });
  const holiday = await prisma.holiday.update({ where: { id: existing.id }, data: updates });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'holidays', recordId: holiday.id, detail: `Updated holiday: ${holiday.name}` });
  res.json({ holiday: shape('Holiday', holiday) });
}

async function remove(req, res) {
  const existing = await prisma.holiday.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!existing) return res.status(404).json({ message: 'Holiday not found.' });
  const holiday = await prisma.holiday.delete({ where: { id: existing.id } });
  await writeAudit({ ip: req.ip, user: req.user, action: 'DELETE', entity: 'holidays', recordId: holiday.id, detail: `Deleted holiday: ${holiday.name}` });
  res.json({ message: 'Holiday deleted.' });
}

module.exports = { list, create, update, remove };
