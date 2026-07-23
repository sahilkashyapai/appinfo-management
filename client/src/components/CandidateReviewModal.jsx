import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useToast } from '../context/ToastContext';

export default function CandidateReviewModal({ candidate, onClose }) {
  const [notes, setNotes] = useState(candidate.notes || '');
  const [referrerComment, setReferrerComment] = useState(candidate.referrerComment || '');
  const toast = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => api.patch(`/job-applications/${candidate._id}`, { notes, referrerComment }),
    onSuccess: () => {
      toast('Saved ✓', 'success');
      qc.invalidateQueries({ queryKey: ['job-applications'] });
      onClose();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not save.', 'error'),
  });

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 'min(460px, 92vw)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-comment" /> Review {candidate.name}</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        {candidate.source === 'referral' && (
          <div className="fg">
            <label className="fl">Comment to Referrer</label>
            <textarea
              className="fc"
              style={{ height: 70, resize: 'none' }}
              value={referrerComment}
              onChange={(e) => setReferrerComment(e.target.value)}
              placeholder="Visible to the employee who referred this candidate, e.g. &quot;Thanks — scheduling round 2 next week.&quot;"
            />
          </div>
        )}
        <div className="fg">
          <label className="fl">Internal Notes (HR only)</label>
          <textarea
            className="fc"
            style={{ height: 70, resize: 'none' }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Never shown to the candidate or referrer."
          />
        </div>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button className="btn bp bsm" disabled={save.isPending} onClick={() => save.mutate()}>
            <i className="fa-solid fa-check" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
