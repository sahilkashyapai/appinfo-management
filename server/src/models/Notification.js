const { Schema, model } = require('mongoose');

const notificationSchema = new Schema(
  {
    recipientRef: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // null = broadcast to everyone
    icon: { type: String, default: '🔔' },
    bg: { type: String, default: '#EBF5FB' },
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: { type: String, default: 'info' },
    link: { type: String, default: '' }, // client-side relative path to open on click, e.g. '/leave'
    isRead: { type: Boolean, default: false },
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }], // for broadcast notifications
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = model('Notification', notificationSchema);
