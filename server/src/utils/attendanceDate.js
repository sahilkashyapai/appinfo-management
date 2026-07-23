// Attendance/Holiday dates are stored as UTC-midnight for their calendar day
// (a client date-only string like "2026-07-23" parses as UTC midnight, and
// attendance upserts normalize to this too — see attendanceController).
// Every "today" comparison against those stored dates must resolve "today"
// the same way, via UTC getters — a local-timezone startOfDay would compute a
// different instant whenever the server isn't running in UTC, causing
// today's records to silently not match.
function startOfDayUTC(d) {
  const date = new Date(d);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

module.exports = { startOfDayUTC };
