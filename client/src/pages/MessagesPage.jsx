import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Avatar from '../components/Avatar';
import NewConversationModal from '../components/NewConversationModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDateTime } from '../utils/avatar';

const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

function otherMember(conversation, userId) {
  return conversation.members.find((m) => m._id !== userId);
}

function conversationTitle(conversation, userId) {
  if (conversation.isGroup) return conversation.name;
  return otherMember(conversation, userId)?.name || 'Unknown';
}

export default function MessagesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState(location.state?.conversationId || searchParams.get('conversation') || null);
  const [showNew, setShowNew] = useState(false);
  const [text, setText] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const fileInputRef = useRef(null);
  const threadEndRef = useRef(null);

  const { data: conversations = [] } = useQuery({
    queryKey: ['chat-conversations'],
    queryFn: () => api.get('/chat/conversations').then((r) => r.data.items),
    refetchInterval: 20000,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['chat-messages', selectedId],
    queryFn: () => api.get(`/chat/conversations/${selectedId}/messages`).then((r) => r.data.items),
    enabled: !!selectedId,
  });

  const selected = conversations.find((c) => c._id === selectedId);

  useEffect(() => {
    const id = location.state?.conversationId || searchParams.get('conversation');
    if (id) setSelectedId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.conversationId, searchParams.get('conversation')]);

  const markRead = useMutation({ mutationFn: (id) => api.patch(`/chat/conversations/${id}/read`) });

  useEffect(() => {
    if (selectedId) {
      markRead.mutate(selectedId, { onSuccess: () => qc.invalidateQueries({ queryKey: ['chat-conversations'] }) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, selectedId]);

  const send = useMutation({
    mutationFn: () => api.post(`/chat/conversations/${selectedId}/messages`, { text, attachments: pendingFiles }),
    onSuccess: () => {
      setText('');
      setPendingFiles([]);
      qc.invalidateQueries({ queryKey: ['chat-messages', selectedId] });
      qc.invalidateQueries({ queryKey: ['chat-conversations'] });
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not send message.', 'error'),
  });

  function onFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (pendingFiles.length + files.length > MAX_ATTACHMENTS) {
      toast(`You can attach at most ${MAX_ATTACHMENTS} files.`, 'error');
      return;
    }
    files.forEach((file) => {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast(`${file.name} is over 3MB.`, 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setPendingFiles((f) => [...f, { name: file.name, type: file.type, url: reader.result }]);
      reader.readAsDataURL(file);
    });
  }

  function removePending(idx) {
    setPendingFiles((f) => f.filter((_, i) => i !== idx));
  }

  const canSend = (text.trim() || pendingFiles.length > 0) && !send.isPending;

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Messages</div>
          <div className="pgs">Chat privately or in groups — separate from the Celebration Wall</div>
        </div>
        <div className="ph-r">
          <button className="btn bp bsm" onClick={() => setShowNew(true)}><i className="fa-solid fa-pen" /> New Message</button>
        </div>
      </div>

      <div className={`msg-wrap${selected ? ' has-selected' : ''}`}>
        <div className="card msg-list" style={{ width: 280, flexShrink: 0, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {conversations.map((c) => {
              const title = conversationTitle(c, user?.id);
              const other = !c.isGroup ? otherMember(c, user?.id) : null;
              return (
                <div
                  key={c._id}
                  onClick={() => setSelectedId(c._id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', cursor: 'pointer',
                    background: selectedId === c._id ? 'var(--bg3)' : 'transparent',
                    borderBottom: '1px solid var(--bd)',
                  }}
                >
                  {c.isGroup ? (
                    <div className="av" style={{ width: 34, height: 34, background: 'var(--accent)' }}><i className="fa-solid fa-users" /></div>
                  ) : (
                    <Avatar name={other?.name} index={other?.avatarIndex} src={other?.avatarUrl} size={34} fontSize={11} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--t3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.lastMessageText || 'No messages yet'}
                    </div>
                  </div>
                  {c.unreadCount > 0 && <span className="nb">{c.unreadCount}</span>}
                </div>
              );
            })}
            {conversations.length === 0 && <div style={{ padding: 14, fontSize: 12, color: 'var(--t3)' }}>No conversations yet. Start one!</div>}
          </div>
        </div>

        <div className="card msg-thread" style={{ flex: 1, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', fontSize: 12 }}>
              Select a conversation or start a new one.
            </div>
          ) : (
            <>
              <div className="chd" style={{ padding: '12px 14px' }}>
                <div className="cht">
                  <button className="btn bs bxs bico" title="Back" onClick={() => setSelectedId(null)}>
                    <i className="fa-solid fa-arrow-left" />
                  </button>
                  {selected.isGroup ? <i className="fa-solid fa-users" /> : <i className="fa-solid fa-user" />} {conversationTitle(selected, user?.id)}
                </div>
                {selected.isGroup && (
                  <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>{selected.members.map((m) => m.name).join(', ')}</div>
                )}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.map((m) => {
                  const isOwn = m.senderRef?._id === user?.id;
                  return (
                    <div key={m._id} style={{ display: 'flex', flexDirection: isOwn ? 'row-reverse' : 'row', gap: 7, alignItems: 'flex-end' }}>
                      <Avatar name={m.senderRef?.name} index={m.senderRef?.avatarIndex} src={m.senderRef?.avatarUrl} size={22} fontSize={7} />
                      <div style={{ maxWidth: '70%' }}>
                        {selected.isGroup && !isOwn && (
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', marginBottom: 2 }}>{m.senderRef?.name}</div>
                        )}
                        <div
                          style={{
                            background: isOwn ? 'var(--accent)' : 'var(--bg3)',
                            color: isOwn ? '#fff' : 'var(--t1)',
                            padding: '7px 11px',
                            borderRadius: 10,
                            fontSize: 12,
                            lineHeight: 1.5,
                          }}
                        >
                          {m.text && <div>{m.text}</div>}
                          {m.attachments?.map((a, i) =>
                            a.type?.startsWith('image/') ? (
                              <img key={i} src={a.url} alt={a.name} style={{ maxWidth: 200, borderRadius: 6, marginTop: m.text ? 6 : 0, display: 'block' }} />
                            ) : (
                              <a
                                key={i}
                                href={a.url}
                                download={a.name}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: m.text ? 6 : 0, color: 'inherit', textDecoration: 'underline' }}
                              >
                                <i className="fa-solid fa-paperclip" /> {a.name}
                              </a>
                            )
                          )}
                        </div>
                        <div style={{ fontSize: 9.5, color: 'var(--t3)', marginTop: 2, textAlign: isOwn ? 'right' : 'left' }}>{formatDateTime(m.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={threadEndRef} />
              </div>

              {pendingFiles.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 14px 8px' }}>
                  {pendingFiles.map((f, i) => (
                    <span key={i} className="badge b-bl" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {f.name}
                      <i className="fa-solid fa-xmark" style={{ cursor: 'pointer' }} onClick={() => removePending(i)} />
                    </span>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, padding: 12, borderTop: '1px solid var(--bd)' }}>
                <input ref={fileInputRef} type="file" multiple hidden onChange={onFilesSelected} />
                <button className="btn bs bico" onClick={() => fileInputRef.current?.click()}><i className="fa-solid fa-paperclip" /></button>
                <input
                  className="fc"
                  style={{ flex: 1 }}
                  placeholder="Type a message…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canSend) send.mutate();
                  }}
                />
                <button className="btn bp" disabled={!canSend} onClick={() => send.mutate()}>
                  <i className="fa-solid fa-paper-plane" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showNew && <NewConversationModal onClose={() => setShowNew(false)} onCreated={setSelectedId} />}
    </div>
  );
}
