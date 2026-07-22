const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const getSettings = require('../utils/getSettings');

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

async function sendOne(sub, payload) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload));
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      await PushSubscription.deleteOne({ _id: sub._id });
    } else {
      console.error('[push] send failed:', sub.endpoint, err.message);
    }
  }
}

async function pushEnabled() {
  const settings = await getSettings();
  return settings.notifications.browserPush;
}

async function sendPushToUser(userId, payload) {
  if (!ensureConfigured()) return;
  if (!(await pushEnabled())) return;
  const subs = await PushSubscription.find({ userRef: userId });
  await Promise.all(subs.map((sub) => sendOne(sub, payload)));
}

async function sendPushToUsers(userIds, payload) {
  await Promise.all(userIds.map((id) => sendPushToUser(id, payload)));
}

async function broadcastPush(payload) {
  if (!ensureConfigured()) return;
  if (!(await pushEnabled())) return;
  const subs = await PushSubscription.find({});
  await Promise.all(subs.map((sub) => sendOne(sub, payload)));
}

module.exports = { sendPushToUser, sendPushToUsers, broadcastPush };
