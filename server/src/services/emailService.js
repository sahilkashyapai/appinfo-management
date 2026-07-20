const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[email] SMTP_HOST/SMTP_USER/SMTP_PASS not set — emails will be logged, not sent.');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

async function sendMail({ to, subject, html }) {
  const t = getTransporter();
  const from = `"${process.env.SMTP_FROM_NAME || 'AII Celebrations'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`;
  if (!t) {
    console.log(`[email:mock] to=${to} subject="${subject}"`);
    return { mocked: true };
  }
  return t.sendMail({ from, to, subject, html });
}

const templates = {
  birthday: (name) => ({
    subject: `🎂 Happy Birthday, ${name}!`,
    html: `<p>Happy Birthday, <strong>${name}</strong>! 🎉</p><p>Wishing you a fantastic year ahead from everyone at Applied Information India.</p>`,
  }),
  anniversary: (name, years) => ({
    subject: `🏆 Congratulations on ${years} year${years === 1 ? '' : 's'}, ${name}!`,
    html: `<p>Congratulations <strong>${name}</strong> on completing <strong>${years}</strong> year${years === 1 ? '' : 's'} with Applied Information India! 🌟</p>`,
  }),
  eventReminder: (title, date, daysLeft) => ({
    subject: `📅 Reminder: ${title} in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
    html: `<p><strong>${title}</strong> is coming up on ${date}. Don't forget to RSVP!</p>`,
  }),
  generic: (title, body) => ({ subject: title, html: `<p>${body}</p>` }),
  registrationApproved: (name) => ({
    subject: '✅ Your AII Celebrations account is active',
    html: `<p>Hi <strong>${name}</strong>,</p><p>Your account has been approved. You can now sign in to the Employee Celebrations &amp; Events Platform with the email and password you registered with.</p>`,
  }),
  registrationRejected: (name, reason) => ({
    subject: 'Your AII Celebrations registration',
    html: `<p>Hi <strong>${name}</strong>,</p><p>We were unable to approve your registration${reason ? `: <strong>${reason}</strong>` : '.'}</p><p>Please contact HR if you believe this is a mistake.</p>`,
  }),
};

module.exports = { sendMail, templates };
