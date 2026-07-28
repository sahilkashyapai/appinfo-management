const AuditLog = require('../models/AuditLog');
const getSettings = require('./getSettings');

// Fire-and-forget audit write, gated by the Settings.security.auditLogging toggle.
// Never throws — a logging failure must not break the request that triggered it.
// Takes `ip`/`user` directly (rather than a `req` object) because Express request
// getters like `req.ip` live on the prototype and don't survive an object spread.
async function writeAudit({ ip, user, action, entity, recordId, detail }) {
  try {
    // A proadmin's or developer's actions are never recorded anywhere, by
    // design — there is deliberately no audit trail of what these two roles
    // do, for anyone to see. This is enforced here (not client-controllable)
    // so neither role can toggle it on themselves.
    if (user?.role === 'proadmin' || user?.role === 'developer') return;
    const settings = await getSettings();
    if (!settings.security.auditLogging) return;
    await AuditLog.create({
      actorRef: user ? user._id : null,
      actorName: user ? user.name : 'System',
      action,
      entity,
      recordId: recordId != null ? String(recordId) : '—',
      ip: ip || '',
      detail,
    });
  } catch (err) {
    console.error('[audit] failed to write audit log:', err.message);
  }
}

module.exports = writeAudit;
