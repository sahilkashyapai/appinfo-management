const { Schema, model } = require('mongoose');

const notificationSchema = new Schema(
  {
    recipientRef: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // null = broadcast to everyone
    icon: { type: String, default: '🔔' },
    bg: { type: String, default: '#EBF5FB' },
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: { type: String, default: 'info' },
    isRead: { type: Boolean, default: false },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }], // for broadcast notifications
  },
  { timestamps: true }
);

module.exports = model('Notification', notificationSchema);
