const { prisma } = require('../db');

async function getPublicKey(req, res) {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
}

async function subscribe(req, res) {
  const { endpoint, keys, userAgent } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ message: 'endpoint and keys.p256dh/keys.auth are required.' });
  }
  // keys {p256dh, auth} are stored as two columns.
  const data = { userId: String(req.user._id), p256dh: String(keys.p256dh), auth: String(keys.auth), userAgent: String(userAgent || '').slice(0, 512) };
  await prisma.pushSubscription.upsert({
    where: { endpoint: String(endpoint) },
    update: data,
    create: { endpoint: String(endpoint), ...data },
  });
  res.status(201).json({ message: 'Subscribed.' });
}

async function unsubscribe(req, res) {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ message: 'endpoint is required.' });
  await prisma.pushSubscription.deleteMany({ where: { endpoint: String(endpoint), userId: String(req.user._id) } });
  res.json({ message: 'Unsubscribed.' });
}

module.exports = { getPublicKey, subscribe, unsubscribe };
