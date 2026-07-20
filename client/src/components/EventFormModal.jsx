import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useToast } from '../context/ToastContext';

const TYPE_EMOJI = { festival: '🪔', workshop: '🎓', town_hall: '🏛️', team_outing: '🏔️', sports: '🏆', birthday: '🎂', other: '🎉' };

export default function EventFormModal({ onClose }) {
  const [form, setForm] = useState({
    title: '', type: 'other', date: '', venue: '', capacity: 100, color: '#2E86AB', status: 'draft',
  });
  const toast = useToast();
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: () => api.post('/events', { ...form, emoji: TYPE_EMOJI[form.type] || '🎉' }),
    onSuccess: () => {
      toast(`${form.title} created ✓`, 'success');
      qc.invalidateQueries({ queryKey: ['events'] });
      onClose();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not create event.', 'error'),
  });

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-calendar-plus" /> Create Event</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="fg"><label className="fl">Title</label><input className="fc" value={form.title} onChange={(e) => set('title', e.target.value)} /></div>
        <div className="fg2">
          <div className="fg">
            <label className="fl">Type</label>
            <select className="fc" value={form.type} onChange={(e) => set('type', e.target.value)}>
              {Object.keys(TYPE_EMOJI).map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="fg"><label className="fl">Date</label><input type="date" className="fc" value={form.date} onChange={(e) => set('date', e.target.value)} /></div>
        </div>
        <div className="fg"><label className="fl">Venue</label><input className="fc" value={form.venue} onChange={(e) => set('venue', e.target.value)} /></div>
        <div className="fg2">
          <div className="fg"><label className="fl">Capacity</label><input type="number" className="fc" value={form.capacity} onChange={(e) => set('capacity', Number(e.target.value))} /></div>
          <div className="fg">
            <label className="fl">Status</label>
            <select className="fc" value={form.status} onChange={(e) => set('status', e.target.value)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button className="btn bp bsm" disabled={!form.title || !form.date || create.isPending} onClick={() => create.mutate()}>
            <i className="fa-solid fa-check" /> Create Event
          </button>
        </div>
      </div>
    </div>
  );
}
