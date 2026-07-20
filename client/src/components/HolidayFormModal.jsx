import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useToast } from '../context/ToastContext';

function toInputDate(d) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

export default function HolidayFormModal({ holiday, onClose }) {
  const isEdit = !!holiday;
  const [form, setForm] = useState({
    name: holiday?.name || '',
    date: toInputDate(holiday?.date),
    type: holiday?.type || 'National',
    description: holiday?.description || '',
  });
  const toast = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => (isEdit ? api.put(`/holidays/${holiday._id}`, form) : api.post('/holidays', form)),
    onSuccess: () => {
      toast(isEdit ? 'Holiday updated ✓' : 'Holiday added ✓', 'success');
      qc.invalidateQueries({ queryKey: ['holidays'] });
      onClose();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not save holiday.', 'error'),
  });

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-umbrella-beach" /> {isEdit ? 'Edit Holiday' : 'Add Holiday'}</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="fg"><label className="fl">Name</label><input className="fc" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div className="fg2">
          <div className="fg"><label className="fl">Date</label><input type="date" className="fc" value={form.date} onChange={(e) => set('date', e.target.value)} /></div>
          <div className="fg">
            <label className="fl">Type</label>
            <select className="fc" value={form.type} onChange={(e) => set('type', e.target.value)}>
              <option value="National">National</option>
              <option value="Festival">Festival</option>
              <option value="Optional">Optional</option>
            </select>
          </div>
        </div>
        <div className="fg"><label className="fl">Description</label><input className="fc" value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button className="btn bp bsm" disabled={!form.name || !form.date || save.isPending} onClick={() => save.mutate()}>
            <i className="fa-solid fa-check" /> {isEdit ? 'Save Changes' : 'Add Holiday'}
          </button>
        </div>
      </div>
    </div>
  );
}
