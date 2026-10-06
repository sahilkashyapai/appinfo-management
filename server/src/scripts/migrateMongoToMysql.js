// One-off copy of all data from MongoDB (MONGODB_URI) into MySQL (DATABASE_URL).
//
//   node src/scripts/migrateMongoToMysql.js            # target must be empty
//   node src/scripts/migrateMongoToMysql.js --reset    # empties the MySQL tables first
//
// MongoDB is only read, never written. The copy runs in one MySQL transaction,
// so it either completes fully or leaves MySQL untouched. Mongo ObjectIds are
// kept as the MySQL primary keys, so every reference survives as-is.
// References to documents that no longer exist are logged and then dropped
// (required ref -> row skipped, optional ref -> set to NULL), because MySQL
// foreign keys would reject them.
require('dotenv').config();
const mongoose = require('mongoose');
const { Prisma } = require('@prisma/client');
const prisma = require('../db/prisma');
const { SETTINGS_DEFAULTS } = require('../utils/getSettings');

const RESET = process.argv.includes('--reset');

// Prisma model -> Mongo collection. Order = insert order (parents first).
const COLLECTIONS = [
  ['Department', 'departments'],
  ['Employee', 'employees'],
  ['User', 'users'],
  ['Holiday', 'holidays'],
  ['Event', 'events'],
  ['Rsvp', 'rsvps'],
  ['Announcement', 'announcements'],
  ['Attendance', 'attendances'],
  ['AttendanceCorrectionRequest', 'attendancecorrectionrequests'],
  ['LeaveRequest', 'leaverequests'],
  ['TimeLog', 'timelogs'],
  ['Document', 'documents'],
  ['DocumentRequest', 'documentrequests'],
  ['Asset', 'assets'],
  ['Notification', 'notifications'],
  ['PushSubscription', 'pushsubscriptions'],
  ['Conversation', 'conversations'],
  ['Message', 'messages'],
  ['WallPost', 'wallposts'],
  ['JobApplication', 'jobapplications'],
  ['AuditLog', 'auditlogs'],
  ['Settings', 'settings'],
];

// Fields filled in a second pass (circular references between the first three tables).
const DEFERRED = { Department: ['headId'], Employee: ['managerId', 'userId'] };

// Optional refs where NULL means something else, so a dangling ref must skip
// the row rather than be nulled: a notification with recipientId NULL is a
// broadcast to everyone, so a personal one whose user was deleted is dropped.
const SKIP_IF_MISSING = { Notification: ['recipientId'] };

const MODELS = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
const ENUMS = new Map(Prisma.dmmf.datamodel.enums.map((e) => [e.name, new Set(e.values.map((v) => v.name))]));

const warnings = [];
function warn(msg) {
  warnings.push(msg);
}

const idOf = (v) => (v == null ? null : String(v));
const delegate = (model) => prisma[model[0].toLowerCase() + model.slice(1)];

// FK column -> { mongo field name (= relation name), target model, required }
function foreignKeys(model) {
  const m = MODELS.get(model);
  const fks = new Map();
  for (const f of m.fields) {
    if (f.kind === 'object' && !f.isList && f.relationFromFields?.length === 1) {
      const fk = f.relationFromFields[0];
      const fkField = m.fields.find((x) => x.name === fk);
      fks.set(fk, { source: f.name, target: f.type, required: fkField.isRequired });
    }
  }
  return fks;
}

