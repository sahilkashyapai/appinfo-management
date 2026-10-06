import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import ConfirmModal from '../ConfirmModal';
import { useToast } from '../../context/ToastContext';
import { ModalShell, SOURCE_BADGE, errMessage, formatMoney, openSlipPdf, periodLabel, sumLines } from './payrollUtils';

const RECALC_MESSAGE =
  "Rebuilds salary-structure and PF/ESI/PT lines from the employee's current salary structure and settings. Lines you added are kept; edits to the other lines are replaced.";

function toForm(slip) {
  return {
    earnings: (slip.earnings || []).map((l) => ({ ...l })),
    deductions: (slip.deductions || []).map((l) => ({ ...l })),
    lopDays: slip.lopDays ?? 0,
    notes: slip.notes || '',
  };
}

function LineRows({ title, lines, readOnly, onChange, onRemove, onAdd, addLabel, currency }) {
  return (
    <div className="fg">
      <label className="fl">{title}</label>
      {lines.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 6 }}>No lines.</div>}
      {lines.map((l, i) => {
        const src = SOURCE_BADGE[l.source] || SOURCE_BADGE.manual;
        return (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <input className="fc" style={{ flex: 1, minWidth: 0 }} placeholder="Line name" value={l.name} disabled={readOnly} onChange={(e) => onChange(i, { name: e.target.value })} />
            <input
              className="fc"
              type="number"
              min={0}
              step="0.01"
              style={{ flex: '0 0 110px', width: 110 }}
              value={l.amount}
              disabled={readOnly}
              onChange={(e) => onChange(i, { amount: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })}
            />
            {/* Fixed width so every row's name and amount boxes line up. */}
            <span
              className={`badge ${src.cls}`}
              style={{ flex: '0 0 104px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              title={l.fullAmount != null && l.fullAmount !== l.amount ? `${src.title} · full month ${formatMoney(l.fullAmount, currency)}` : src.title}
            >
              {src.label}{l.isBasic ? ' · Basic' : ''}
            </span>
            {!readOnly && (
              <button className="btn brd bxs bico" title="Remove line" onClick={() => onRemove(i)}><i className="fa-solid fa-trash" /></button>
            )}
          </div>
        );
      })}
      {!readOnly && (
        <button className="btn bs bxs" onClick={onAdd}><i className="fa-solid fa-plus" /> {addLabel}</button>
      )}
    </div>
  );
}

