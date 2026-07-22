const { Schema, model } = require('mongoose');

const pushSubscriptionSchema = new Schema(
  {
    userRef: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true }
);

pushSubscriptionSchema.index({ userRef: 1 });

module.exports = model('PushSubscription', pushSubscriptionSchema);
