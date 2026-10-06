const { AuditAction } = require('@prisma/client');
const { prisma, shapeMany, likeSafe } = require('../db');

const AUDIT_ACTIONS = Object.values(AuditAction);

async function buildFilter(query) {
  const { action, entity, q, from, to } = query;
  const where = {};
  if (action && action !== 'all') {
    // An unknown action simply matched nothing on MongoDB; Prisma would reject
    // it as an invalid enum value, so filter to zero results instead.
    if (AUDIT_ACTIONS.includes(action)) where.action = action;
    else where.id = { in: [] };
  }
  if (entity && entity !== 'all') where.entity = String(entity);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }
  if (q) {
    const contains = likeSafe(q);
    where.OR = [{ actorName: { contains } }, { entity: { contains } }, { detail: { contains } }, { recordId: { contains } }];
  }
  return where;
}

async function list(req, res) {
  const where = await buildFilter(req.query);
  const { page = 1, limit = 25 } = req.query;
  const pg = Math.max(parseInt(page, 10) || 1, 1);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (pg - 1) * lim,
      take: lim,
    }),
    prisma.auditLog.count({ where }),
  ]);
  res.json({ items: shapeMany('AuditLog', items), total, page: pg, pages: Math.ceil(total / lim) || 1 });
}

async function exportCsv(req, res) {
  const where = await buildFilter(req.query);
  const items = shapeMany('AuditLog', await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 5000 }));
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
