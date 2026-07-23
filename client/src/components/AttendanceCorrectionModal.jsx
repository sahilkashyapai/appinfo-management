import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import DatePicker from './DatePicker';
import Select from './Select';
import { useToast } from '../context/ToastContext';
import { STATUSES, STATUS_LABEL } from '../utils/attendance';

function todayInputDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendanceCorrectionModal({ defaultDate, onClose }) {
  const [date, setDate] = useState(defaultDate || todayInputDate());
  const [requestedStatus, setRequestedStatus] = useState('office');
  const [reason, setReason] = useState('');
  const toast = useToast();
  const qc = useQueryClient();

  const submit = useMutation({
    mutationFn: () => api.post('/attendance/corrections', { date, requestedStatus, reason }),
    onSuccess: () => {
      toast('Correction request submitted ✓', 'success');
      qc.invalidateQueries({ queryKey: ['attendance-corrections'] });
      onClose();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not submit request.', 'error'),
  });

  const canSave = !!date && !!reason.trim();

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 'min(400px, 92vw)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-triangle-exclamation" /> Request Attendance Correction</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="fg2">
          <div className="fg">
            <label className="fl">Date</label>
            <DatePicker value={date} max={todayInputDate()} onChange={setDate} />
          </div>
          <div className="fg">
            <label className="fl">Correct Status</label>
            <Select value={requestedStatus} onChange={(e) => setRequestedStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="fg">
          <label className="fl">Reason</label>
          <textarea
            className="fc"
            style={{ resize: 'none', height: 70 }}
            placeholder="e.g. I was in the office that day, not on leave"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button className="btn bp bsm" disabled={!canSave || submit.isPending} onClick={() => submit.mutate()}>
            <i className="fa-solid fa-check" /> Submit Request
          </button>
        </div>
      </div>
    </div>
  );
}
