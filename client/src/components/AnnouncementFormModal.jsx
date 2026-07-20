import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useToast } from '../context/ToastContext';

export default function AnnouncementFormModal({ announcement, onClose }) {
  const isEdit = !!announcement;
  const [form, setForm] = useState({
    title: announcement?.title || '',
    body: announcement?.body || '',
    priority: announcement?.priority || 'medium',
    icon: announcement?.icon || '📢',
    pinned: announcement?.pinned || false,
  });
  const toast = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => (isEdit ? api.put(`/announcements/${announcement._id}`, form) : api.post('/announcements', form)),
    onSuccess: () => {
      toast(isEdit ? 'Announcement updated ✓' : 'Announcement posted ✓', 'success');
      qc.invalidateQueries({ queryKey: ['announcements'] });
      onClose();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not save announcement.', 'error'),
  });

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-bullhorn" /> {isEdit ? 'Edit Announcement' : 'New Announcement'}</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="fg"><label className="fl">Title</label><input className="fc" value={form.title} onChange={(e) => set('title', e.target.value)} /></div>
        <div className="fg"><label className="fl">Body</label><textarea className="fc" style={{ height: 80, resize: 'none' }} value={form.body} onChange={(e) => set('body', e.target.value)} /></div>
        <div className="fg2">
          <div className="fg">
            <label className="fl">Priority</label>
            <select className="fc" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="fg"><label className="fl">Icon (emoji)</label><input className="fc" value={form.icon} onChange={(e) => set('icon', e.target.value)} /></div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.pinned} onChange={(e) => set('pinned', e.target.checked)} /> Pin to top
        </label>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button className="btn bp bsm" disabled={!form.title || !form.body || save.isPending} onClick={() => save.mutate()}>
            <i className="fa-solid fa-check" /> {isEdit ? 'Save Changes' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
