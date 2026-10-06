const cron = require('node-cron');
const { prisma, shape } = require('../db');
const getSettings = require('../utils/getSettings');
const { ADMIN_ROLES } = require('../utils/roles');
const { autoStopIfExpired } = require('../utils/timeTracking');
const { sendMail, templates } = require('./emailService');
const { broadcastPush } = require('./pushService');
const { createNotification, createNotifications } = require('./notify');
const { yearsSince } = require('../controllers/employeeController');

// Fixed-date national holidays — same Gregorian date every year, safe to auto-create.
const FIXED_NATIONAL_HOLIDAYS = [
  { name: 'Republic Day', month: 0, day: 26 },
  { name: 'Independence Day', month: 7, day: 15 },
  { name: "Mahatma Gandhi's Birthday", month: 9, day: 2 },
];

function isSameMonthDay(date, ref) {
  return date.getMonth() === ref.getMonth() && date.getDate() === ref.getDate();
}

async function alreadyNotifiedToday(title) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return prisma.notification.findFirst({ where: { title, createdAt: { gte: startOfDay } }, select: { id: true } });
}

async function runBirthdayAndAnniversaryJob() {
  const settings = await getSettings();
  const today = new Date();
  const employees = await prisma.employee.findMany({ where: { status: 'active' } });

  for (const emp of employees) {
    if (settings.notifications.birthday && isSameMonthDay(emp.dob, today)) {
      const title = `Birthday: ${emp.name}`;
      if (!(await alreadyNotifiedToday(title))) {
        const body = `Today is ${emp.name}'s birthday! Be the first to wish them.`;
        await createNotification({ icon: 'fa-solid fa-cake-candles', bg: '#FDEBD0', type: 'birthday', title, body, link: '/wall', aboutEmployeeId: emp.id });
        broadcastPush({ title, body, url: '/wall' }).catch((e) => console.error('[push] birthday broadcast failed', e));
        if (settings.notifications.emailDelivery && emp.email) {
          const { subject, html } = templates.birthday(emp.name);
          await sendMail({ to: emp.email, subject, html });
        }
      }
    }

    const years = yearsSince(emp.joined);
    if (settings.notifications.anniversary && years >= 1 && isSameMonthDay(emp.joined, today)) {
      const title = `Anniversary: ${emp.name} – ${years} Year${years === 1 ? '' : 's'}!`;
      if (!(await alreadyNotifiedToday(title))) {
        const body = `${emp.name} completes ${years} year${years === 1 ? '' : 's'} at Applied Information India today.`;
        await createNotification({ icon: 'fa-solid fa-trophy', bg: '#D5F5E3', type: 'anniversary', title, body, link: '/wall', aboutEmployeeId: emp.id });
        broadcastPush({ title, body, url: '/wall' }).catch((e) => console.error('[push] anniversary broadcast failed', e));
        if (settings.notifications.emailDelivery && emp.email) {
          const { subject, html } = templates.anniversary(emp.name, years);
          await sendMail({ to: emp.email, subject, html });
        }
      }
    }
  }
  console.log(`[cron] birthday/anniversary check ran at ${today.toISOString()}`);
}

async function runEventReminderJob() {
  const settings = await getSettings();
  const events = await prisma.event.findMany({ where: { status: 'published' } });
  const now = new Date();
  const oneDayMs = 24 * 60 * 60 * 1000;

  for (const event of events) {
    const daysLeft = Math.round((event.date - now) / oneDayMs);
    const shouldRemind =
      (daysLeft === 7 && settings.notifications.eventReminder7) || (daysLeft === 1 && settings.notifications.eventReminder1);
    if (!shouldRemind) continue;

    const title = `Reminder: ${event.title} (${daysLeft} day${daysLeft === 1 ? '' : 's'})`;
    if (await alreadyNotifiedToday(title)) continue;

    const body = `${event.title} is on ${event.date.toDateString()}, ${event.venue}.`;
    await createNotification({ icon: 'fa-solid fa-calendar-days', bg: '#EBF5FB', type: 'event', title, body, link: '/events' });
    broadcastPush({ title, body, url: '/events' }).catch((e) => console.error('[push] event reminder broadcast failed', e));
  }
  console.log(`[cron] event reminder check ran at ${now.toISOString()}`);
}

