const { Schema, model } = require('mongoose');

const auditLogSchema = new Schema(
  {
    actorRef: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, default: 'System' },
    action: { type: String, enum: ['LOGIN', 'LOGIN_FAILED', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT'], required: true },
    entity: { type: String, required: true },
    recordId: { type: String, default: '—' },
    ip: { type: String, default: '' },
    detail: { type: String, default: '' },
  },
  { timestamps: true }
);

// Immutable log: no update/delete routes are exposed for this model anywhere in the API.
module.exports = model('AuditLog', auditLogSchema);