export default function SlipEditorModal({ slipId, period, onClose }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'recalc' | 'publish' | 'unpublish'

  const { data: slip, isError } = useQuery({
    queryKey: ['payroll-slip', slipId],
    queryFn: () => api.get(`/payroll/slips/${slipId}`).then((r) => r.data.slip),
    // A background refetch would reset the form and throw away unsaved edits.
    staleTime: Infinity,
    gcTime: 0, // always load fresh when the modal reopens
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (slip) setForm(toForm(slip));
  }, [slip]);

  const readOnly = slip?.status === 'published';

  function applySlip(next) {
    qc.setQueryData(['payroll-slip', slipId], next);
    qc.invalidateQueries({ queryKey: ['payroll-slips', period] });
  }

  function payload() {
    return {
      earnings: form.earnings.map((l) => ({ ...l, amount: Number(l.amount) || 0 })),
      deductions: form.deductions.map((l) => ({ ...l, amount: Number(l.amount) || 0 })),
      lopDays: Number(form.lopDays) || 0,
      notes: form.notes,
    };
  }

  const save = useMutation({
    mutationFn: () => api.put(`/payroll/slips/${slipId}`, payload()).then((r) => r.data.slip),
    onSuccess: (next) => {
      applySlip(next);
      toast('Salary slip saved', 'success');
    },
    onError: (err) => toast(errMessage(err, 'Could not save the salary slip.'), 'error'),
  });

  // Recalculate keeps the manual lines stored on the server, so unsaved added
  // lines are saved first - otherwise they'd silently disappear.
  const recalc = useMutation({
    mutationFn: async () => {
      await api.put(`/payroll/slips/${slipId}`, { ...payload() });
      return api.post(`/payroll/slips/${slipId}/recalculate`, { lopDays: form.lopDays === '' ? undefined : Number(form.lopDays) }).then((r) => r.data.slip);
    },
    onSuccess: (next) => {
      applySlip(next);
      setConfirm(null);
      toast('Salary slip recalculated', 'success');
    },
    onError: (err) => {
      setConfirm(null);
      toast(errMessage(err, 'Could not recalculate the salary slip.'), 'error');
    },
  });

  const publish = useMutation({
    mutationFn: async () => {
      await api.put(`/payroll/slips/${slipId}`, payload());
      return api.post(`/payroll/slips/${slipId}/publish`).then((r) => r.data.slip);
    },
    onSuccess: (next) => {
      applySlip(next);
      setConfirm(null);
      toast(`Slip published to ${next.employeeInfo?.name || 'the employee'}'s documents`, 'success');
    },
    onError: (err) => {
      setConfirm(null);
      toast(errMessage(err, 'Could not publish the salary slip.'), 'error');
    },
  });

  const unpublish = useMutation({
    mutationFn: () => api.post(`/payroll/slips/${slipId}/unpublish`).then((r) => r.data.slip),
    onSuccess: (next) => {
      applySlip(next);
      setConfirm(null);
      toast('Slip reverted to draft', 'warning');
    },
    onError: (err) => {
      setConfirm(null);
      toast(errMessage(err, 'Could not revert the salary slip.'), 'error');
    },
  });

  function setLine(kind, i, patch) {
    setForm((f) => ({ ...f, [kind]: f[kind].map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));
  }
  function removeLine(kind, i) {
    setForm((f) => ({ ...f, [kind]: f[kind].filter((_, idx) => idx !== i) }));
  }
  function addLine(kind) {
    setForm((f) => ({ ...f, [kind]: [...f[kind], { name: '', amount: 0, source: 'manual' }] }));
  }

  const busy = save.isPending || recalc.isPending || publish.isPending || unpublish.isPending;

  if (isError) {
    return (
      <ModalShell width={420}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-file-invoice-dollar" /> Salary Slip</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--t3)' }}>Could not load this salary slip.</div>
      </ModalShell>
    );
  }

  if (!slip || !form) {
    return (
      <ModalShell width={420}>
        <div style={{ fontSize: 12, color: 'var(--t3)', padding: 10 }}>Loading salary slip…</div>
      </ModalShell>
    );
  }

  const cur = slip.currency;
  const gross = sumLines(form.earnings);
  const deductions = sumLines(form.deductions);
  const net = Math.round((gross - deductions) * 100) / 100;
  const lop = Number(form.lopDays) || 0;
  const paidDays = Math.max(slip.daysInMonth - lop, 0);
  const info = slip.employeeInfo || {};
  const lopChanged = Number(form.lopDays) !== Number(slip.lopDays);

  return (
    <ModalShell width={1000}>
      <div className="chd">
        <div className="cht"><i className="fa-solid fa-file-invoice-dollar" /> {readOnly ? 'Salary Slip' : 'Edit Salary Slip'}</div>
        <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
        <span><strong style={{ color: 'var(--t1)' }}>{info.name}</strong>{info.empId ? <span style={{ color: 'var(--t3)' }}> · {info.empId}</span> : ''}</span>
        <span><i className="fa-solid fa-calendar" style={{ color: 'var(--t3)' }} /> {periodLabel(slip.period)}</span>
        {slip.office && <span><i className="fa-solid fa-location-dot" style={{ color: 'var(--t3)' }} /> {slip.office}</span>}
        <span>{cur}</span>
        <span className={`badge ${readOnly ? 'b-gr' : 'b-or'}`}>{readOnly ? 'Published' : 'Draft'}</span>
      </div>

      {readOnly && (
        <div style={{ fontSize: 11.5, color: 'var(--t3)', background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '8px 11px', marginBottom: 12 }}>
          <i className="fa-solid fa-lock" /> This slip is published. Revert to draft to edit.
        </div>
      )}

      <div className="g2">
        <LineRows
          title="Earnings"
          lines={form.earnings}
          readOnly={readOnly}
          currency={cur}
          addLabel="Add earning"
          onChange={(i, p) => setLine('earnings', i, p)}
          onRemove={(i) => removeLine('earnings', i)}
          onAdd={() => addLine('earnings')}
        />
        <LineRows
          title="Deductions"
          lines={form.deductions}
          readOnly={readOnly}
          currency={cur}
          addLabel="Add deduction"
          onChange={(i, p) => setLine('deductions', i, p)}
          onRemove={(i) => removeLine('deductions', i)}
          onAdd={() => addLine('deductions')}
        />
      </div>

      <div className="fg2">
        <div className="fg">
          <label className="fl">LOP Days</label>
          <input
            className="fc"
            type="number"
            min={0}
            max={slip.daysInMonth}
            step={0.5}
            value={form.lopDays}
            disabled={readOnly}
            onChange={(e) => setForm((f) => ({ ...f, lopDays: e.target.value === '' ? '' : Math.min(Math.max(Number(e.target.value), 0), slip.daysInMonth) }))}
          />
          {!readOnly && lopChanged && (
            <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 4 }}>
              Save only records the new LOP days - use Recalculate to re-prorate the salary-structure lines.
            </div>
          )}
        </div>
        <div className="fg">
          <label className="fl">Paid Days</label>
          <div className="fc" style={{ background: 'var(--bg3)' }}>{paidDays} of {slip.daysInMonth}</div>
        </div>
      </div>

      <div className="fg">
        <label className="fl">Notes</label>
        <textarea className="fc" rows={2} value={form.notes} disabled={readOnly} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional note shown on the slip" />
      </div>

      <div className="g3" style={{ marginBottom: 14 }}>
        <div className="kpi" style={{ padding: '9px 12px' }}>
          <div><div style={{ fontSize: 10.5, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase' }}>Gross</div><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>{formatMoney(gross, cur)}</div></div>
        </div>
        <div className="kpi" style={{ padding: '9px 12px' }}>
          <div><div style={{ fontSize: 10.5, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase' }}>Deductions</div><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--red)' }}>{formatMoney(deductions, cur)}</div></div>
        </div>
        <div className="kpi" style={{ padding: '9px 12px' }}>
          <div><div style={{ fontSize: 10.5, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase' }}>Net Pay</div><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)' }}>{formatMoney(net, cur)}</div></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button className="btn bs bsm" onClick={onClose}>Close</button>
        <button className="btn bs bsm" onClick={() => openSlipPdf(slipId, toast)}><i className="fa-solid fa-file-pdf" /> {readOnly ? 'PDF' : 'Preview PDF'}</button>
        {readOnly ? (
          <button className="btn bor bsm" disabled={busy} onClick={() => setConfirm('unpublish')}><i className="fa-solid fa-rotate-left" /> Revert to draft</button>
        ) : (
          <>
            <button className="btn bs bsm" disabled={busy} onClick={() => setConfirm('recalc')}><i className="fa-solid fa-calculator" /> Recalculate</button>
            <button className="btn bs bsm" disabled={busy} onClick={() => save.mutate()}><i className="fa-solid fa-floppy-disk" /> Save</button>
            <button className="btn bp bsm" disabled={busy} onClick={() => setConfirm('publish')}><i className="fa-solid fa-paper-plane" /> Publish</button>
          </>
        )}
      </div>

      {confirm === 'recalc' && (
        <ConfirmModal title="Recalculate Slip" message={RECALC_MESSAGE} confirmLabel="Recalculate" pending={recalc.isPending} onConfirm={() => recalc.mutate()} onClose={() => setConfirm(null)} />
      )}
      {confirm === 'publish' && (
        <ConfirmModal
          title="Publish Slip"
          message={`Saves your changes and publishes this slip. ${info.name || 'The employee'} will see it as a PDF in My Documents.`}
          confirmLabel="Publish"
          pending={publish.isPending}
          onConfirm={() => publish.mutate()}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === 'unpublish' && (
        <ConfirmModal
          title="Revert to Draft"
          message={`The slip PDF will be removed from ${info.name || 'the employee'}'s documents and the slip becomes an editable draft again.`}
          confirmLabel="Revert to draft"
          pending={unpublish.isPending}
          onConfirm={() => unpublish.mutate()}
          onClose={() => setConfirm(null)}
        />
      )}
    </ModalShell>
  );
}
