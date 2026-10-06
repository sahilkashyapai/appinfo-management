const { prisma, shape, shapeMany, sel, INCLUDE, andWhere } = require('../db');
const { createNotification } = require('../services/notify');
const { emitToUsers, isUserOnline } = require('../realtime/io');
const { sendPushToUser } = require('../services/pushService');
const { excludeSuperadminUsers } = require('../utils/hideSuperadmin');
const { scopedUserIds } = require('../utils/officeScope');

const MEMBER_SELECT = 'name avatarIndex avatarUrl role';
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_CHARS = 4 * 1024 * 1024; // ~3MB decoded

// Members populated as user objects (was `.populate('members', MEMBER_SELECT)`).
const CONVERSATION_POPULATED = { members: { select: { user: { select: sel('User', MEMBER_SELECT) } } } };
const MESSAGE_POPULATED = { ...INCLUDE.Message, senderRef: { select: sel('User', MEMBER_SELECT) } };

// Loads a conversation with `members` as a plain array of user ids.
async function findConversation(id) {
  const row = await prisma.conversation.findUnique({ where: { id: String(id) }, include: INCLUDE.Conversation });
  return row ? shape('Conversation', row) : null;
}

function isMember(conversation, userId) {
  return conversation.members.some((m) => String(m?._id ?? m) === String(userId));
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
  const where = { isActive: true, approvalStatus: 'approved', id: { not: String(req.user._id) } };
  await excludeSuperadminUsers(where, req.user.role, 'id');

  // Office isolation only limits contact with other office-bound people —
  // company-wide admin/unscoped-superadmin contacts stay reachable from any office.
  const scopedIds = await scopedUserIds(req.user);
  if (scopedIds) {
    andWhere(where, {
      OR: [{ role: 'admin' }, { role: 'superadmin', managedLocation: '' }, { id: { in: scopedIds } }],
    });
  }

  const users = await prisma.user.findMany({ where, select: sel('User', MEMBER_SELECT), orderBy: { name: 'asc' } });
  res.json({ items: shapeMany('User', users) });
}