async function runYearlyHolidayRolloverJob() {
  const now = new Date();
  const nextYear = now.getFullYear() + 1;
  let created = 0;

  for (const h of FIXED_NATIONAL_HOLIDAYS) {
    const date = new Date(nextYear, h.month, h.day);
    const exists = await prisma.holiday.findFirst({ where: { name: h.name, date }, select: { id: true } });
    if (exists) continue;
    await prisma.holiday.create({ data: { name: h.name, date, type: 'National', description: '' } });
    created += 1;
  }

  // Festival dates shift every year (lunar calendar) — carry the name/month/day over as a
  // placeholder so the holiday isn't forgotten, but flag it for an admin to verify the real date.
  const thisYearFestivals = await prisma.holiday.findMany({
    where: {
      type: 'Festival',
      date: { gte: new Date(now.getFullYear(), 0, 1), lt: new Date(now.getFullYear() + 1, 0, 1) },
    },
  });
  for (const f of thisYearFestivals) {
    const date = new Date(nextYear, f.date.getMonth(), f.date.getDate());
    const exists = await prisma.holiday.findFirst({
      where: { name: f.name, date: { gte: new Date(nextYear, 0, 1), lt: new Date(nextYear + 1, 0, 1) } },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.holiday.create({
      data: {
        name: f.name,
        date,
        type: 'Festival',
        description: `Placeholder date carried over from ${now.getFullYear()} — verify and correct the official ${nextYear} date.`,
      },
    });
    created += 1;
  }

  if (created > 0) {
    const admins = await prisma.user.findMany({ where: { role: { in: ADMIN_ROLES } }, select: { id: true } });
    const title = `Holiday calendar for ${nextYear} needs review`;
    const body = `${created} holiday(s) for ${nextYear} were auto-added. Festival dates are placeholders carried over from ${now.getFullYear()} — please verify and correct them.`;
    await createNotifications(
      admins.map((a) => a.id),
      { icon: 'fa-solid fa-umbrella-beach', bg: '#FEF9E7', type: 'holiday', title, body, link: '/holidays' }
    );
  }

  console.log(`[cron] yearly holiday rollover ran at ${now.toISOString()} — created ${created} holiday(s) for ${nextYear}`);
}

async function runTimeTrackingAutoStopJob() {
  const openTimers = await prisma.timeLog.findMany({ where: { status: { not: 'stopped' } } });
  for (const timer of openTimers) {
    await autoStopIfExpired(shape('TimeLog', timer));
  }
  console.log(`[cron] time-tracking auto-stop sweep checked ${openTimers.length} open timer(s)`);
}

function startCronJobs() {
  // Daily at 08:00 — birthday & anniversary notifications/emails.
  cron.schedule('0 8 * * *', () => runBirthdayAndAnniversaryJob().catch((e) => console.error('[cron] birthday job failed', e)));
  // Daily at 09:00 — event D-7/D-1 reminders.
  cron.schedule('0 9 * * *', () => runEventReminderJob().catch((e) => console.error('[cron] event reminder job failed', e)));
  // Every 15 minutes — auto-stop any work timer that's been running 10+ hours.
  cron.schedule('*/15 * * * *', () => runTimeTrackingAutoStopJob().catch((e) => console.error('[cron] time-tracking auto-stop job failed', e)));
  // Once a year, Dec 1st at 07:00 — roll next year's holiday calendar forward.
  cron.schedule('0 7 1 12 *', () => runYearlyHolidayRolloverJob().catch((e) => console.error('[cron] yearly holiday rollover job failed', e)));
  console.log('[cron] scheduled daily birthday/anniversary (08:00), event reminder (09:00), time-tracking auto-stop (every 15 min), and yearly holiday rollover (Dec 1, 07:00) jobs');
}

module.exports = {
  startCronJobs,
  runBirthdayAndAnniversaryJob,
  runEventReminderJob,
  runTimeTrackingAutoStopJob,
  runYearlyHolidayRolloverJob,
};
