import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Avatar from './Avatar';
import { useToast } from '../context/ToastContext';

export default function NewConversationModal({ onClose, onCreated }) {
  const [selected, setSelected] = useState([]);
  const [isGroup, setIsGroup] = useState(false);
  const [name, setName] = useState('');
  const toast = useToast();
  const qc = useQueryClient();

  const { data: users = [] } = useQuery({ queryKey: ['chat-users'], queryFn: () => api.get('/chat/users').then((r) => r.data.items) });

  const create = useMutation({
    mutationFn: () => api.post('/chat/conversations', { memberIds: selected, isGroup, name }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
      onCreated(res.data.conversation._id);
      onClose();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not start conversation.', 'error'),
  });

  function toggle(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  const needsName = isGroup || selected.length > 1;

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 'min(400px, 92vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-comment-dots" /> New Message</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={isGroup} onChange={(e) => setIsGroup(e.target.checked)} /> Group chat
        </label>

        {needsName && (
          <div className="fg">
            <label className="fl">Group Name</label>
            <input className="fc" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Design Team" />
          </div>
        )}

        <div style={{ overflowY: 'auto', flex: 1, border: '1px solid var(--bd)', borderRadius: 8, marginBottom: 12 }}>
          {users.map((u) => (
            <div
              key={u._id}
              onClick={() => toggle(u._id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer',
                background: selected.includes(u._id) ? 'var(--bg3)' : 'transparent',
                borderBottom: '1px solid var(--bd)',
              }}
            >
              <input type="checkbox" checked={selected.includes(u._id)} readOnly />
              <Avatar name={u.name} index={u.avatarIndex} src={u.avatarUrl} size={26} fontSize={9} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{u.name}</div>
                <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'capitalize' }}>{u.role}</div>
              </div>
            </div>
          ))}
          {users.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--t3)' }}>No one else to message yet.</div>}
        </div>

        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button
            className="btn bp bsm"
            disabled={selected.length === 0 || (needsName && !name.trim()) || create.isPending}
            onClick={() => create.mutate()}
          >
            <i className="fa-solid fa-check" /> Start Conversation
          </button>
        </div>
      </div>
    </div>
  );
}