async function listConversations(req, res) {
  const uid = String(req.user._id);
  const conversations = await prisma.conversation.findMany({
    where: { members: { some: { userId: uid } } },
    orderBy: { lastMessageAt: 'desc' },
    include: CONVERSATION_POPULATED,
  });

  const items = await Promise.all(
    conversations.map(async (c) => {
      const unreadCount = await prisma.message.count({
        where: {
          conversationId: c.id,
          // Mongo's $ne also matched a missing sender, so a deleted user's messages still count.
          OR: [{ senderId: null }, { senderId: { not: uid } }],
          readBy: { none: { userId: uid } },
        },
      });
      return { ...shape('Conversation', c), unreadCount };
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

  const others = await prisma.user.findMany({ where: { id: { in: otherIds } }, select: { id: true } });
  if (others.length !== otherIds.length) return res.status(400).json({ message: 'One or more selected users were not found.' });

  const group = !!isGroup || otherIds.length > 1;

  if (group && !name?.trim()) {
    return res.status(400).json({ message: 'Group conversations need a name.' });
  }

  const allMemberIds = [String(req.user._id), ...otherIds];

  if (!group) {
    // Exactly these two members: every member is one of them, and both are present.
    const existing = await prisma.conversation.findFirst({
      where: {
        isGroup: false,
        members: { every: { userId: { in: allMemberIds } } },
        AND: allMemberIds.map((userId) => ({ members: { some: { userId } } })),
      },
      include: CONVERSATION_POPULATED,
    });
    if (existing) return res.json({ conversation: shape('Conversation', existing) });
  }

  const row = await prisma.conversation.create({
    data: {
      isGroup: group,
      name: group ? name.trim() : '',
      createdById: String(req.user._id),
      members: { create: allMemberIds.map((userId) => ({ userId })) },
    },
    include: CONVERSATION_POPULATED,
  });
  const conversation = shape('Conversation', row);

  emitToUsers(otherIds, 'conversation:new', { conversation });
  res.status(201).json({ conversation });
}

async function updateConversation(req, res) {
  const conversation = await findConversation(req.params.id);
  if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
  if (!isMember(conversation, req.user._id)) return res.status(403).json({ message: 'You are not part of this conversation.' });
  if (!conversation.isGroup) return res.status(400).json({ message: 'Only group conversations can be edited.' });

  const { name, addMemberIds } = req.body;
  const data = {};
  if (name !== undefined) {
    if (String(conversation.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Only the group creator can rename it.' });
    }
    if (!name.trim()) return res.status(400).json({ message: 'Group name cannot be empty.' });
    data.name = name.trim();
  }
  if (Array.isArray(addMemberIds) && addMemberIds.length) {
    const toAdd = addMemberIds.map(String).filter((id) => !isMember(conversation, id));
    const found = await prisma.user.findMany({ where: { id: { in: toAdd } }, select: { id: true } });
    if (found.length) {
      data.members = { createMany: { data: found.map((u) => ({ userId: u.id })), skipDuplicates: true } };
    }
  }

  const row = await prisma.conversation.update({ where: { id: conversation.id }, data, include: CONVERSATION_POPULATED });
  const updated = shape('Conversation', row);
  emitToUsers(updated.members.map((m) => m._id), 'conversation:updated', { conversation: updated });
  res.json({ conversation: updated });
}

async function getMessages(req, res) {
  const conversation = await findConversation(req.params.id);
  if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
  if (!isMember(conversation, req.user._id)) return res.status(403).json({ message: 'You are not part of this conversation.' });

  const { before, limit = 30 } = req.query;
  const where = { conversationId: conversation.id };
  if (before) where.createdAt = { lt: new Date(before) };

  const lim = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
  const messages = await prisma.message.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: lim,
    include: MESSAGE_POPULATED,
  });

  res.json({ items: shapeMany('Message', messages).reverse() });
}

async function sendMessage(req, res) {
  const { text, attachments } = req.body;
  if (!text?.trim() && (!attachments || attachments.length === 0)) {
    return res.status(400).json({ message: 'Message needs text or at least one attachment.' });
  }
  const attachmentError = validateAttachments(attachments);
  if (attachmentError) return res.status(400).json({ message: attachmentError });

  const conversation = await findConversation(req.params.id);
  if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
  if (!isMember(conversation, req.user._id)) return res.status(403).json({ message: 'You are not part of this conversation.' });

  const row = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: String(req.user._id),
      text: text?.trim() || '',
      attachments: {
        create: (attachments || []).map((a, position) => ({
          position,
          name: String(a.name || '').slice(0, 255),
          type: String(a.type || '').slice(0, 100),
          url: a.url,
        })),
      },
      readBy: { create: [{ userId: String(req.user._id) }] },
    },
    include: MESSAGE_POPULATED,
  });
  const message = shape('Message', row);

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: message.createdAt,
      lastMessageText: message.text || (message.attachments.length ? 'Attachment' : ''),
    },
  });

  emitToUsers(conversation.members, 'message:new', { conversationId: String(conversation._id), message });

  // Offline recipients (no live socket connection) get an in-app notification + push;
  // online recipients already got the real-time message:new event above.
  const notifyTitle = `New message from ${req.user.name}`;
  const notifyBody = message.text || 'Sent an attachment';
  const notifyLink = `/messages?conversation=${conversation._id}`;
  conversation.members
    .filter((id) => String(id) !== String(req.user._id) && !isUserOnline(id))
    .forEach((id) => {
      createNotification({ recipientId: id, icon: 'fa-solid fa-comment-dots', type: 'chat', title: notifyTitle, body: notifyBody, link: notifyLink }).catch((e) =>
        console.error('[chat] failed to create notification:', e.message)
      );
      sendPushToUser(id, { title: notifyTitle, body: notifyBody, url: notifyLink }).catch((e) => console.error('[push] chat message failed:', e.message));
    });

  res.status(201).json({ message });
}

async function markRead(req, res) {
  const conversation = await findConversation(req.params.id);
  if (!conversation) return res.status(404).json({ message: 'Conversation not found.' });
  if (!isMember(conversation, req.user._id)) return res.status(403).json({ message: 'You are not part of this conversation.' });

  const uid = String(req.user._id);
  const unread = await prisma.message.findMany({
    where: { conversationId: conversation.id, readBy: { none: { userId: uid } } },
    select: { id: true },
  });
  if (unread.length) {
    await prisma.messageRead.createMany({ data: unread.map((m) => ({ messageId: m.id, userId: uid })), skipDuplicates: true });
  }
  res.json({ message: 'Marked as read.' });
}

module.exports = { listUsers, listConversations, createConversation, updateConversation, getMessages, sendMessage, markRead };
