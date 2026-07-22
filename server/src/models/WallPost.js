const { Schema, model } = require('mongoose');

const commentSchema = new Schema(
  {
    authorRef: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const pollOptionSchema = new Schema(
  {
    text: { type: String, required: true, trim: true },
    votes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { _id: false }
);

const wallPostSchema = new Schema(
  {
    authorRef: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
    tag: { type: String, enum: ['birthday', 'anniversary', 'event', 'general', 'poll'], default: 'general' },
    reactions: {
      like: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      love: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      celebrate: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    },
    comments: [commentSchema],
    poll: {
      type: {
        question: { type: String, trim: true },
        options: [pollOptionSchema],
        closesAt: { type: Date, default: null },
      },
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = model('WallPost', wallPostSchema);
