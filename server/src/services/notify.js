const prisma = require('../db/prisma');
const { shape } = require('../db/shape');
const { emailForNotification } = require('./notificationEmail');

// The only way the app creates in-app notifications. On MongoDB a post-save
// hook mirrored every new notification to email; Prisma has no model hooks,
// so creation and the email go through here instead. `data` uses Prisma
// column names: recipientId (null = broadcast), aboutEmployeeId, etc.
async function createNotification(data) {
  const row = await prisma.notification.create({ data: { ...data, recipientId: data.recipientId ? String(data.recipientId) : null } });
  emailForNotification(row).catch((err) => console.error('[email] notification mail failed:', err.message));
  return shape('Notification', row);
}

// One notification per recipient (same content), e.g. "notify all admins".
async function createNotifications(recipientIds, data) {
  const ids = [...new Set((recipientIds || []).filter(Boolean).map(String))];
  return Promise.all(ids.map((recipientId) => createNotification({ ...data, recipientId })));
}

module.exports = { createNotification, createNotifications };
