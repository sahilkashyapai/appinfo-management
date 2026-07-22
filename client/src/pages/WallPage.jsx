import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Avatar from '../components/Avatar';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDateTime } from '../utils/avatar';

const TAG_BADGE = { birthday: 'b-or', anniversary: 'b-go', event: 'b-bl', general: 'b-gy', poll: 'b-pu' };

export default function WallPage() {
  const [tag, setTag] = useState('all');
  const [text, setText] = useState('');
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editText, setEditText] = useState('');
  const [editingPostId, setEditingPostId] = useState(null);
  const [editPostText, setEditPostText] = useState('');
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['wall', tag],
    queryFn: () => api.get('/wall', { params: { tag } }).then((r) => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['wall'] });

  const pollValid = pollQuestion.trim() && pollOptions.filter((o) => o.trim()).length >= 2;

  const post = useMutation({
    mutationFn: () =>
      api.post('/wall', {
        text,
        tag: pollOpen && pollValid ? 'poll' : 'general',
        ...(pollOpen && pollValid
          ? { poll: { question: pollQuestion.trim(), options: pollOptions.filter((o) => o.trim()).map((t) => ({ text: t.trim() })) } }
          : {}),
      }),
    onSuccess: () => {
      setText('');
      setPollOpen(false);
      setPollQuestion('');
      setPollOptions(['', '']);
      toast('Posted on Celebration Wall!', 'success');
      invalidate();
    },
  });

  const votePoll = useMutation({
    mutationFn: ({ id, optionIndex }) => api.post(`/wall/${id}/poll/vote`, { optionIndex }),
    onSuccess: invalidate,
    onError: (err) => toast(err.response?.data?.message || 'Could not record vote.', 'error'),
  });

  const editPost = useMutation({
    mutationFn: ({ id, text: t }) => api.put(`/wall/${id}`, { text: t }),
    onSuccess: () => {
      setEditingPostId(null);
      setEditPostText('');
      invalidate();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not update post.', 'error'),
  });
  const deletePost = useMutation({
    mutationFn: (id) => api.delete(`/wall/${id}`),
    onSuccess: () => {
      toast('Post deleted', 'info');
      invalidate();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not delete post.', 'error'),
  });
  const react = useMutation({ mutationFn: ({ id, type }) => api.post(`/wall/${id}/react`, { type }), onSuccess: invalidate });
  const comment = useMutation({
    mutationFn: ({ id, text: t }) => api.post(`/wall/${id}/comments`, { text: t }),
    onSuccess: (_res, vars) => {
      setCommentDrafts((d) => ({ ...d, [vars.id]: '' }));
      invalidate();
    },
  });
  const editComment = useMutation({
    mutationFn: ({ postId, commentId, text: t }) => api.put(`/wall/${postId}/comments/${commentId}`, { text: t }),
    onSuccess: () => {
      setEditingCommentId(null);
      setEditText('');
      invalidate();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not update comment.', 'error'),
  });
  const deleteComment = useMutation({
    mutationFn: ({ postId, commentId }) => api.delete(`/wall/${postId}/comments/${commentId}`),
    onSuccess: invalidate,
    onError: (err) => toast(err.response?.data?.message || 'Could not delete comment.', 'error'),
  });

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Celebration Wall</div>
          <div className="pgs">{data?.total || 0} posts</div>
        </div>
        <div className="ph-r">
          <select className="fc" style={{ width: 130 }} value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="all">All Posts</option>
            <option value="birthday">Birthdays</option>
            <option value="anniversary">Anniversaries</option>
            <option value="event">Events</option>
            <option value="general">General</option>
            <option value="poll">Polls</option>
          </select>
        </div>
      </div>

      <div className="card mb13">
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Avatar name={user?.name} index={user?.avatarIndex} src={user?.avatarUrl} size={36} fontSize={12} />
          <div style={{ flex: 1 }}>
            <textarea
              className="fc"
              placeholder="Share a birthday wish, congratulations, or celebration message…"
              style={{ resize: 'none', height: 72, marginBottom: 8 }}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {pollOpen && (
              <div style={{ marginBottom: 8 }}>
                <input
                  className="fc"
                  placeholder="Poll question"
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  style={{ marginBottom: 6 }}
                />
                {pollOptions.map((opt, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input
                      className="fc"
                      placeholder={`Option ${i + 1}`}
                      value={opt}
                      onChange={(e) => setPollOptions((o) => o.map((x, j) => (j === i ? e.target.value : x)))}
                    />
                    {pollOptions.length > 2 && (
                      <button className="btn bs bxs bico" onClick={() => setPollOptions((o) => o.filter((_, j) => j !== i))}>
                        <i className="fa-solid fa-xmark" />
                      </button>
                    )}
                  </div>
                ))}
                <button className="btn bs bxs" onClick={() => setPollOptions((o) => [...o, ''])}>
                  <i className="fa-solid fa-plus" /> Add Option
                </button>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button className="btn bs bsm" onClick={() => setPollOpen((o) => !o)}>
                <i className="fa-solid fa-square-poll-vertical" /> {pollOpen ? 'Remove Poll' : 'Add Poll'}
              </button>
              <button className="btn bp bsm" disabled={!text.trim() || post.isPending || (pollOpen && !pollValid)} onClick={() => post.mutate()}>
                <i className="fa-solid fa-paper-plane" /> Post
              </button>
            </div>
          </div>
        </div>
      </div>

      {data?.items.map((p) => {
        const isOwnPost = p.authorRef?._id === user?.id;
        const canDeletePost = isOwnPost || ['superadmin', 'hr'].includes(user?.role);
        const isEditingPost = editingPostId === p._id;
        return (
        <div className="wp" key={p._id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <Avatar name={p.authorRef?.name} index={p.authorRef?.avatarIndex} src={p.authorRef?.avatarUrl} size={34} fontSize={11} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>{p.authorRef?.name || 'Unknown'}</div>
              <div style={{ fontSize: 10, color: 'var(--t3)' }}>{formatDateTime(p.createdAt)}</div>
            </div>
            <span className={`badge ${TAG_BADGE[p.tag] || 'b-gy'}`}>{p.tag}</span>
            {!isEditingPost && canDeletePost && (
              <div style={{ display: 'flex', gap: 10 }}>
                {isOwnPost && (
                  <i
                    className="fa-solid fa-pen"
                    style={{ fontSize: 11, color: 'var(--t3)', cursor: 'pointer' }}
                    onClick={() => {
                      setEditingPostId(p._id);
                      setEditPostText(p.text);
                    }}
                  />
                )}
                <i
                  className="fa-solid fa-trash"
                  style={{ fontSize: 11, color: 'var(--red)', cursor: 'pointer' }}
                  onClick={() => deletePost.mutate(p._id)}
                />
              </div>
            )}
          </div>
          {isEditingPost ? (
            <div style={{ marginBottom: 10 }}>
              <textarea
                className="fc"
                style={{ resize: 'none', height: 60, marginBottom: 6 }}
                value={editPostText}
                onChange={(e) => setEditPostText(e.target.value)}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button className="btn bs bsm" onClick={() => setEditingPostId(null)}><i className="fa-solid fa-xmark" /> Cancel</button>
                <button
                  className="btn bp bsm"
                  disabled={!editPostText.trim() || editPost.isPending}
                  onClick={() => editPost.mutate({ id: p._id, text: editPostText })}
                >
                  <i className="fa-solid fa-check" /> Save
                </button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--t1)', lineHeight: 1.65, marginBottom: 10 }}>{p.text}</div>
          )}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className={`react${p.myReactions.like ? ' on' : ''}`} onClick={() => react.mutate({ id: p._id, type: 'like' })}><i className="fa-solid fa-thumbs-up" /> {p.counts.like}</button>
            <button className={`react${p.myReactions.love ? ' on' : ''}`} onClick={() => react.mutate({ id: p._id, type: 'love' })}><i className="fa-solid fa-heart" /> {p.counts.love}</button>
            <button className={`react${p.myReactions.celebrate ? ' on' : ''}`} onClick={() => react.mutate({ id: p._id, type: 'celebrate' })}><i className="fa-solid fa-champagne-glasses" /> {p.counts.celebrate}</button>
            <span className="react" style={{ marginLeft: 'auto', cursor: 'default' }}><i className="fa-solid fa-comment" /> {p.comments.length}</span>
          </div>
          {p.poll && (() => {
            const closed = p.poll.closesAt && new Date(p.poll.closesAt) < new Date();
            return (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--bd)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)', marginBottom: 8 }}>{p.poll.question}</div>
                {p.poll.options.map((opt, i) => {
                  const pct = p.poll.totalVotes ? Math.round((opt.count / p.poll.totalVotes) * 100) : 0;
                  const mine = i === p.poll.myVoteIndex;
                  return (
                    <div
                      key={i}
                      onClick={() => !closed && votePoll.mutate({ id: p._id, optionIndex: i })}
                      style={{ cursor: closed ? 'default' : 'pointer', marginBottom: 8, opacity: closed && !mine ? 0.7 : 1 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ fontWeight: mine ? 700 : 400, color: mine ? 'var(--accent)' : 'var(--t2)' }}>
                          {opt.text}{mine && <i className="fa-solid fa-check" style={{ marginLeft: 5 }} />}
                        </span>
                        <span style={{ color: 'var(--t3)' }}>{pct}% · {opt.count}</span>
                      </div>
                      <div className="sbar"><div className="sfill" style={{ width: `${pct}%`, background: mine ? 'var(--accent)' : 'var(--bd2)' }} /></div>
                    </div>
                  );
                })}
                <div style={{ fontSize: 10, color: 'var(--t3)' }}>{closed ? 'Poll closed' : `${p.poll.totalVotes} vote${p.poll.totalVotes !== 1 ? 's' : ''}`}</div>
              </div>
            );
          })()}
          {p.comments.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--bd)' }}>
              {p.comments.map((c) => {
                const isOwn = c.authorRef?._id === user?.id;
                const canDelete = isOwn || ['superadmin', 'hr'].includes(user?.role);
                const isEditing = editingCommentId === c._id;
                return (
                  <div key={c._id} style={{ display: 'flex', gap: 7, marginBottom: 7 }}>
                    <Avatar name={c.authorRef?.name} index={c.authorRef?.avatarIndex} src={c.authorRef?.avatarUrl} size={24} fontSize={7} />
                    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '6px 10px', flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t1)' }}>
                          {c.authorRef?.name} <span style={{ fontWeight: 400, color: 'var(--t3)', fontSize: 10 }}>{formatDateTime(c.createdAt)}</span>
                        </div>
                        {!isEditing && canDelete && (
                          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                            {isOwn && (
                              <i
                                className="fa-solid fa-pen"
                                style={{ fontSize: 10, color: 'var(--t3)', cursor: 'pointer' }}
                                onClick={() => {
                                  setEditingCommentId(c._id);
                                  setEditText(c.text);
                                }}
                              />
                            )}
                            {canDelete && (
                              <i
                                className="fa-solid fa-trash"
                                style={{ fontSize: 10, color: 'var(--red)', cursor: 'pointer' }}
                                onClick={() => deleteComment.mutate({ postId: p._id, commentId: c._id })}
                              />
                            )}
                          </div>
                        )}
                      </div>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          <input
                            className="fc"
                            style={{ flex: 1 }}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && editText.trim()) editComment.mutate({ postId: p._id, commentId: c._id, text: editText });
                              if (e.key === 'Escape') setEditingCommentId(null);
                            }}
                            autoFocus
                          />
                          <button
                            className="btn bp bsm"
                            disabled={!editText.trim() || editComment.isPending}
                            onClick={() => editComment.mutate({ postId: p._id, commentId: c._id, text: editText })}
                          >
                            <i className="fa-solid fa-check" />
                          </button>
                          <button className="btn bs bsm" onClick={() => setEditingCommentId(null)}>
                            <i className="fa-solid fa-xmark" />
                          </button>
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--t2)' }}>{c.text}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input
              className="fc"
              placeholder="Write a comment…"
              value={commentDrafts[p._id] || ''}
              onChange={(e) => setCommentDrafts((d) => ({ ...d, [p._id]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && commentDrafts[p._id]?.trim()) comment.mutate({ id: p._id, text: commentDrafts[p._id] });
              }}
            />
            <button
              className="btn bs bsm"
              disabled={!commentDrafts[p._id]?.trim()}
              onClick={() => comment.mutate({ id: p._id, text: commentDrafts[p._id] })}
            >
              <i className="fa-solid fa-paper-plane" />
            </button>
          </div>
        </div>
        );
      })}
      {data?.items.length === 0 && <div style={{ color: 'var(--t3)', fontSize: 12 }}>No posts yet — be the first to share!</div>}
    </div>
  );
}
