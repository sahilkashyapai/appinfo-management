const { Schema, model } = require('mongoose');

const notificationSchema = new Schema(
  {
    recipientRef: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // null = broadcast to everyone
    icon: { type: String, default: 'fa-solid fa-bell' }, // Font Awesome icon class
    bg: { type: String, default: '#EBF5FB' },
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: { type: String, default: 'info' },
    link: { type: String, default: '' }, // client-side relative path to open on click, e.g. '/leave'
    isRead: { type: Boolean, default: false },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }], // for broadcast notifications
    clearedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }], // broadcasts can't be deleted (shared), so "Clear All" hides them per-viewer instead
    isDemo: { type: Boolean, default: false },
    // The employee a broadcast is about (birthday/anniversary) — they get their
    // own personal wish mail, so the "today is X's birthday" mail skips them.
    aboutEmployeeRef: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
  },
  { timestamps: true }
);

// Every newly created notification is mirrored to email in the background
// (see services/notificationEmail.js). insertMany (used only by seeds) skips
// save hooks, so seeding never sends mail.
notificationSchema.pre('save', function markNew(next) {
  this.$locals.wasNew = this.isNew;
  next();
});

notificationSchema.post('save', function sendEmail(doc) {
  if (!doc.$locals.wasNew) return;
  // Required lazily to avoid a circular require (the service loads User/Settings).
  const { emailForNotification } = require('../services/notificationEmail');
  emailForNotification(doc).catch((err) => console.error('[email] notification mail failed:', err.message));
});

module.exports = model('Notification', notificationSchema);
