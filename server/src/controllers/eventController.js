const { prisma, shape, shapeMany, sel } = require('../db');
const writeAudit = require('../utils/audit');
const { excludeSuperadminEmployees } = require('../utils/hideSuperadmin');

const EVENT_TYPES = ['festival', 'workshop', 'town_hall', 'team_outing', 'sports', 'birthday', 'other'];
const EVENT_STATUSES = ['draft', 'published'];

async function withRsvpCounts(events, employeeRef) {
  const ids = events.map((e) => e.id);
  const counts = await prisma.rsvp.groupBy({
    by: ['eventId'],
    where: { eventId: { in: ids }, status: 'yes' },
    _count: { _all: true },
  });
  const map = Object.fromEntries(counts.map((c) => [String(c.eventId), c._count._all]));

  let myRsvpMap = {};
  if (employeeRef) {
    const mine = await prisma.rsvp.findMany({
      where: { eventId: { in: ids }, employeeId: String(employeeRef) },
      select: { eventId: true, status: true },
    });
    myRsvpMap = Object.fromEntries(mine.map((r) => [String(r.eventId), r.status]));
  }

  return events.map((e) => ({ ...shape('Event', e), rsvp: map[String(e.id)] || 0, myRsvp: myRsvpMap[String(e.id)] || null }));
}

async function list(req, res) {
  const { type, status } = req.query;
  const where = {};
  // An unknown type/status matched nothing on Mongo; Prisma would reject it.
  if (type && type !== 'all') {
    if (!EVENT_TYPES.includes(type)) return res.json({ items: [] });
    where.type = type;
  }
  if (status && status !== 'all') {
    if (!EVENT_STATUSES.includes(status)) return res.json({ items: [] });
    where.status = status;
  }
  const events = await prisma.event.findMany({ where, orderBy: { date: 'asc' } });
  res.json({ items: await withRsvpCounts(events, req.user.employeeRef) });
}

async function getOne(req, res) {
  const event = await prisma.event.findUnique({ where: { id: String(req.params.id) } });
  if (!event) return res.status(404).json({ message: 'Event not found.' });
  const [items] = await withRsvpCounts([event], req.user.employeeRef);
  res.json({ event: items });
}

function toCapacity(v) {
  return parseInt(v, 10) || 100;
}

async function create(req, res) {
  const { title, type, date, venue, status, emoji, color, capacity } = req.body;
  if (!title || !date) return res.status(400).json({ message: 'title and date are required.' });
  const event = await prisma.event.create({
    data: {
      title: String(title).trim(),
      type: type || 'other',
      date: new Date(date),
      venue: venue ? String(venue).trim() : '',
      status: status || 'draft',
      emoji: emoji || 'fa-solid fa-calendar-days',
      color: color || '#2E86AB',
      capacity: toCapacity(capacity),
      createdById: String(req.user._id),
    },
  });
  await writeAudit({ ip: req.ip, user: req.user, action: 'CREATE', entity: 'events', recordId: event.id, detail: `Created event: ${event.title}` });
  res.status(201).json({ event: shape('Event', event) });
}

// Whitelist of editable columns (Mongo silently ignored unknown body fields).
function updateData(body) {
  const data = {};
  if (body.title !== undefined) data.title = String(body.title).trim();
  if (body.venue !== undefined) data.venue = String(body.venue || '').trim();
  for (const key of ['type', 'status', 'emoji', 'color']) if (body[key] !== undefined) data[key] = body[key];
  if (body.date) data.date = new Date(body.date);
  if (body.capacity !== undefined) data.capacity = toCapacity(body.capacity);
  return data;
}

async function update(req, res) {
  const existing = await prisma.event.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!existing) return res.status(404).json({ message: 'Event not found.' });
  const event = await prisma.event.update({ where: { id: existing.id }, data: updateData(req.body) });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'events', recordId: event.id, detail: `Updated event: ${event.title}` });
  res.json({ event: shape('Event', event) });
}

async function publish(req, res) {
  const existing = await prisma.event.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!existing) return res.status(404).json({ message: 'Event not found.' });
  const event = await prisma.event.update({ where: { id: existing.id }, data: { status: 'published' } });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'events', recordId: event.id, detail: `Published event: ${event.title}` });
  res.json({ event: shape('Event', event) });
}

async function remove(req, res) {
  const existing = await prisma.event.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!existing) return res.status(404).json({ message: 'Event not found.' });
  // The event's RSVPs go with it (ON DELETE CASCADE).
  const event = await prisma.event.delete({ where: { id: existing.id } });
  await writeAudit({ ip: req.ip, user: req.user, action: 'DELETE', entity: 'events', recordId: event.id, detail: `Deleted event: ${event.title}` });
  res.json({ message: 'Event deleted.' });
}

async function rsvp(req, res) {
  const { status, employeeId } = req.body;
  if (!['yes', 'maybe', 'no'].includes(status)) return res.status(400).json({ message: 'status must be yes, maybe or no.' });
  const employeeRef = employeeId || req.user.employeeRef;
  if (!employeeRef) return res.status(400).json({ message: 'No employee record linked to this account to RSVP with.' });

  const event = await prisma.event.findUnique({ where: { id: String(req.params.id) }, select: { id: true, title: true } });
  if (!event) return res.status(404).json({ message: 'Event not found.' });

  const respondedAt = new Date();
  const record = await prisma.rsvp.upsert({
    where: { eventId_employeeId: { eventId: event.id, employeeId: String(employeeRef) } },
    update: { status, respondedAt },
    create: { eventId: event.id, employeeId: String(employeeRef), status, respondedAt },
  });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'rsvps', recordId: record.id, detail: `RSVP ${status} for event: ${event.title}` });
  res.json({ rsvp: shape('Rsvp', record) });
}

async function listRsvps(req, res) {
  const where = { eventId: String(req.params.id) };
  await excludeSuperadminEmployees(where, req.user.role);
  const rsvps = await prisma.rsvp.findMany({
    where,
    include: { employeeRef: { select: sel('Employee', 'name dept desig avatarIndex') } },
  });
  res.json({ items: shapeMany('Rsvp', rsvps) });
}

module.exports = { list, getOne, create, update, publish, remove, rsvp, listRsvps };
