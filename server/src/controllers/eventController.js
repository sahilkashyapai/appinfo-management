const Event = require('../models/Event');
const Rsvp = require('../models/Rsvp');
const writeAudit = require('../utils/audit');

async function withRsvpCounts(events) {
  const ids = events.map((e) => e._id);
  const counts = await Rsvp.aggregate([
    { $match: { eventRef: { $in: ids }, status: 'yes' } },
    { $group: { _id: '$eventRef', count: { $sum: 1 } } },
  ]);
  const map = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
  return events.map((e) => ({ ...e.toObject(), rsvp: map[String(e._id)] || 0 }));
}

async function list(req, res) {
  const { type, status } = req.query;
  const filter = {};
  if (type && type !== 'all') filter.type = type;
  if (status && status !== 'all') filter.status = status;
  const events = await Event.find(filter).sort({ date: 1 });
  res.json({ items: await withRsvpCounts(events) });
}

async function getOne(req, res) {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ message: 'Event not found.' });
  const [items] = await withRsvpCounts([event]);
  res.json({ event: items });
}

async function create(req, res) {
  const { title, type, date, venue, status, emoji, color, capacity } = req.body;
  if (!title || !date) return res.status(400).json({ message: 'title and date are required.' });
  const event = await Event.create({
    title,
    type: type || 'other',
    date: new Date(date),
    venue,
    status: status || 'draft',
    emoji: emoji || '🎉',
    color: color || '#2E86AB',
    capacity: capacity || 100,
    createdByRef: req.user._id,
  });
  await writeAudit({ ip: req.ip, user: req.user, action: 'CREATE', entity: 'events', recordId: event._id, detail: `Created event: ${event.title}` });
  res.status(201).json({ event });
}

async function update(req, res) {
  const updates = { ...req.body };
  if (updates.date) updates.date = new Date(updates.date);
  const event = await Event.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!event) return res.status(404).json({ message: 'Event not found.' });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'events', recordId: event._id, detail: `Updated event: ${event.title}` });
  res.json({ event });
}

async function publish(req, res) {
  const event = await Event.findByIdAndUpdate(req.params.id, { status: 'published' }, { new: true });
  if (!event) return res.status(404).json({ message: 'Event not found.' });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'events', recordId: event._id, detail: `Published event: ${event.title}` });
  res.json({ event });
}

async function remove(req, res) {
  const event = await Event.findByIdAndDelete(req.params.id);
  if (!event) return res.status(404).json({ message: 'Event not found.' });
  await Rsvp.deleteMany({ eventRef: event._id });
  await writeAudit({ ip: req.ip, user: req.user, action: 'DELETE', entity: 'events', recordId: event._id, detail: `Deleted event: ${event.title}` });
  res.json({ message: 'Event deleted.' });
}

async function rsvp(req, res) {
  const { status, employeeId } = req.body;
  if (!['yes', 'maybe', 'no'].includes(status)) return res.status(400).json({ message: 'status must be yes, maybe or no.' });
  const employeeRef = employeeId || req.user.employeeRef;
  if (!employeeRef) return res.status(400).json({ message: 'No employee record linked to this account to RSVP with.' });

  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ message: 'Event not found.' });

  const record = await Rsvp.findOneAndUpdate(
    { eventRef: event._id, employeeRef },
    { status, respondedAt: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'rsvps', recordId: record._id, detail: `RSVP ${status} for event: ${event.title}` });
  res.json({ rsvp: record });
}

async function listRsvps(req, res) {
  const rsvps = await Rsvp.find({ eventRef: req.params.id }).populate('employeeRef', 'name dept desig');
  res.json({ items: rsvps });
}

module.exports = { list, getOne, create, update, publish, remove, rsvp, listRsvps };
