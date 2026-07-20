const { Schema, model } = require('mongoose');

const attachmentSchema = new Schema(
  {
    name: { type: String, default: '' },
    type: { type: String, default: '' }, // mime type
    url: { type: String, required: true }, // base64 data URL
  },
  { _id: false }
);

const messageSchema = new Schema(
  {
    conversationRef: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderRef: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, default: '', trim: true },
    attachments: [attachmentSchema],
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

messageSchema.index({ conversationRef: 1, createdAt: -1 });

module.exports = model('Message', messageSchema);
