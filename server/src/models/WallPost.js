const { Schema, model } = require('mongoose');

const commentSchema = new Schema(
  {
    authorRef: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const wallPostSchema = new Schema(
  {
    authorRef: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
    tag: { type: String, enum: ['birthday', 'anniversary', 'event', 'general'], default: 'general' },
    reactions: {
      like: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      love: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      celebrate: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    },
    comments: [commentSchema],
  },
  { timestamps: true }
);

module.exports = model('WallPost', wallPostSchema);
