import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import { formatDate } from '../utils/avatar';
import { ModalShell, errMessage } from './payroll/payrollUtils';
import { BANK_FIELDS, BankDetailsFields, BankValue, bankErrors, bankPayload, hasAnyBank, pickBank, sameBank } from './BankDetailsFields';

// Shared with BankDetailsReminder (the post-login popup), so saving here hides it.
export const BANK_DETAILS_QUERY_KEY = ['bank-details', 'mine'];
const QUERY_KEY = BANK_DETAILS_QUERY_KEY;

function ReadOnlyGrid({ values }) {
  return (
    <div className="fg2">
      {BANK_FIELDS.map(({ key, label }) => (
        <div className="fg" key={key}>
          <label className="fl">{label}</label>
          <div className="fc" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg3)', color: 'var(--t1)' }}>
            <BankValue field={key} value={values[key]} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RequestChangeModal({ current, onClose }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...current, confirmAccount: current.bankAccount, reason: '' });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const errs = bankErrors(form);
  const unchanged = sameBank(form, current);
  const reasonOk = form.reason.trim().length >= 5;

  const submit = useMutation({
    mutationFn: () => api.post('/profile/bank-details/requests', { ...bankPayload(form), reason: form.reason.trim() }),
    onSuccess: () => {
      toast('Change request sent to HR', 'success');
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      onClose();
    },
    onError: (err) => toast(errMessage(err, 'Could not send the change request.'), 'error'),
  });

  return (
    <ModalShell width={560}>
      <div className="chd">
        <div className="cht"><i className="fa-solid fa-pen-to-square" /> Request a Change</div>
        <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
        Update the details below. HR will review your request; the new values apply only once it's approved.
      </div>
      <BankDetailsFields value={form} onChange={set} />
      <div className="fg">
        <label className="fl">Reason</label>
        <textarea
          className="fc"
          rows={3}
          maxLength={1000}
          placeholder="e.g. I moved my salary account to a new bank"
          value={form.reason}
          onChange={(e) => set('reason', e.target.value)}
        />
        {form.reason && !reasonOk && <div style={{ fontSize: 10.5, color: 'var(--red)', marginTop: 3 }}>Tell HR a little more about why.</div>}
      </div>
      {unchanged && <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 10 }}>Change at least one field to send a request.</div>}
      <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
        <button className="btn bs bsm" onClick={onClose}>Cancel</button>
        <button
          className="btn bp bsm"
          disabled={submit.isPending || unchanged || !reasonOk || Object.keys(errs).length > 0}
          onClick={() => submit.mutate()}
        >
          <i className="fa-solid fa-paper-plane" /> Send to HR
        </button>
      </div>
    </ModalShell>
  );
}

export default function BankDetailsCard() {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(null);
  const [requesting, setRequesting] = useState(false);
  const cardRef = useRef(null);
  const { hash } = useLocation();

  const { data, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.get('/profile/bank-details').then((r) => r.data),
  });

  // Prefill the editable form with anything HR already entered.
  useEffect(() => {
    if (data && !data.locked) {
      const bank = pickBank(data.bankDetails);
      setForm({ ...bank, confirmAccount: bank.bankAccount });
    }
  }, [data]);

  // /profile#bank (from the reminder popup) scrolls to this card once it has loaded.
  const loaded = !!data;
  useEffect(() => {
    if (loaded && hash === '#bank') cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loaded, hash]);

  const save = useMutation({
    mutationFn: () => api.put('/profile/bank-details', bankPayload(form)),
    onSuccess: () => {
      toast('Bank & PAN details saved', 'success');
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err) => toast(errMessage(err, 'Could not save your bank details.'), 'error'),
  });

  const header = (
    <div className="chd">
      <div className="cht"><i className="fa-solid fa-building-columns" /> Bank &amp; PAN Details</div>
      {data?.locked && <span className="badge b-gy"><i className="fa-solid fa-lock" /> Locked</span>}
    </div>
  );

  if (isError || !data) {
    return (
      <div className="card mb13" id="bank" ref={cardRef}>
        {header}
        <div style={{ fontSize: 12, color: 'var(--t3)' }}>{isError ? 'Could not load your bank details.' : 'Loading…'}</div>
      </div>
    );
  }

  const current = pickBank(data.bankDetails);
  const pending = data.pendingRequest;
  const last = !pending ? data.lastDecision : null;

  if (!data.locked) {
    if (!form) return <div id="bank" ref={cardRef} />;
    const errs = bankErrors(form);
    return (
      <div className="card mb13" id="bank" ref={cardRef}>
        {header}
        <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>Used to pay your salary and printed on your salary slips.</div>
        <BankDetailsFields value={form} onChange={(k, v) => setForm((f) => ({ ...f, [k]: v }))} />
        <div style={{ fontSize: 11.5, color: 'var(--orange)', marginBottom: 10 }}>
          <i className="fa-solid fa-triangle-exclamation" /> After you save, you can't change these yourself - changes need HR approval.
        </div>
        <button
          className="btn bp bsm"
          disabled={save.isPending || !hasAnyBank(form) || Object.keys(errs).length > 0}
          onClick={() => save.mutate()}
        >
          <i className="fa-solid fa-check" /> Save
        </button>
      </div>
    );
  }

  return (
    <div className="card mb13" id="bank" ref={cardRef}>
      {header}
      <ReadOnlyGrid values={current} />
      <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 10 }}>
        <i className="fa-solid fa-circle-check" style={{ color: 'var(--green)' }} /> Saved {formatDate(data.lockedAt)}. To change these, send a request to HR.
      </div>

      {pending && (
        <div style={{ marginBottom: 10, padding: '8px 10px', borderLeft: '3px solid var(--orange)', background: 'var(--bg3)', borderRadius: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>
            <i className="fa-solid fa-hourglass-half" /> Change request pending with HR
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--t3)' }}> · sent {formatDate(pending.createdAt)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', fontSize: 11.5 }}>
            {BANK_FIELDS.map(({ key, label }) => (
              <div key={key} style={{ display: 'contents' }}>
                <span style={{ color: 'var(--t3)' }}>{label}</span>
                <span style={{ color: 'var(--t1)', fontWeight: pending[key] !== current[key] ? 700 : 400 }}>
                  <BankValue field={key} value={pending[key]} />
                </span>
              </div>
            ))}
          </div>
          {pending.reason && <div style={{ fontSize: 11.5, color: 'var(--t2)', marginTop: 6, whiteSpace: 'pre-wrap' }}>Reason: {pending.reason}</div>}
        </div>
      )}

      {last?.status === 'rejected' && (
        <div style={{ marginBottom: 10, padding: '8px 10px', borderLeft: '3px solid var(--red)', background: 'var(--bg3)', borderRadius: 4, fontSize: 12, whiteSpace: 'pre-wrap' }}>
          <i className="fa-solid fa-circle-xmark" style={{ color: 'var(--red)' }} /> Your last request was rejected: {last.decisionNote || 'no reason given'}
        </div>
      )}
      {last?.status === 'approved' && (
        <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 10 }}>
          Your last request was approved on {formatDate(last.decidedAt)}.
        </div>
      )}

      <button
        className="btn bs bsm"
        disabled={!!pending}
        title={pending ? 'You already have a request waiting for HR' : undefined}
        onClick={() => setRequesting(true)}
      >
        <i className="fa-solid fa-pen-to-square" /> Request a change
      </button>

      {requesting && <RequestChangeModal current={current} onClose={() => setRequesting(false)} />}
    </div>
  );
}
