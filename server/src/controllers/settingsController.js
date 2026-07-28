const getSettings = require('../utils/getSettings');
const writeAudit = require('../utils/audit');
const { sendMail, templates } = require('../services/emailService');

async function get(req, res) {
  const settings = await getSettings();
  res.json({ settings });
}

// Public (no auth) — the login/signup/apply screens and the sidebar need the
// company name/logo/favicon before a user is signed in.
async function getBranding(req, res) {
  const settings = await getSettings();
  res.json({ branding: settings.branding });
}

const IMAGE_FIELDS = ['logoUrl', 'faviconUrl', 'bannerUrl'];

async function updateBranding(req, res) {
  const { companyName, logoUrl, faviconUrl, bannerUrl } = req.body;
  const updates = {};
  if (companyName !== undefined) {
    if (!String(companyName).trim()) return res.status(400).json({ message: 'Company name cannot be empty.' });
    updates.companyName = String(companyName).trim();
  }
  const imageInputs = { logoUrl, faviconUrl, bannerUrl };
  for (const field of IMAGE_FIELDS) {
    const value = imageInputs[field];
    if (value === undefined) continue;
    if (value && !value.startsWith('data:image/')) return res.status(400).json({ message: 'Invalid image data.' });
    updates[field] = value;
  }

  const settings = await getSettings();
  settings.branding = { ...(settings.branding.toObject?.() ?? settings.branding), ...updates };
  await settings.save();
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'settings', recordId: 'branding', detail: 'Updated company branding' });
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
  getBranding,
  updateBranding,
  updateNotifications: updateSection('notifications'),
  updateIntegrations: updateSection('integrations'),
  updateSmtp: updateSection('smtp'),
  updateSecurity: updateSection('security'),
  updateTimeTracking: updateSection('timeTracking'),
  updateLeavePolicy: updateSection('leavePolicy'),
  sendTestEmail,
};
