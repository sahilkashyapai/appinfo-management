import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useToast } from '../context/ToastContext';

const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

const TYPE_LABEL = {
  salary_slip: 'Salary Slip',
  experience_letter: 'Experience Letter',
  relieving_letter: 'Relieving Letter',
  salary_certificate: 'Salary Certificate',
  form16: 'Form 16',
  other: 'Document',
};

export default function DocumentFulfillModal({ request, onClose }) {
  const [file, setFile] = useState(null);
  const toast = useToast();
  const qc = useQueryClient();

  const fulfill = useMutation({
    mutationFn: (body) => api.patch(`/documents/requests/${request._id}/fulfill`, body),
    onSuccess: () => {
      toast('Document delivered ✓', 'success');
      qc.invalidateQueries({ queryKey: ['document-requests'] });
      onClose();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not deliver document.', 'error'),
  });

  function onFileSelected(ev) {
    const f = ev.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_DOCUMENT_BYTES) {
      toast(`${f.name} is over 4MB.`, 'error');
      ev.target.value = '';
      return;
    }
    setFile(f);
  }

  function submit() {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => fulfill.mutate({ fileName: file.name, fileType: file.type, fileUrl: reader.result });
    reader.readAsDataURL(file);
  }

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 'min(400px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-paper-plane" /> Deliver Document</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 10 }}>
          {TYPE_LABEL[request.type]}{request.period ? ` — ${request.period}` : ''} for <strong>{request.employeeRef?.name}</strong>
        </div>
        <div className="fg">
          <label className="fl">File (max 4MB)</label>
          <input className="fc" type="file" onChange={onFileSelected} />
        </div>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button className="btn bp bsm" disabled={!file || fulfill.isPending} onClick={submit}>
            <i className="fa-solid fa-check" /> Deliver
          </button>
        </div>
      </div>
    </div>
  );
}
