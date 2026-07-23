const Holiday = require('../models/Holiday');

// Counts working days (Mon-Fri, excluding declared holidays) in the given
// 'YYYY-MM' month, from day 1 through `throughDay` (inclusive). Omit
// `throughDay` to count the whole month. Uses UTC getters throughout —
// Attendance/Holiday dates are stored as UTC-midnight for their calendar day
// (see attendanceController's startOfDay), so this must match that convention
// regardless of the server process's local timezone.
async function countWorkingDays(y, m, throughDay) {
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lastDay = Math.min(throughDay ?? daysInMonth, daysInMonth);
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m, 1));

  const holidays = await Holiday.find({ date: { $gte: monthStart, $lt: monthEnd } }, 'date');
  const holidayDays = new Set(holidays.map((h) => h.date.getUTCDate()));

  let workingDays = 0;
  for (let day = 1; day <= lastDay; day++) {
    const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (holidayDays.has(day)) continue;
    workingDays++;
  }
  return workingDays;
}

module.exports = { countWorkingDays };
