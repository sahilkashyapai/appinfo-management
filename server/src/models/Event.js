const { Schema, model } = require('mongoose');

const eventSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['festival', 'workshop', 'town_hall', 'team_outing', 'sports', 'birthday', 'other'],
      default: 'other',
    },
    date: { type: Date, required: true },
    venue: { type: String, default: '' },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    emoji: { type: String, default: '🎉' },
    color: { type: String, default: '#2E86AB' },
    capacity: { type: Number, default: 100 },
    createdByRef: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = model('Event', eventSchema);
