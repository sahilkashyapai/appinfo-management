const WallPost = require('../models/WallPost');
const Notification = require('../models/Notification');
const writeAudit = require('../utils/audit');
const { sendPushToUser } = require('../services/pushService');

const REACTION_TYPES = ['like', 'love', 'celebrate'];
const REACTION_ICON = { like: '👍', love: '❤️', celebrate: '🎉' };

async function notifyPostAuthor(authorId, { icon, title, body, link = '/wall' }) {
  try {
    await Notification.create({ recipientRef: authorId, icon, type: 'wall', title, body, link });
  } catch (err) {
    console.error('[wall] failed to create notification:', err.message);
  }
  sendPushToUser(authorId, { title, body, url: link }).catch((e) => console.error('[push] wall notify failed:', e.message));
}

function shapePost(post, userId) {
  const obj = post.toObject();
  const uid = String(userId);
  obj.counts = Object.fromEntries(REACTION_TYPES.map((t) => [t, obj.reactions[t].length]));
  obj.myReactions = Object.fromEntries(REACTION_TYPES.map((t) => [t, obj.reactions[t].some((id) => String(id) === uid)]));

  // Polls are fully anonymous — even for HR/superadmin, only aggregate counts
  // are ever exposed, never who voted for what.
  if (obj.poll) {
    obj.poll.myVoteIndex = obj.poll.options.findIndex((o) => o.votes.some((id) => String(id) === uid));
    obj.poll.totalVotes = obj.poll.options.reduce((n, o) => n + o.votes.length, 0);
    obj.poll.options = obj.poll.options.map((o) => ({ text: o.text, count: o.votes.length }));
  }
  return obj;
}

async function list(req, res) {
  const { tag, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (tag && tag !== 'all') filter.tag = tag;
  const pg = Math.max(parseInt(page, 10) || 1, 1);
  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);

  const [posts, total] = await Promise.all([
    WallPost.find(filter)
      .sort({ createdAt: -1 })
      .skip((pg - 1) * lim)
      .limit(lim)
      .populate('authorRef', 'name avatarIndex avatarUrl')
      .populate('comments.authorRef', 'name avatarIndex avatarUrl'),
    WallPost.countDocuments(filter),
  ]);

  res.json({ items: posts.map((p) => shapePost(p, req.user._id)), total, page: pg, pages: Math.ceil(total / lim) || 1 });
}

async function create(req, res) {
  const { text, tag, poll } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ message: 'Post text is required.' });

  const postData = { authorRef: req.user._id, text: text.trim(), tag: tag || 'general' };

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
    postData.poll = { question: poll.question.trim(), options: options.map((t) => ({ text: t, votes: [] })), closesAt };
  }

  const post = await WallPost.create(postData);
  await post.populate('authorRef', 'name avatarIndex avatarUrl');
  await writeAudit({ ip: req.ip, user: req.user, action: 'CREATE', entity: 'wall_posts', recordId: post._id, detail: 'Posted on Celebration Wall' });
  res.status(201).json({ post: shapePost(post, req.user._id) });
}

async function update(req, res) {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ message: 'Post text is required.' });
  const post = await WallPost.findById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Post not found.' });
  if (String(post.authorRef) !== String(req.user._id)) {
    return res.status(403).json({ message: 'You can only edit your own posts.' });
  }

  post.text = text.trim();
  await post.save();
  await post.populate('authorRef', 'name avatarIndex avatarUrl');
  await post.populate('comments.authorRef', 'name avatarIndex avatarUrl');
  await writeAudit({ ip: req.ip, user: req.user, action: 'UPDATE', entity: 'wall_posts', recordId: post._id, detail: 'Edited wall post' });
  res.json({ post: shapePost(post, req.user._id) });
}

