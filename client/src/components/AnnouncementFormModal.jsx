import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Select from './Select';
import { useToast } from '../context/ToastContext';

export default function AnnouncementFormModal({ announcement, defaultType, lockType, onClose }) {
  const isEdit = !!announcement;
  const [form, setForm] = useState({
    title: announcement?.title || '',
    body: announcement?.body || '',
    type: announcement?.type || defaultType || 'general',
    priority: announcement?.priority || 'medium',
    icon: announcement?.icon || (defaultType === 'hiring' ? '💼' : '📢'),
    pinned: announcement?.pinned || false,
  });
  const toast = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => (isEdit ? api.put(`/announcements/${announcement._id}`, form) : api.post('/announcements', form)),
    onSuccess: () => {
      toast(isEdit ? 'Announcement updated ✓' : form.type === 'hiring' ? 'Hiring alert shared with all employees ✓' : 'Announcement posted ✓', 'success');
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
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
      <div className="card" style={{ width: 'min(460px, 92vw)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-bullhorn" /> {isEdit ? 'Edit Announcement' : form.type === 'hiring' ? 'New Hiring Alert' : 'New Announcement'}</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        {!lockType && (
          <div className="fg">
            <label className="fl">Type</label>
            <Select value={form.type} onChange={(e) => set('type', e.target.value)}>
              <option value="general">General Announcement</option>
              <option value="hiring">Hiring Alert</option>
            </Select>
          </div>
        )}
        {form.type === 'hiring' && (
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 12 }}>
            <i className="fa-solid fa-circle-info" /> Every employee gets a notification when this is posted.
          </div>
        )}
        <div className="fg"><label className="fl">Title</label><input className="fc" value={form.title} onChange={(e) => set('title', e.target.value)} /></div>
        <div className="fg"><label className="fl">Body</label><textarea className="fc" style={{ height: 80, resize: 'none' }} value={form.body} onChange={(e) => set('body', e.target.value)} /></div>
        <div className="fg2">
          <div className="fg">
            <label className="fl">Priority</label>
            <Select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
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
