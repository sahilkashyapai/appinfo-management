const PushSubscription = require('../models/PushSubscription');

async function getPublicKey(req, res) {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
}

async function subscribe(req, res) {
  const { endpoint, keys, userAgent } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ message: 'endpoint and keys.p256dh/keys.auth are required.' });
  }
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { userRef: req.user._id, keys, userAgent: userAgent || '' },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.status(201).json({ message: 'Subscribed.' });
}

async function unsubscribe(req, res) {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ message: 'endpoint is required.' });
  await PushSubscription.deleteOne({ endpoint, userRef: req.user._id });
  res.json({ message: 'Unsubscribed.' });
}

module.exports = { getPublicKey, subscribe, unsubscribe };
