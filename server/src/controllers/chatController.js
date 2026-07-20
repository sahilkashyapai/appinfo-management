const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { emitToUsers } = require('../realtime/io');

const MEMBER_SELECT = 'name avatarIndex avatarUrl role';
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_CHARS = 4 * 1024 * 1024; // ~3MB decoded

function isMember(conversation, userId) {
  return conversation.members.some((m) => String(m) === String(userId));
}

function validateAttachments(attachments) {
  if (!attachments) return null;
  if (!Array.isArray(attachments)) return 'attachments must be an array.';
  if (attachments.length > MAX_ATTACHMENTS) return `You can attach at most ${MAX_ATTACHMENTS} files.`;
  for (const a of attachments) {
    if (!a?.url || !a.url.startsWith('data:')) return 'Each attachment needs valid file data.';
    if (a.url.length > MAX_ATTACHMENT_CHARS) return 'Each attachment must be under ~3MB.';
  }
  return null;
}

async function listUsers(req, res) {
  const users = await User.find({ isActive: true, approvalStatus: 'approved', _id: { $ne: req.user._id } }, MEMBER_SELECT).sort({ name: 1 });
  res.json({ items: users });
}

async function listConversations(req, res) {
  const conversations = await Conversation.find({ members: req.user._id })
    .sort({ lastMessageAt: -1 })
    .populate('members', MEMBER_SELECT);

  const items = await Promise.all(
    conversations.map(async (c) => {
      const unreadCount = await Message.countDocuments({
        conversationRef: c._id,
        senderRef: { $ne: req.user._id },
        readBy: { $ne: req.user._id },
      });
      return { ...c.toObject(), unreadCount };
    })
  );

  res.json({ items });
}

async function createConversation(req, res) {
  const { memberIds, isGroup, name } = req.body;
  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    return res.status(400).json({ message: 'memberIds must be a non-empty array.' });
  }

  const otherIds = [...new Set(memberIds.map(String))].filter((id) => id !== String(req.user._id));
  if (otherIds.length === 0) return res.status(400).json({ message: 'Pick at least one other person to message.' });

  const others = await User.find({ _id: { $in: otherIds } }, '_id');
  if (others.length !== otherIds.length) return res.status(400).json({ message: 'One or more selected users were not found.' });

  const group = !!isGroup || otherIds.length > 1;

  if (group && !name?.trim()) {
    return res.status(400).json({ message: 'Group conversations need a name.' });
  }

  const allMemberIds = [String(req.user._id), ...otherIds];

  if (!group) {
    const existing = await Conversation.findOne({
      isGroup: false,
      members: { $size: 2, $all: allMemberIds },
    }).populate('members', MEMBER_SELECT);
    if (existing) return res.json({ conversation: existing });
  }

  const conversation = await Conversation.create({
    isGroup: group,
    name: group ? name.trim() : '',
    members: allMemberIds,
    createdBy: req.user._id,
  });
  await conversation.populate('members', MEMBER_SELECT);

  emitToUsers(otherIds, 'conversation:new', { conversation });
  res.status(201).json({ conversation });
}

async function updateConversation(req, res) {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
  if (!isMember(conversation, req.user._id)) return res.status(403).json({ message: 'You are not part of this conversation.' });
  if (!conversation.isGroup) return res.status(400).json({ message: 'Only group conversations can be edited.' });

  const { name, addMemberIds } = req.body;
  if (name !== undefined) {
    if (String(conversation.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Only the group creator can rename it.' });
    }
    if (!name.trim()) return res.status(400).json({ message: 'Group name cannot be empty.' });
    conversation.name = name.trim();
  }
  if (Array.isArray(addMemberIds) && addMemberIds.length) {
    const toAdd = addMemberIds.map(String).filter((id) => !isMember(conversation, id));
    const found = await User.find({ _id: { $in: toAdd } }, '_id');
    conversation.members.push(...found.map((u) => u._id));
  }

  await conversation.save();
  await conversation.populate('members', MEMBER_SELECT);
  emitToUsers(conversation.members.map((m) => m._id), 'conversation:updated', { conversation });
  res.json({ conversation });
}

async function getMessages(req, res) {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
  if (!isMember(conversation, req.user._id)) return res.status(403).json({ message: 'You are not part of this conversation.' });

  const { before, limit = 30 } = req.query;
  const filter = { conversationRef: conversation._id };
  if (before) filter.createdAt = { $lt: new Date(before) };

  const lim = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
  const messages = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(lim)
    .populate('senderRef', MEMBER_SELECT);

  res.json({ items: messages.reverse() });
}

async function sendMessage(req, res) {
  const { text, attachments } = req.body;
  if (!text?.trim() && (!attachments || attachments.length === 0)) {
    return res.status(400).json({ message: 'Message needs text or at least one attachment.' });
  }
  const attachmentError = validateAttachments(attachments);
  if (attachmentError) return res.status(400).json({ message: attachmentError });

  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
  if (!isMember(conversation, req.user._id)) return res.status(403).json({ message: 'You are not part of this conversation.' });

  const message = await Message.create({
    conversationRef: conversation._id,
    senderRef: req.user._id,
    text: text?.trim() || '',
    attachments: attachments || [],
    readBy: [req.user._id],
  });
  await message.populate('senderRef', MEMBER_SELECT);

  conversation.lastMessageAt = message.createdAt;
  conversation.lastMessageText = message.text || (message.attachments.length ? '📎 Attachment' : '');
  await conversation.save();

  emitToUsers(conversation.members, 'message:new', { conversationId: String(conversation._id), message });
  res.status(201).json({ message });
}

async function markRead(req, res) {
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
  if (!isMember(conversation, req.user._id)) return res.status(403).json({ message: 'You are not part of this conversation.' });

  await Message.updateMany(
    { conversationRef: conversation._id, readBy: { $ne: req.user._id } },
    { $addToSet: { readBy: req.user._id } }
  );
  res.json({ message: 'Marked as read.' });
}

module.exports = { listUsers, listConversations, createConversation, updateConversation, getMessages, sendMessage, markRead };
