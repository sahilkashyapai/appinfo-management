import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { ModalShell, errMessage } from './payrollUtils';

// Employee raises a query about one of their published salary slips.
export default function SalaryQueryModal({ doc, onClose }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [message, setMessage] = useState('');

  const send = useMutation({
    mutationFn: () => api.post('/salary-queries', { documentId: doc._id, message }),
    onSuccess: () => {
      toast('Query sent to HR. You will be notified when they reply.', 'success');
      qc.invalidateQueries({ queryKey: ['salary-queries'] });
      onClose();
    },
    onError: (err) => toast(errMessage(err, 'Could not send your query.'), 'error'),
  });

  return (
    <ModalShell width={480}>
      <div className="chd">
        <div className="cht"><i className="fa-solid fa-circle-question" /> Raise a salary query</div>
        <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 10 }}>
        About: <strong style={{ color: 'var(--t1)' }}>{doc.name}</strong>. Tell HR what looks wrong, for example a deduction or loss-of-pay day you think shouldn't be there.
      </div>
      <div className="fg">
        <label className="fl">Your query</label>
        <textarea
          className="fc"
          rows={5}
          maxLength={2000}
          autoFocus
          placeholder="e.g. 1 day LOP was deducted for 2 October, but my leave for that day was approved."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 4, textAlign: 'right' }}>{message.length}/2000</div>
      </div>
      <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
        <button className="btn bs bsm" onClick={onClose}>Cancel</button>
        <button className="btn bp bsm" disabled={message.trim().length < 5 || send.isPending} onClick={() => send.mutate()}>
          <i className="fa-solid fa-paper-plane" /> Send to HR
        </button>
      </div>
    </ModalShell>
  );
}