async function react(req, res) {
  const { type } = req.body;
  if (!REACTION_TYPES.includes(type)) return res.status(400).json({ message: `type must be one of ${REACTION_TYPES.join(', ')}` });

  const post = await WallPost.findById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Post not found.' });

  // A user may only have one active reaction per post — drop it from every
  // type first, then re-add to the requested type unless that's what was toggled off.
  const uid = String(req.user._id);
  const wasActive = post.reactions[type].some((id) => String(id) === uid);
  const authorId = post.authorRef;
  REACTION_TYPES.forEach((t) => {
    post.reactions[t] = post.reactions[t].filter((id) => String(id) !== uid);
  });
  const becameActive = !wasActive;
  if (becameActive) post.reactions[type].push(req.user._id);

  await post.save();
  await post.populate('authorRef', 'name avatarIndex avatarUrl');
  await post.populate('comments.authorRef', 'name avatarIndex avatarUrl');

  if (becameActive && String(authorId) !== uid) {
    notifyPostAuthor(authorId, {
      icon: REACTION_ICON[type],
      title: 'New reaction on your post',
      body: `${req.user.name} reacted ${REACTION_ICON[type]} to your Wall post.`,
    });
  }

  res.json({ post: shapePost(post, req.user._id) });
}

async function votePoll(req, res) {
  const { optionIndex } = req.body;
  const post = await WallPost.findById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Post not found.' });
  if (!post.poll) return res.status(400).json({ message: 'This post is not a poll.' });
  if (post.poll.closesAt && post.poll.closesAt < new Date()) return res.status(400).json({ message: 'This poll is closed.' });
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= post.poll.options.length) {
    return res.status(400).json({ message: 'Invalid option.' });
  }

  // One active vote per user across all options — clicking your current choice
  // again retracts it, clicking a different option switches your vote.
  const uid = String(req.user._id);
  const wasVotedIdx = post.poll.options.findIndex((o) => o.votes.some((id) => String(id) === uid));
  post.poll.options.forEach((o) => {
    o.votes = o.votes.filter((id) => String(id) !== uid);
  });
  if (wasVotedIdx !== optionIndex) post.poll.options[optionIndex].votes.push(req.user._id);

  await post.save();
  await post.populate('authorRef', 'name avatarIndex avatarUrl');
  await post.populate('comments.authorRef', 'name avatarIndex avatarUrl');
  res.json({ post: shapePost(post, req.user._id) });
}

async function addComment(req, res) {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ message: 'Comment text is required.' });
  const post = await WallPost.findById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Post not found.' });

  const authorId = post.authorRef;
  post.comments.push({ authorRef: req.user._id, text: text.trim() });
  await post.save();
  await post.populate('authorRef', 'name avatarIndex avatarUrl');
  await post.populate('comments.authorRef', 'name avatarIndex avatarUrl');

  if (String(authorId) !== String(req.user._id)) {
    notifyPostAuthor(authorId, {
      icon: '💬',
      title: 'New comment on your post',
      body: `${req.user.name} commented on your Wall post.`,
    });
  }

  res.status(201).json({ post: shapePost(post, req.user._id) });
}

async function editComment(req, res) {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ message: 'Comment text is required.' });
  const post = await WallPost.findById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Post not found.' });
  const comment = post.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ message: 'Comment not found.' });
  if (String(comment.authorRef) !== String(req.user._id)) {
    return res.status(403).json({ message: 'You can only edit your own comments.' });
  }

  comment.text = text.trim();
  await post.save();
  await post.populate('authorRef', 'name avatarIndex avatarUrl');
  await post.populate('comments.authorRef', 'name avatarIndex avatarUrl');
  res.json({ post: shapePost(post, req.user._id) });
}

async function deleteComment(req, res) {
  const post = await WallPost.findById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Post not found.' });
  const comment = post.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ message: 'Comment not found.' });
  if (String(comment.authorRef) !== String(req.user._id) && !['superadmin', 'hr'].includes(req.user.role)) {
    return res.status(403).json({ message: 'You can only delete your own comments.' });
  }

  comment.deleteOne();
  await post.save();
  await post.populate('authorRef', 'name avatarIndex avatarUrl');
  await post.populate('comments.authorRef', 'name avatarIndex avatarUrl');
  res.json({ post: shapePost(post, req.user._id) });
}

async function remove(req, res) {
  const post = await WallPost.findById(req.params.id);
  if (!post) return res.status(404).json({ message: 'Post not found.' });
  if (String(post.authorRef) !== String(req.user._id) && !['superadmin', 'hr'].includes(req.user.role)) {
    return res.status(403).json({ message: 'You can only delete your own posts.' });
  }
  await post.deleteOne();
  await writeAudit({ ip: req.ip, user: req.user, action: 'DELETE', entity: 'wall_posts', recordId: post._id, detail: 'Deleted wall post' });
  res.json({ message: 'Post deleted.' });
}

module.exports = { list, create, update, react, votePoll, addComment, editComment, deleteComment, remove };
