const prisma = require('../db/prisma');

// Same defaults the Mongoose Settings schema had. MySQL can't default a JSON
// column, so they're merged in here over whatever is stored.
const DEFAULTS = {
  notifications: { birthday: true, anniversary: true, eventReminder7: true, eventReminder1: true, emailDelivery: true, browserPush: false },
  integrations: { teams: false, slack: false, whatsapp: false },
  smtp: { host: 'smtp.gmail.com', port: 587, fromEmail: 'noreply@appliedinformation.in', fromName: 'Applied Information India' },
  security: { accountLockout: true, twoFactor: false, sessionTimeoutMins: 30, auditLogging: true, csrfProtection: true },
  timeTracking: { enabled: false },
  leavePolicy: { allocations: { casual: 12, sick: 10, earned: 15 }, blockOverlapping: true },
  branding: {
    companyName: 'Applied Information India',
    logoUrl: '',
    faviconUrl: '',
    bannerUrl: '',
    primaryColor: '#2E86AB',
    secondaryColor: '#1E3A5F',
  },
  // Salary slips (see services/payroll.js). Every value is editable by HR from
  // the Payroll page. `offices` is keyed by Employee.location; an empty
  // companyName falls back to branding.companyName on the slip. Statutory
  // deductions (PF/ESI/PT) only apply to offices with `statutory: true`.
  payroll: {
    offices: {
      'Mohali, India': { currency: 'INR', companyName: '', address: '', phone: '', statutory: true },
      'Alpharetta, United States': { currency: 'USD', companyName: '', address: '', phone: '', statutory: false },
      'Cape Town, South Africa': { currency: 'ZAR', companyName: '', address: '', phone: '', statutory: false },
    },
    pf: { enabled: true, ratePct: 12, applyWageCeiling: true, wageCeiling: 15000 },
    esi: { enabled: true, ratePct: 0.75, grossThreshold: 21000 },
    pt: { enabled: true, monthlyAmount: 200, annualIncomeThreshold: 250000 },
    lopBasis: 'calendar', // 'calendar' | 'working' | 'fixed30' - per-day pay = gross ÷ these days
    defaultEarnings: [{ name: 'Basic', isBasic: true }, { name: 'HRA' }, { name: 'Special Allowance' }],
    defaultDeductions: [{ name: 'TDS' }],
    footerNote: 'This is a computer-generated salary slip and does not require a signature.',
  },
};

const SECTIONS = Object.keys(DEFAULTS);

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function mergeDefaults(defaults, stored) {
  const out = { ...defaults };
  if (!isPlainObject(stored)) return out;
  for (const [key, value] of Object.entries(stored)) {
    out[key] = isPlainObject(defaults[key]) && isPlainObject(value) ? mergeDefaults(defaults[key], value) : value;
  }
  return out;
}

function toSettings(row) {
  const settings = { _id: row.id, id: row.id, singletonKey: row.singletonKey, createdAt: row.createdAt, updatedAt: row.updatedAt };
  for (const section of SECTIONS) settings[section] = mergeDefaults(DEFAULTS[section], row[section]);
  return settings;
}

// Fetches the singleton settings row (creating it with defaults on first use)
// as a plain object with every section fully populated.
async function getSettings() {
  const row = await prisma.settings.upsert({
    where: { singletonKey: 'global' },
    update: {},
    create: { singletonKey: 'global', ...DEFAULTS },
  });
  return toSettings(row);
}

// Shallow-merges `patch` into one settings section and saves it, returning the
// full updated settings - same semantics as the old `settings[section] = {...}`.
async function updateSettingsSection(section, patch) {
  if (!SECTIONS.includes(section)) throw new Error(`Unknown settings section: ${section}`);
  const current = await getSettings();
  const row = await prisma.settings.update({
    where: { singletonKey: 'global' },
    data: { [section]: { ...current[section], ...patch } },
  });
  return toSettings(row);
}

module.exports = getSettings;
module.exports.updateSettingsSection = updateSettingsSection;
module.exports.SETTINGS_DEFAULTS = DEFAULTS;
