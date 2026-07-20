const cron = require('node-cron');
const Employee = require('../models/Employee');
const Event = require('../models/Event');
const Notification = require('../models/Notification');
const getSettings = require('../utils/getSettings');
const { sendMail, templates } = require('./emailService');
const { yearsSince } = require('../controllers/employeeController');

function isSameMonthDay(date, ref) {
  return date.getMonth() === ref.getMonth() && date.getDate() === ref.getDate();
}

async function alreadyNotifiedToday(title) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return Notification.exists({ title, createdAt: { $gte: startOfDay } });
}

async function runBirthdayAndAnniversaryJob() {
  const settings = await getSettings();
  const today = new Date();
  const employees = await Employee.find({ status: 'active' });

  for (const emp of employees) {
    if (settings.notifications.birthday && isSameMonthDay(emp.dob, today)) {
      const title = `Birthday: ${emp.name}`;
      if (!(await alreadyNotifiedToday(title))) {
        await Notification.create({
          icon: '🎂',
          bg: '#FDEBD0',
          type: 'birthday',
          title,
          body: `Today is ${emp.name}'s birthday! Be the first to wish them.`,
        });
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
        await Notification.create({
          icon: '🏆',
          bg: '#D5F5E3',
          type: 'anniversary',
          title,
          body: `${emp.name} completes ${years} year${years === 1 ? '' : 's'} at Applied Information India today.`,
        });
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
  const events = await Event.find({ status: 'published' });
  const now = new Date();
  const oneDayMs = 24 * 60 * 60 * 1000;

  for (const event of events) {
    const daysLeft = Math.round((event.date - now) / oneDayMs);
    const shouldRemind =
      (daysLeft === 7 && settings.notifications.eventReminder7) || (daysLeft === 1 && settings.notifications.eventReminder1);
    if (!shouldRemind) continue;

    const title = `Reminder: ${event.title} (${daysLeft} day${daysLeft === 1 ? '' : 's'})`;
    if (await alreadyNotifiedToday(title)) continue;

    await Notification.create({
      icon: '📅',
      bg: '#EBF5FB',
      type: 'event',
      title,
      body: `${event.title} is on ${event.date.toDateString()}, ${event.venue}.`,
    });
  }
  console.log(`[cron] event reminder check ran at ${now.toISOString()}`);
}

function startCronJobs() {
  // Daily at 08:00 — birthday & anniversary notifications/emails.
  cron.schedule('0 8 * * *', () => runBirthdayAndAnniversaryJob().catch((e) => console.error('[cron] birthday job failed', e)));
  // Daily at 09:00 — event D-7/D-1 reminders.
  cron.schedule('0 9 * * *', () => runEventReminderJob().catch((e) => console.error('[cron] event reminder job failed', e)));
  console.log('[cron] scheduled daily birthday/anniversary (08:00) and event reminder (09:00) jobs');
}

module.exports = { startCronJobs, runBirthdayAndAnniversaryJob, runEventReminderJob };