function convertScalar(field, value) {
  if (value === undefined || value === null) return value;
  switch (field.type) {
    case 'DateTime': {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    case 'Int':
      return Math.trunc(Number(value));
    case 'Float':
      return Number(value);
    case 'BigInt':
      return BigInt(Math.trunc(Number(value)));
    case 'Boolean':
      return Boolean(value);
    case 'String':
      return typeof value === 'string' ? value : String(value);
    default:
      return value;
  }
}

// Mongo document -> Prisma `data` for the model's own columns, or null to skip the row.
function toRow(model, doc, ids) {
  const m = MODELS.get(model);
  const fks = foreignKeys(model);
  const deferred = DEFERRED[model] || [];
  const row = { id: idOf(doc._id) };

  for (const f of m.fields) {
    if (f.kind === 'object' || f.name === 'id') continue;
    if (fks.has(f.name)) {
      if (deferred.includes(f.name)) continue;
      const { source, target, required } = fks.get(f.name);
      const ref = idOf(doc[source]);
      if (ref && !ids[target].has(ref)) {
        if (required || SKIP_IF_MISSING[model]?.includes(f.name)) {
          warn(`${model} ${row.id}: ${source} -> missing ${target} ${ref}; row skipped`);
          return null;
        }
        warn(`${model} ${row.id}: ${source} -> missing ${target} ${ref}; set to NULL`);
        row[f.name] = null;
      } else if (ref) {
        row[f.name] = ref;
      } else if (required) {
        warn(`${model} ${row.id}: required ${source} is empty; row skipped`);
        return null;
      } else {
        row[f.name] = null;
      }
      continue;
    }

    let value = convertScalar(f, doc[f.name]);
    if (f.kind === 'enum' && value != null && !ENUMS.get(f.type).has(value)) {
      warn(`${model} ${row.id}: ${f.name} = ${JSON.stringify(value)} is not a valid ${f.type}; using the default`);
      value = undefined;
    }
    if (value === undefined) continue; // let the column default apply
    if (value === null && f.isRequired) {
      if (f.hasDefaultValue) continue;
      warn(`${model} ${row.id}: required ${f.name} is empty; row skipped`);
      return null;
    }
    row[f.name] = value;
  }
  return row;
}

// ─── Model-specific extras (things that aren't 1:1 columns) ────────────────

function settingsRow(doc) {
  const row = { id: idOf(doc._id), singletonKey: doc.singletonKey || 'global' };
  for (const section of Object.keys(SETTINGS_DEFAULTS)) row[section] = { ...SETTINGS_DEFAULTS[section], ...(doc[section] || {}) };
  if (doc.leavePolicy?.allocations) row.leavePolicy.allocations = { ...SETTINGS_DEFAULTS.leavePolicy.allocations, ...doc.leavePolicy.allocations };
  return row;
}

function uniqueValidUsers(list, ids, context) {
  const out = [];
  for (const raw of list || []) {
    const id = idOf(raw);
    if (!id) continue;
    if (!ids.User.has(id)) {
      warn(`${context}: user ${id} no longer exists; dropped`);
      continue;
    }
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');

  await mongoose.connect(process.env.MONGODB_URI);
  const mdb = mongoose.connection.db;
  console.log(`[copy] reading MongoDB database "${mdb.databaseName}"`);

  const source = {};
  for (const [model, coll] of COLLECTIONS) source[model] = await mdb.collection(coll).find({}).toArray();

  // Target must be empty unless --reset.
  const existing = {};
  for (const [model] of COLLECTIONS) existing[model] = await delegate(model).count();
  const nonEmpty = Object.entries(existing).filter(([, n]) => n > 0);
  if (nonEmpty.length && !RESET) {
    throw new Error(`MySQL already has data (${nonEmpty.map(([m, n]) => `${m}: ${n}`).join(', ')}). Re-run with --reset to empty it first.`);
  }
  if (RESET) {
    const tables = await prisma.$queryRaw`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
    for (const { t } of tables) await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${t}\``);
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
    console.log(`[copy] --reset: emptied ${tables.length} MySQL tables`);
  }

  // Ids that will exist once a model is inserted - used to validate references.
  const ids = {};
  for (const [model] of COLLECTIONS) ids[model] = new Set();
  // Pre-register ids for the circular trio so they can reference each other.
  for (const model of ['Department', 'Employee', 'User']) for (const d of source[model]) ids[model].add(idOf(d._id));

  const counts = {};
  const count = (table, n) => (counts[table] = (counts[table] || 0) + n);

  await prisma.$transaction(
    async (tx) => {
      const td = (model) => tx[model[0].toLowerCase() + model.slice(1)];

      for (const [model] of COLLECTIONS) {
        const docs = source[model];
        if (model === 'Settings') {
          for (const d of docs) await tx.settings.create({ data: settingsRow(d) });
          count('settings', docs.length);
          continue;
        }

        const rows = [];
        const kept = [];
        for (const d of docs) {
          const row = toRow(model, d, ids);
          if (!row) {
            if (['Department', 'Employee', 'User'].includes(model)) ids[model].delete(idOf(d._id));
            continue;
          }
          if (model === 'PushSubscription') {
            row.p256dh = d.keys?.p256dh;
            row.auth = d.keys?.auth;
            if (!row.p256dh || !row.auth) {
              warn(`PushSubscription ${row.id}: missing keys; row skipped`);
              continue;
            }
          }
          if (model === 'WallPost' && d.poll?.question) {
            row.pollQuestion = String(d.poll.question);
            row.pollClosesAt = d.poll.closesAt ? new Date(d.poll.closesAt) : null;
          }
          rows.push(row);
          kept.push(d);
          ids[model].add(row.id);
        }
        if (rows.length) await td(model).createMany({ data: rows });
        count(model, rows.length);

        // Children that Mongo kept inside the parent document.
        for (const d of kept) {
          const pid = idOf(d._id);
          if (model === 'LeaveRequest') {
            const data = (d.comments || [])
              .filter((c) => (ids.User.has(idOf(c.authorRef)) ? true : (warn(`LeaveRequest ${pid}: comment by missing user ${idOf(c.authorRef)}; dropped`), false)))
              .map((c) => ({ id: idOf(c._id) || undefined, leaveRequestId: pid, authorId: idOf(c.authorRef), text: String(c.text || ''), createdAt: c.createdAt ? new Date(c.createdAt) : undefined }));
            if (data.length) await tx.leaveComment.createMany({ data });
            count('LeaveComment', data.length);
          }
          if (model === 'Conversation') {
            const data = uniqueValidUsers(d.members, ids, `Conversation ${pid} member`).map((userId) => ({ conversationId: pid, userId }));
            if (data.length) await tx.conversationMember.createMany({ data });
            count('ConversationMember', data.length);
          }
          if (model === 'Message') {
            const att = (d.attachments || []).filter((a) => a?.url).map((a, position) => ({ messageId: pid, position, name: String(a.name || ''), type: String(a.type || ''), url: String(a.url) }));
            if (att.length) await tx.messageAttachment.createMany({ data: att });
            count('MessageAttachment', att.length);
            const reads = uniqueValidUsers(d.readBy, ids, `Message ${pid} readBy`).map((userId) => ({ messageId: pid, userId }));
            if (reads.length) await tx.messageRead.createMany({ data: reads });
            count('MessageRead', reads.length);
          }
          if (model === 'Notification') {
            const reads = uniqueValidUsers(d.readBy, ids, `Notification ${pid} readBy`).map((userId) => ({ notificationId: pid, userId }));
            if (reads.length) await tx.notificationRead.createMany({ data: reads });
            count('NotificationRead', reads.length);
            const clears = uniqueValidUsers(d.clearedBy, ids, `Notification ${pid} clearedBy`).map((userId) => ({ notificationId: pid, userId }));
            if (clears.length) await tx.notificationClear.createMany({ data: clears });
            count('NotificationClear', clears.length);
          }
          if (model === 'WallPost') {
            const comments = (d.comments || [])
              .filter((c) => (ids.User.has(idOf(c.authorRef)) ? true : (warn(`WallPost ${pid}: comment by missing user ${idOf(c.authorRef)}; dropped`), false)))
              .map((c) => ({ id: idOf(c._id) || undefined, postId: pid, authorId: idOf(c.authorRef), text: String(c.text || ''), createdAt: c.createdAt ? new Date(c.createdAt) : undefined }));
            if (comments.length) await tx.wallComment.createMany({ data: comments });
            count('WallComment', comments.length);

            const reactions = [];
            for (const type of ['like', 'love', 'celebrate']) {
              for (const userId of uniqueValidUsers(d.reactions?.[type], ids, `WallPost ${pid} ${type}`)) reactions.push({ postId: pid, userId, type });
            }
            if (reactions.length) await tx.wallReaction.createMany({ data: reactions });
            count('WallReaction', reactions.length);

            if (d.poll?.question) {
              for (const [position, opt] of (d.poll.options || []).entries()) {
                const option = await tx.wallPollOption.create({ data: { postId: pid, position, text: String(opt.text || '') } });
                count('WallPollOption', 1);
                const votes = uniqueValidUsers(opt.votes, ids, `WallPost ${pid} poll option ${position}`).map((userId) => ({ optionId: option.id, userId }));
                if (votes.length) await tx.wallPollVote.createMany({ data: votes });
                count('WallPollVote', votes.length);
              }
            }
          }
        }
      }

      // Second pass: circular references now that all three tables exist.
      for (const d of source.Department) {
        const headId = idOf(d.headRef);
        if (!headId || !ids.Department.has(idOf(d._id))) continue;
        if (!ids.Employee.has(headId)) warn(`Department ${idOf(d._id)}: headRef -> missing Employee ${headId}; left NULL`);
        else await tx.department.update({ where: { id: idOf(d._id) }, data: { headId } });
      }
      for (const d of source.Employee) {
        const id = idOf(d._id);
        if (!ids.Employee.has(id)) continue;
        const data = {};
        const managerId = idOf(d.managerRef);
        const userId = idOf(d.userRef);
        if (managerId) ids.Employee.has(managerId) ? (data.managerId = managerId) : warn(`Employee ${id}: managerRef -> missing Employee ${managerId}; left NULL`);
        if (userId) ids.User.has(userId) ? (data.userId = userId) : warn(`Employee ${id}: userRef -> missing User ${userId}; left NULL`);
        if (Object.keys(data).length) await tx.employee.update({ where: { id }, data });
      }
    },
    { timeout: 10 * 60 * 1000, maxWait: 60 * 1000 }
  );

  // Verification: source vs MySQL counts.
  console.log('\n[copy] table                         mongo  mysql');
  let mismatch = false;
  for (const [model, coll] of COLLECTIONS) {
    const n = await delegate(model).count();
    const flag = n === source[model].length ? '' : '  <-- differs (see warnings)';
    if (flag) mismatch = true;
    console.log(`[copy] ${model.padEnd(28)} ${String(source[model].length).padStart(6)} ${String(n).padStart(6)}${flag}`);
  }
  for (const [table, n] of Object.entries(counts)) {
    if (MODELS.has(table) && !COLLECTIONS.some(([m]) => m === table)) console.log(`[copy]   child ${table.padEnd(22)}        ${String(n).padStart(6)}`);
  }

  if (warnings.length) {
    console.log(`\n[copy] ${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
  console.log(mismatch ? '\n[copy] done, with skipped rows - review the warnings above.' : '\n[copy] done. Every collection copied in full.');
}

main()
  .catch((err) => {
    console.error(`[copy] FAILED - the copy was rolled back${RESET ? ' (tables emptied by --reset stay empty)' : ''}:`, err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });
