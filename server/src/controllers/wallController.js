const { prisma, shape, sel, INCLUDE, andWhere } = require('../db');
const { createNotification } = require('../services/notify');
const writeAudit = require('../utils/audit');
const { sendPushToUser } = require('../services/pushService');
const { excludeSuperadminUsers } = require('../utils/hideSuperadmin');
const { APPROVER_ROLES } = require('../utils/roles');
const { isOfficeScoped, scopedUserIds } = require('../utils/officeScope');

const REACTION_TYPES = ['like', 'love', 'celebrate'];
const REACTION_ICON = { like: 'fa-solid fa-thumbs-up', love: 'fa-solid fa-heart', celebrate: 'fa-solid fa-champagne-glasses' };
const REACTION_LABEL = { like: 'liked', love: 'loved', celebrate: 'celebrated' };
const WALL_TAGS = ['birthday', 'anniversary', 'event', 'general', 'poll'];

// Author (and comment authors) populated with 'name avatarIndex avatarUrl'.
const AUTHOR_SELECT = sel('User', 'name avatarIndex avatarUrl');
const POST_INCLUDE = {
  ...INCLUDE.WallPost,
  authorRef: { select: AUTHOR_SELECT },
  comments: { ...INCLUDE.WallPost.comments, include: { authorRef: { select: AUTHOR_SELECT } } },
};

async function notifyPostAuthor(authorId, { icon, title, body, link = '/wall' }) {
  try {
    await createNotification({ recipientId: authorId, icon, type: 'wall', title, body, link });
  } catch (err) {
    console.error('[wall] failed to create notification:', err.message);
  }
  sendPushToUser(authorId, { title, body, url: link }).catch((e) => console.error('[push] wall notify failed:', e.message));
}

async function loadPost(id) {
  return prisma.wallPost.findUnique({ where: { id: String(id) }, include: POST_INCLUDE });
}

function shapePost(post, userId) {
  const obj = shape('WallPost', post);
  const uid = String(userId);
  obj.counts = Object.fromEntries(REACTION_TYPES.map((t) => [t, obj.reactions[t].length]));
  obj.myReactions = Object.fromEntries(REACTION_TYPES.map((t) => [t, obj.reactions[t].some((id) => String(id) === uid)]));

  // Polls are fully anonymous — only aggregate counts are ever exposed, never
  // who voted for what.
  if (obj.poll) {
    obj.poll.myVoteIndex = obj.poll.options.findIndex((o) => o.votes.some((id) => String(id) === uid));
    obj.poll.totalVotes = obj.poll.options.reduce((n, o) => n + o.votes.length, 0);
    obj.poll.options = obj.poll.options.map((o) => ({ text: o.text, count: o.votes.length }));
  }
  return obj;
}

async function list(req, res) {
  const { tag, page = 1, limit = 20 } = req.query;
  const where = {};
  if (tag && tag !== 'all') {
    // An unknown tag matched nothing on Mongo; Prisma would reject it outright.
    if (!WALL_TAGS.includes(tag)) return res.json({ items: [], total: 0, page: Math.max(parseInt(page, 10) || 1, 1), pages: 1 });
    where.tag = tag;
  }
  await excludeSuperadminUsers(where, req.user.role, 'authorId');
  const scopedIds = await scopedUserIds(req.user);
  if (scopedIds) andWhere(where, { authorId: { in: scopedIds } });
  const pg = Math.max(parseInt(page, 10) || 1, 1);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);

  const [posts, total] = await Promise.all([
    prisma.wallPost.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (pg - 1) * lim,
      take: lim,
      include: POST_INCLUDE,
    }),
    prisma.wallPost.count({ where }),
  ]);

  res.json({ items: posts.map((p) => shapePost(p, req.user._id)), total, page: pg, pages: Math.ceil(total / lim) || 1 });
}

async function create(req, res) {
  const { text, tag, poll } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ message: 'Post text is required.' });

  const postData = { authorId: String(req.user._id), text: text.trim(), tag: tag || 'general' };

  if (tag === 'poll') {
    if (!poll?.question?.trim()) return res.status(400).json({ message: 'A poll question is required.' });
    const options = (poll.options || []).map((o) => (typeof o === 'string' ? o : o.text)).map((t) => (t || '').trim()).filter(Boolean);
    if (options.length < 2) return res.status(400).json({ message: 'A poll needs at least 2 options.' });
    let closesAt = null;
    if (poll.closesAt) {
      closesAt = new Date(poll.closesAt);
      if (Number.isNaN(closesAt.getTime()) || closesAt <= new Date()) {
        return res.status(400).json({ message: 'closesAt must be a valid future date.' });
      }
    }
    postData.pollQuestion = poll.question.trim();
    postData.pollClosesAt = closesAt;
    postData.pollOptions = { create: options.map((t, position) => ({ text: t, position })) };
  }

  const post = await prisma.wallPost.create({ data: postData, include: POST_INCLUDE });
  await writeAudit({ ip: req.ip, user: req.user, action: 'CREATE', entity: 'wall_posts', recordId: post.id, detail: 'Posted on Celebration Wall' });
  res.status(201).json({ post: shapePost(post, req.user._id) });
}

async function update(req, res) {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ message: 'Post text is required.' });
  const existing = await prisma.wallPost.findUnique({ where: { id: String(req.params.id) }, select: { id: true, authorId: true } });
  if (!existing) return res.status(404).json({ message: 'Post not found.' });
  if (String(existing.authorId) !== String(req.user._id)) {
    return res.status(403).json({ message: 'You can only edit your own posts.' });
  }

  const post = await prisma.wallPost.update({ where: { id: existing.id }, data: { text: text.trim() }, include: POST_INCLUDE });
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'wall_posts', recordId: post.id, detail: 'Edited wall post' });
  res.json({ post: shapePost(post, req.user._id) });
}

async function react(req, res) {
  const { type } = req.body;
  if (!REACTION_TYPES.includes(type)) return res.status(400).json({ message: `type must be one of ${REACTION_TYPES.join(', ')}` });

  const uid = String(req.user._id);
  const existing = await prisma.wallPost.findUnique({
    where: { id: String(req.params.id) },
    select: { id: true, authorId: true, reactions: { where: { userId: uid, type }, select: { type: true } } },
  });
  if (!existing) return res.status(404).json({ message: 'Post not found.' });

  // A user may only have one active reaction per post — drop it from every
  // type first, then re-add to the requested type unless that's what was toggled off.
  const wasActive = existing.reactions.length > 0;
  const authorId = existing.authorId;
  const becameActive = !wasActive;
  await prisma.$transaction([
    prisma.wallReaction.deleteMany({ where: { postId: existing.id, userId: uid } }),
    ...(becameActive ? [prisma.wallReaction.create({ data: { postId: existing.id, userId: uid, type } })] : []),
  ]);
  const post = await loadPost(existing.id);

  if (becameActive && String(authorId) !== uid) {
    notifyPostAuthor(authorId, {
      icon: REACTION_ICON[type],
      title: 'New reaction on your post',
      body: `${req.user.name} ${REACTION_LABEL[type]} your Wall post.`,
    });
  }

  res.json({ post: shapePost(post, req.user._id) });
}

async function votePoll(req, res) {
  const { optionIndex } = req.body;
  const uid = String(req.user._id);
  const existing = await prisma.wallPost.findUnique({
    where: { id: String(req.params.id) },
    select: {
      id: true,
      pollQuestion: true,
      pollClosesAt: true,
      pollOptions: { orderBy: { position: 'asc' }, select: { id: true, votes: { where: { userId: uid }, select: { userId: true } } } },
    },
  });
  if (!existing) return res.status(404).json({ message: 'Post not found.' });
  if (!existing.pollQuestion) return res.status(400).json({ message: 'This post is not a poll.' });
  if (existing.pollClosesAt && existing.pollClosesAt < new Date()) return res.status(400).json({ message: 'This poll is closed.' });
  const options = existing.pollOptions;
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= options.length) {
    return res.status(400).json({ message: 'Invalid option.' });
  }

  // One active vote per user across all options — clicking your current choice
  // again retracts it, clicking a different option switches your vote.
  const wasVotedIdx = options.findIndex((o) => o.votes.length > 0);
  await prisma.$transaction([
    prisma.wallPollVote.deleteMany({ where: { userId: uid, option: { postId: existing.id } } }),
    ...(wasVotedIdx !== optionIndex ? [prisma.wallPollVote.create({ data: { optionId: options[optionIndex].id, userId: uid } })] : []),
  ]);

  const post = await loadPost(existing.id);
  res.json({ post: shapePost(post, req.user._id) });
}

async function addComment(req, res) {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ message: 'Comment text is required.' });
  const existing = await prisma.wallPost.findUnique({ where: { id: String(req.params.id) }, select: { id: true, authorId: true } });
  if (!existing) return res.status(404).json({ message: 'Post not found.' });

  const authorId = existing.authorId;
  await prisma.wallComment.create({ data: { postId: existing.id, authorId: String(req.user._id), text: text.trim() } });
  const post = await loadPost(existing.id);

  if (String(authorId) !== String(req.user._id)) {
    notifyPostAuthor(authorId, {
      icon: 'fa-solid fa-comment-dots',
      title: 'New comment on your post',
      body: `${req.user.name} commented on your Wall post.`,
    });
  }

  res.status(201).json({ post: shapePost(post, req.user._id) });
}

async function findComment(postId, commentId) {
  return prisma.wallComment.findFirst({ where: { id: String(commentId), postId } });
}

async function editComment(req, res) {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ message: 'Comment text is required.' });
  const existing = await prisma.wallPost.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!existing) return res.status(404).json({ message: 'Post not found.' });
  const comment = await findComment(existing.id, req.params.commentId);
  if (!comment) return res.status(404).json({ message: 'Comment not found.' });
  if (String(comment.authorId) !== String(req.user._id)) {
    return res.status(403).json({ message: 'You can only edit your own comments.' });
  }

  await prisma.wallComment.update({ where: { id: comment.id }, data: { text: text.trim() } });
  const post = await loadPost(existing.id);
  res.json({ post: shapePost(post, req.user._id) });
}

async function deleteComment(req, res) {
  const existing = await prisma.wallPost.findUnique({ where: { id: String(req.params.id) }, select: { id: true } });
  if (!existing) return res.status(404).json({ message: 'Post not found.' });
  const comment = await findComment(existing.id, req.params.commentId);
  if (!comment) return res.status(404).json({ message: 'Comment not found.' });
  const isOwnComment = String(comment.authorId) === String(req.user._id);
  if (!isOwnComment) {
    if (!APPROVER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: 'You can only delete your own comments.' });
    }
    if (await isOfficeScoped(req.user)) {
      const scopedIds = await scopedUserIds(req.user);
      if (!scopedIds.some((id) => String(id) === String(comment.authorId))) {
        return res.status(403).json({ message: 'You can only moderate content from your own office.' });
      }
    }
  }

  await prisma.wallComment.delete({ where: { id: comment.id } });
  const post = await loadPost(existing.id);
  res.json({ post: shapePost(post, req.user._id) });
}

async function remove(req, res) {
  const post = await prisma.wallPost.findUnique({ where: { id: String(req.params.id) }, select: { id: true, authorId: true } });
  if (!post) return res.status(404).json({ message: 'Post not found.' });
  const isOwnPost = String(post.authorId) === String(req.user._id);
  if (!isOwnPost) {
    if (!APPROVER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: 'You can only delete your own posts.' });
    }
    if (await isOfficeScoped(req.user)) {
      const scopedIds = await scopedUserIds(req.user);
      if (!scopedIds.some((id) => String(id) === String(post.authorId))) {
        return res.status(403).json({ message: 'You can only moderate content from your own office.' });
      }
    }
  }
  // Comments, reactions and poll options/votes go with it (ON DELETE CASCADE).
  await prisma.wallPost.delete({ where: { id: post.id } });
  await writeAudit({ ip: req.ip, user: req.user, action: 'DELETE', entity: 'wall_posts', recordId: post.id, detail: 'Deleted wall post' });
  res.json({ message: 'Post deleted.' });
}

module.exports = { list, create, update, react, votePoll, addComment, editComment, deleteComment, remove };
