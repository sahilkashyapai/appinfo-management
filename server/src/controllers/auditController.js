const AuditLog = require('../models/AuditLog');

function buildFilter(query) {
  const { action, entity, q, from, to } = query;
  const filter = {};
  if (action && action !== 'all') filter.action = action;
  if (entity && entity !== 'all') filter.entity = entity;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  if (q) {
    const re = new RegExp(q, 'i');
    filter.$or = [{ actorName: re }, { entity: re }, { detail: re }, { recordId: re }];
  }
  return filter;
}

async function list(req, res) {
  const filter = buildFilter(req.query);
  const { page = 1, limit = 25 } = req.query;
  const pg = Math.max(parseInt(page, 10) || 1, 1);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((pg - 1) * lim)
      .limit(lim),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ items, total, page: pg, pages: Math.ceil(total / lim) || 1 });
}

async function exportCsv(req, res) {
  const filter = buildFilter(req.query);
  const items = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(5000);
  const header = 'Timestamp,Actor,Action,Entity,RecordId,IP,Detail\n';
  const rows = items
    .map((l) =>
      [l.createdAt.toISOString(), l.actorName, l.action, l.entity, l.recordId, l.ip, `"${(l.detail || '').replace(/"/g, '""')}"`].join(',')
    )
    .join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
  res.send(header + rows);
}

module.exports = { list, exportCsv };
