import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import DatePicker from './DatePicker';
import Select from './Select';
import { useToast } from '../context/ToastContext';

function daysBetween(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) return 0;
  return Math.round((e - s) / (24 * 60 * 60 * 1000)) + 1;
}

export default function LeaveRequestModal({ onClose }) {
  const [form, setForm] = useState({ type: 'casual', startDate: '', endDate: '', reason: '' });
  const toast = useToast();
  const qc = useQueryClient();

  const days = daysBetween(form.startDate, form.endDate);

  const save = useMutation({
    mutationFn: () => api.post('/leave/requests', form),
    onSuccess: () => {
      toast('Leave request submitted ✓', 'success');
      qc.invalidateQueries({ queryKey: ['leave-requests'] });
      qc.invalidateQueries({ queryKey: ['leave-balance'] });
      onClose();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not submit request.', 'error'),
  });

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const canSave = form.startDate && form.endDate && form.reason.trim() && days > 0;

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 'min(400px, 92vw)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-plane-departure" /> Request Leave</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="fg">
          <label className="fl">Type</label>
          <Select value={form.type} onChange={(e) => set('type', e.target.value)}>
            <option value="casual">Casual</option>
            <option value="sick">Sick</option>
            <option value="earned">Earned</option>
          </Select>
        </div>
        <div className="fg2">
          <div className="fg"><label className="fl">Start Date</label><DatePicker value={form.startDate} onChange={(v) => set('startDate', v)} /></div>
          <div className="fg"><label className="fl">End Date</label><DatePicker value={form.endDate} onChange={(v) => set('endDate', v)} min={form.startDate} /></div>
        </div>
        {days > 0 && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: -6, marginBottom: 10 }}>{days} day{days > 1 ? 's' : ''}</div>}
        <div className="fg"><label className="fl">Reason</label><textarea className="fc" style={{ resize: 'none', height: 60 }} value={form.reason} onChange={(e) => set('reason', e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button className="btn bp bsm" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
            <i className="fa-solid fa-check" /> Submit
          </button>
        </div>
      </div>
    </div>
  );
}
