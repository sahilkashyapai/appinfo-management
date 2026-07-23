// One-off script: adds the official Government of India gazetted holiday
// calendar for 2026 to the Holidays panel. This is REAL data (not seeded
// demo/dummy data), so these records are NOT flagged isDemo and won't be
// touched by the "Clear All Dummy Data" button in Settings.
//
// Source: Government of India gazetted holiday list for 2026, cross-checked
// against the Dept. of Empowerment of Persons with Disabilities (niepvd.nic.in)
// and cleartax.in. Dates for Islamic-calendar holidays (Id-ul-Fitr, Id-ul-Zuha,
// Muharram, Id-e-Milad) are officially "tentative" pending moon-sighting and
// may shift by a day.
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Holiday = require('../models/Holiday');

const HOLIDAYS_2026 = [
  { name: 'Republic Day', date: '2026-01-26', type: 'National' },
  { name: 'Holi', date: '2026-03-04', type: 'Festival' },
  { name: 'Id-ul-Fitr', date: '2026-03-21', type: 'Festival', description: 'Date is tentative, subject to moon sighting.' },
  { name: 'Ram Navami', date: '2026-03-26', type: 'Festival' },
  { name: 'Mahavir Jayanti', date: '2026-03-31', type: 'Festival' },
  { name: 'Good Friday', date: '2026-04-03', type: 'Festival' },
  { name: 'Buddha Purnima', date: '2026-05-01', type: 'Festival' },
  { name: 'Id-ul-Zuha (Bakrid)', date: '2026-05-27', type: 'Festival', description: 'Date is tentative, subject to moon sighting.' },
  { name: 'Muharram', date: '2026-06-26', type: 'Festival', description: 'Date is tentative, subject to moon sighting.' },
  { name: 'Independence Day', date: '2026-08-15', type: 'National' },
  { name: 'Id-e-Milad (Milad-un-Nabi)', date: '2026-08-26', type: 'Festival', description: 'Date is tentative, subject to moon sighting.' },
  { name: 'Janmashtami', date: '2026-09-04', type: 'Festival' },
  { name: "Mahatma Gandhi's Birthday", date: '2026-10-02', type: 'National' },
  { name: 'Dussehra', date: '2026-10-20', type: 'Festival' },
  { name: 'Diwali (Deepavali)', date: '2026-11-08', type: 'Festival' },
  { name: "Guru Nanak's Birthday", date: '2026-11-24', type: 'Festival' },
  { name: 'Christmas Day', date: '2026-12-25', type: 'Festival' },
];

async function main() {
  await connectDB();

  let inserted = 0;
  let skipped = 0;
  for (const h of HOLIDAYS_2026) {
    const date = new Date(h.date);
    const exists = await Holiday.findOne({ name: h.name, date });
    if (exists) {
      skipped += 1;
      continue;
    }
    await Holiday.create({ name: h.name, date, type: h.type, description: h.description || '' });
    inserted += 1;
  }

  console.log(`[seed] inserted ${inserted} government holiday(s) for 2026, skipped ${skipped} already present.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
