const getSettings = require('../utils/getSettings');
const writeAudit = require('../utils/audit');
const { sendMail, templates } = require('../services/emailService');

async function get(req, res) {
  const settings = await getSettings();
  res.json({ settings });
}

function updateSection(section) {
  return async function handler(req, res) {
    const settings = await getSettings();
    settings[section] = { ...settings[section].toObject?.() ?? settings[section], ...req.body };
    await settings.save();
    await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'settings', recordId: section, detail: `Updated ${section} settings` });
    res.json({ settings });
  };
}

async function sendTestEmail(req, res) {
  const settings = await getSettings();
  const { subject, html } = templates.generic('AII Celebrations — Test Email', 'This is a test email confirming your SMTP configuration works.');
  const result = await sendMail({ to: req.user.email, subject, html });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'settings', recordId: 'smtp', detail: 'Sent test email' });
  res.json({ message: result.mocked ? 'SMTP is not configured — email was logged, not sent. Fill in server/.env.' : `Test email sent to ${req.user.email}.`, settings });
}

module.exports = {
  get,
  updateNotifications: updateSection('notifications'),
  updateIntegrations: updateSection('integrations'),
  updateSmtp: updateSection('smtp'),
  updateSecurity: updateSection('security'),
  sendTestEmail,
};
