import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import MonthPicker from './MonthPicker';
import Select from './Select';
import { useToast } from '../context/ToastContext';

const TYPE_LABEL = {
  salary_slip: 'Salary Slip',
  experience_letter: 'Experience Letter',
  relieving_letter: 'Relieving Letter',
  salary_certificate: 'Salary Certificate',
  form16: 'Form 16',
  other: 'Other',
};
const TYPES = Object.keys(TYPE_LABEL);
const RANGE_OPTIONS = [
  { value: 1, label: '1 month' },
  { value: 2, label: '2 months' },
  { value: 3, label: '3 months' },
  { value: 6, label: '6 months' },
];

function monthLabel(value) {
  if (!value) return '';
  const [y, m] = value.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function addMonths(value, n) {
  const [y, m] = value.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function computePeriod(startValue, months) {
  if (!startValue) return '';
  if (months <= 1) return monthLabel(startValue);
  return `${monthLabel(startValue)} – ${monthLabel(addMonths(startValue, months - 1))}`;
}

export default function DocumentRequestModal({ onClose }) {
  const [type, setType] = useState('salary_slip');
  const [startMonth, setStartMonth] = useState('');
  const [months, setMonths] = useState(1);
  const [note, setNote] = useState('');
  const toast = useToast();
  const qc = useQueryClient();

  const period = computePeriod(startMonth, months);

  const submit = useMutation({
    mutationFn: () => api.post('/documents/requests', { type, period, note }),
    onSuccess: () => {
      toast('Document request submitted ✓', 'success');
      qc.invalidateQueries({ queryKey: ['document-requests'] });
      onClose();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not submit request.', 'error'),
  });

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 'min(400px, 92vw)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-file-circle-plus" /> Request Document</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="fg">
          <label className="fl">Document Type</label>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </Select>
        </div>
        {type === 'salary_slip' && (
          <>
            <div className="fg2">
              <div className="fg"><label className="fl">Starting Month</label><MonthPicker value={startMonth} onChange={setStartMonth} /></div>
              <div className="fg">
                <label className="fl">Range</label>
                <Select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                  {RANGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </div>
            </div>
            {period && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: -6, marginBottom: 10 }}>Requesting: {period}</div>}
          </>
        )}
        <div className="fg">
          <label className="fl">Note (optional)</label>
          <textarea className="fc" style={{ resize: 'none', height: 60 }} placeholder="Any details HR should know…" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button className="btn bp bsm" disabled={submit.isPending} onClick={() => submit.mutate()}>
            <i className="fa-solid fa-check" /> Submit Request
          </button>
        </div>
      </div>
    </div>
  );
}
