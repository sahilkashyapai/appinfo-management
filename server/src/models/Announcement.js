const { Schema, model } = require('mongoose');

const announcementSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    type: { type: String, enum: ['general', 'hiring'], default: 'general' },
    priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
    icon: { type: String, default: '📢' },
    pinned: { type: Boolean, default: false },
    postedByRef: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    scheduledAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = model('Announcement', announcementSchema);
