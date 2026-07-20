const { Schema, model } = require('mongoose');

const conversationSchema = new Schema(
  {
    isGroup: { type: Boolean, default: false },
    name: { type: String, default: '', trim: true }, // group name only; ignored for 1:1 chats
    members: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lastMessageAt: { type: Date, default: Date.now },
    lastMessageText: { type: String, default: '' },
  },
  { timestamps: true }
);

conversationSchema.index({ members: 1 });

module.exports = model('Conversation', conversationSchema);
