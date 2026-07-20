const { Schema, model } = require('mongoose');

// Singleton document — always upserted against a fixed key so there is exactly one Settings row.
const settingsSchema = new Schema(
  {
    singletonKey: { type: String, default: 'global', unique: true },
    notifications: {
      birthday: { type: Boolean, default: true },
      anniversary: { type: Boolean, default: true },
      eventReminder7: { type: Boolean, default: true },
      eventReminder1: { type: Boolean, default: true },
      emailDelivery: { type: Boolean, default: true },
      browserPush: { type: Boolean, default: false },
    },
    integrations: {
      teams: { type: Boolean, default: false },
      slack: { type: Boolean, default: false },
      whatsapp: { type: Boolean, default: false },
    },
    // Non-secret display fields only. Real SMTP credentials always come from server/.env.
    smtp: {
      host: { type: String, default: 'smtp.gmail.com' },
      port: { type: Number, default: 587 },
      fromEmail: { type: String, default: 'noreply@appliedinformation.in' },
      fromName: { type: String, default: 'Applied Information India' },
    },
    security: {
      accountLockout: { type: Boolean, default: true },
      twoFactor: { type: Boolean, default: false },
      sessionTimeoutMins: { type: Number, default: 30 },
      auditLogging: { type: Boolean, default: true },
      // Stored/informational only: auth uses Bearer JWT (not cookies), so classic
      // double-submit-cookie CSRF defense isn't an applicable attack vector here.
      csrfProtection: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

module.exports = model('Settings', settingsSchema);
