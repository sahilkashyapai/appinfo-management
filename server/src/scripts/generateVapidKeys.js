// One-off helper: run `node src/scripts/generateVapidKeys.js` and paste the
// printed keys into server/.env. Not run automatically at server startup —
// regenerating on every boot would orphan every existing PushSubscription.
const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();
console.log('Add these to server/.env:\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
