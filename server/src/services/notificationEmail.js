const prisma = require('../db/prisma');
const getSettings = require('../utils/getSettings');
const { sendMail } = require('./emailService');

// Every in-app notification is mirrored to email automatically (see
// services/notify.js) — no controller has to remember to
// send one. Chat is skipped: a mail per message would flood inboxes.
const SKIP_TYPES = ['chat'];

// Broadcasts (recipientId: null) go to everyone, so only company-wide news is
// emailed. For birthday/anniversary the celebrant (aboutEmployeeId) is left
// out — they already get their own personal wish mail from cronJobs.js.
const BROADCAST_EMAIL_TYPES = ['announcement', 'hiring', 'event', 'birthday', 'anniversary'];

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function appUrl(link) {
  const origin = (process.env.CLIENT_ORIGIN || '').split(',')[0].trim().replace(/\/$/, '');
  if (!origin) return '';
  return `${origin}${link || '/'}`;
}

function renderEmail(notification, recipientName) {
  const url = appUrl(notification.link);
  const companyName = process.env.SMTP_FROM_NAME || 'Applied Information India';
  const html = `
<div style="font-family:Segoe UI,Arial,sans-serif;background:#f4f6f9;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e3e8ef">
    <div style="background:#2e86ab;color:#fff;padding:14px 20px;font-size:15px;font-weight:700">${escapeHtml(companyName)}</div>
    <div style="padding:20px;color:#1f2d3d;font-size:14px;line-height:1.55">
      ${recipientName ? `<p style="margin:0 0 12px">Hi <strong>${escapeHtml(recipientName)}</strong>,</p>` : ''}
      <p style="margin:0 0 8px;font-size:16px;font-weight:700">${escapeHtml(notification.title)}</p>
      <p style="margin:0 0 18px;white-space:pre-line">${escapeHtml(notification.body)}</p>
      ${url ? `<a href="${escapeHtml(url)}" style="display:inline-block;background:#2e86ab;color:#fff;text-decoration:none;padding:9px 18px;border-radius:6px;font-weight:600">Open in portal</a>` : ''}
    </div>
    <div style="padding:12px 20px;font-size:11px;color:#8a97a8;border-top:1px solid #eef1f5">This is an automated notification. Please do not reply.</div>
  </div>
</div>`;
  return { subject: notification.title, html };
}

async function emailForNotification(notification) {
  if (notification.isDemo || SKIP_TYPES.includes(notification.type)) return;

  const settings = await getSettings();
  if (!settings.notifications.emailDelivery) return;

  if (notification.recipientId) {
    const user = await prisma.user.findUnique({ where: { id: notification.recipientId }, select: { name: true, email: true, isActive: true } });
    if (!user || !user.isActive || !user.email) return;
    const { subject, html } = renderEmail(notification, user.name);
    await sendMail({ to: user.email, subject, html });
    return;
  }

  if (!BROADCAST_EMAIL_TYPES.includes(notification.type)) return;
  const users = await prisma.user.findMany({ where: { isActive: true, email: { not: '' } }, select: { email: true } });
  let excluded = '';
  if (notification.aboutEmployeeId) {
    const about = await prisma.employee.findUnique({ where: { id: notification.aboutEmployeeId }, select: { email: true } });
    excluded = String(about?.email || '').toLowerCase();
  }
  const emails = [...new Set(users.map((u) => u.email).filter((e) => e && e.toLowerCase() !== excluded))];
  if (!emails.length) return;
  // One mail with everyone in BCC, so recipients don't see each other's addresses.
  const { subject, html } = renderEmail(notification);
  await sendMail({ to: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER, bcc: emails, subject, html });
}

module.exports = { emailForNotification };
