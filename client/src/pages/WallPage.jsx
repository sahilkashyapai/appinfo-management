import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Avatar from '../components/Avatar';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const TAG_BADGE = { birthday: 'b-or', anniversary: 'b-go', event: 'b-bl', general: 'b-gy' };

export default function WallPage() {
  const [tag, setTag] = useState('all');
  const [text, setText] = useState('');
  const [commentDrafts, setCommentDrafts] = useState({});
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['wall', tag],
    queryFn: () => api.get('/wall', { params: { tag } }).then((r) => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['wall'] });

  const post = useMutation({
    mutationFn: () => api.post('/wall', { text, tag: 'general' }),
    onSuccess: () => {
      setText('');
      toast('Posted on Celebration Wall!', 'success');
      invalidate();
    },
  });

  const react = useMutation({ mutationFn: ({ id, type }) => api.post(`/wall/${id}/react`, { type }), onSuccess: invalidate });
  const comment = useMutation({
    mutationFn: ({ id, text: t }) => api.post(`/wall/${id}/comments`, { text: t }),
    onSuccess: (_res, vars) => {
      setCommentDrafts((d) => ({ ...d, [vars.id]: '' }));
      invalidate();
    },
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
          </select>
        </div>
      </div>

      <div className="card mb13">
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Avatar name={user?.name} index={user?.avatarIndex} size={36} fontSize={12} />
          <div style={{ flex: 1 }}>
            <textarea
              className="fc"
              placeholder="Share a birthday wish, congratulations, or celebration message…"
              style={{ resize: 'none', height: 72, marginBottom: 8 }}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <button className="btn bp bsm" disabled={!text.trim() || post.isPending} onClick={() => post.mutate()}>
                <i className="fa-solid fa-paper-plane" /> Post
              </button>
            </div>
          </div>
        </div>
      </div>

      {data?.items.map((p) => (
        <div className="wp" key={p._id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <Avatar name={p.authorRef?.name} index={p.authorRef?.avatarIndex} size={34} fontSize={11} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>{p.authorRef?.name || 'Unknown'}</div>
              <div style={{ fontSize: 10, color: 'var(--t3)' }}>{new Date(p.createdAt).toLocaleString()}</div>
            </div>
            <span className={`badge ${TAG_BADGE[p.tag] || 'b-gy'}`}>{p.tag}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t1)', lineHeight: 1.65, marginBottom: 10 }}>{p.text}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className={`react${p.myReactions.like ? ' on' : ''}`} onClick={() => react.mutate({ id: p._id, type: 'like' })}><i className="fa-solid fa-thumbs-up" /> {p.counts.like}</button>
            <button className={`react${p.myReactions.love ? ' on' : ''}`} onClick={() => react.mutate({ id: p._id, type: 'love' })}><i className="fa-solid fa-heart" /> {p.counts.love}</button>
            <button className={`react${p.myReactions.celebrate ? ' on' : ''}`} onClick={() => react.mutate({ id: p._id, type: 'celebrate' })}><i className="fa-solid fa-champagne-glasses" /> {p.counts.celebrate}</button>
            <span className="react" style={{ marginLeft: 'auto', cursor: 'default' }}><i className="fa-solid fa-comment" /> {p.comments.length}</span>
          </div>
          {p.comments.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--bd)' }}>
              {p.comments.map((c) => (
                <div key={c._id} style={{ display: 'flex', gap: 7, marginBottom: 7 }}>
                  <Avatar name={c.authorRef?.name} index={c.authorRef?.avatarIndex} size={24} fontSize={7} />
                  <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: '6px 10px', flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t1)' }}>
                      {c.authorRef?.name} <span style={{ fontWeight: 400, color: 'var(--t3)', fontSize: 10 }}>{new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t2)' }}>{c.text}</div>
                  </div>
                </div>
              ))}
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
      ))}
      {data?.items.length === 0 && <div style={{ color: 'var(--t3)', fontSize: 12 }}>No posts yet — be the first to share!</div>}
    </div>
  );
}
