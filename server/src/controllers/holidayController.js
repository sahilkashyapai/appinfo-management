const Holiday = require('../models/Holiday');
const writeAudit = require('../utils/audit');

async function list(req, res) {
  const items = await Holiday.find({}).sort({ date: 1 });
  res.json({ items });
}

async function create(req, res) {
  const { name, date, type, description } = req.body;
  if (!name || !date) return res.status(400).json({ message: 'name and date are required.' });
  const holiday = await Holiday.create({ name, date: new Date(date), type: type || 'National', description });
  await writeAudit({ ip: req.ip, user: req.user, action: 'CREATE', entity: 'holidays', recordId: holiday._id, detail: `Created holiday: ${holiday.name}` });
  res.status(201).json({ holiday });
}

async function update(req, res) {
  const updates = { ...req.body };
  if (updates.date) updates.date = new Date(updates.date);
  const holiday = await Holiday.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!holiday) return res.status(404).json({ message: 'Holiday not found.' });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'holidays', recordId: holiday._id, detail: `Updated holiday: ${holiday.name}` });
  res.json({ holiday });
}

async function remove(req, res) {
  const holiday = await Holiday.findByIdAndDelete(req.params.id);
  if (!holiday) return res.status(404).json({ message: 'Holiday not found.' });
  await writeAudit({ ip: req.ip, user: req.user, action: 'DELETE', entity: 'holidays', recordId: holiday._id, detail: `Deleted holiday: ${holiday.name}` });
  res.json({ message: 'Holiday deleted.' });
}

module.exports = { list, create, update, remove };
