import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import ConfirmModal from '../ConfirmModal';
import { useToast } from '../../context/ToastContext';
import { ModalShell, ToggleRow, errMessage, formatMoney, sumLines } from './payrollUtils';

function toForm(s) {
  return {
    earnings: (s.earnings || []).map((l) => ({ name: l.name, amount: l.amount, isBasic: !!l.isBasic })),
    deductions: (s.deductions || []).map((l) => ({ name: l.name, amount: l.amount })),
    pfApplicable: !!s.pfApplicable,
    esiApplicable: !!s.esiApplicable,
    ptApplicable: !!s.ptApplicable,
    pan: s.pan || '',
    uan: s.uan || '',
    epfNumber: s.epfNumber || '',
    esiNumber: s.esiNumber || '',
    address: s.address || '',
    bankName: s.bankName || '',
    bankAccount: s.bankAccount || '',
    ifsc: s.ifsc || '',
  };
}

export default function StructureEditorModal({ employeeId, onClose }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const { data, isError } = useQuery({
    queryKey: ['payroll-structure', employeeId],
    queryFn: () => api.get(`/payroll/structures/${employeeId}`).then((r) => r.data),
    staleTime: Infinity,
    gcTime: 0,
  });

  useEffect(() => {
    if (data) setForm(toForm(data.structure || {}));
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api.put(`/payroll/structures/${employeeId}`, {
        ...form,
        earnings: form.earnings.map((l) => ({ name: l.name, amount: Number(l.amount) || 0, ...(l.isBasic ? { isBasic: true } : {}) })),
        deductions: form.deductions.map((l) => ({ name: l.name, amount: Number(l.amount) || 0 })),
      }),
    onSuccess: () => {
      toast(`Salary structure saved for ${data.employee?.name}`, 'success');
      qc.invalidateQueries({ queryKey: ['payroll-structures'] });
      onClose();
    },
    onError: (err) => toast(errMessage(err, 'Could not save the salary structure.'), 'error'),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/payroll/structures/${employeeId}`),
    onSuccess: () => {
      toast(`Salary structure removed for ${data.employee?.name}`, 'warning');
      qc.invalidateQueries({ queryKey: ['payroll-structures'] });
      onClose();
    },
    onError: (err) => {
      setConfirmRemove(false);
      toast(errMessage(err, 'Could not remove the salary structure.'), 'error');
    },
  });

  if (isError || !data || !form) {
    return (
      <ModalShell width={420}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-money-check-dollar" /> Salary Structure</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--t3)' }}>{isError ? 'Could not load this salary structure.' : 'Loading…'}</div>
      </ModalShell>
    );
  }

  const { employee, office, isNew } = data;
  const cur = office?.currency;
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setLine = (kind, i, patch) => setForm((f) => ({ ...f, [kind]: f[kind].map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));
  const removeLine = (kind, i) => setForm((f) => ({ ...f, [kind]: f[kind].filter((_, idx) => idx !== i) }));
  const setBasic = (i) => setForm((f) => ({ ...f, earnings: f.earnings.map((l, idx) => ({ ...l, isBasic: idx === i ? !l.isBasic : false })) }));
  const amountInput = (kind, l, i) => (
    <input
      className="fc"
      type="number"
      min={0}
      step="0.01"
      style={{ width: 130 }}
      value={l.amount}
      onChange={(e) => setLine(kind, i, { amount: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })}
    />
  );

  return (
    <ModalShell width={640}>
      <div className="chd">
        <div className="cht"><i className="fa-solid fa-money-check-dollar" /> {isNew ? 'Set Salary Structure' : 'Edit Salary Structure'}</div>
        <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 12, color: 'var(--t2)', marginBottom: 12 }}>
        <span><strong style={{ color: 'var(--t1)' }}>{employee?.name}</strong>{employee?.empId ? <span style={{ color: 'var(--t3)' }}> · {employee.empId}</span> : ''}</span>
        {office?.name && <span><i className="fa-solid fa-location-dot" style={{ color: 'var(--t3)' }} /> {office.name}</span>}
        {cur && <span>{cur}</span>}
        {isNew && <span className="badge b-gy">Not set yet — prefilled from defaults</span>}
      </div>

      <div className="fg">
        <label className="fl">Monthly Earnings</label>
        {form.earnings.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <input className="fc" style={{ flex: 1, minWidth: 0 }} placeholder="e.g. Basic, HRA" value={l.name} onChange={(e) => setLine('earnings', i, { name: e.target.value })} />
            {amountInput('earnings', l, i)}
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--t2)', cursor: 'pointer', whiteSpace: 'nowrap' }} title="PF is calculated on the Basic line">
              <input type="radio" name="basic-line" checked={!!l.isBasic} onChange={() => {}} onClick={() => setBasic(i)} /> Basic
            </label>
            <button className="btn brd bxs bico" title="Remove line" onClick={() => removeLine('earnings', i)}><i className="fa-solid fa-trash" /></button>
          </div>
        ))}
        <button className="btn bs bxs" onClick={() => set('earnings', [...form.earnings, { name: '', amount: 0, isBasic: false }])}><i className="fa-solid fa-plus" /> Add earning</button>
        <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 4 }}>Mark at most one line as Basic — PF is calculated on it. Click the selected radio again to clear it.</div>
      </div>

      <div className="fg">
        <label className="fl">Fixed Monthly Deductions</label>
        {form.deductions.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 6 }}>None (e.g. TDS, loan EMI).</div>}
        {form.deductions.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <input className="fc" style={{ flex: 1, minWidth: 0 }} placeholder="e.g. TDS, Loan EMI" value={l.name} onChange={(e) => setLine('deductions', i, { name: e.target.value })} />
            {amountInput('deductions', l, i)}
            <button className="btn brd bxs bico" title="Remove line" onClick={() => removeLine('deductions', i)}><i className="fa-solid fa-trash" /></button>
          </div>
        ))}
        <button className="btn bs bxs" onClick={() => set('deductions', [...form.deductions, { name: '', amount: 0 }])}><i className="fa-solid fa-plus" /> Add deduction</button>
      </div>

      <div className="g2 mb13">
        <div className="kpi" style={{ padding: '9px 12px' }}>
          <div><div style={{ fontSize: 10.5, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase' }}>Monthly Gross</div><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>{formatMoney(sumLines(form.earnings), cur)}</div></div>
        </div>
        <div className="kpi" style={{ padding: '9px 12px' }}>
          <div><div style={{ fontSize: 10.5, color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase' }}>Fixed Deductions</div><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--red)' }}>{formatMoney(sumLines(form.deductions), cur)}</div></div>
        </div>
      </div>

      <div className="fg">
        <label className="fl">Statutory Deductions</label>
        {office && office.statutory === false && (
          <div style={{ fontSize: 11.5, color: 'var(--t3)', background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '8px 11px', marginBottom: 6 }}>
            <i className="fa-solid fa-circle-info" /> PF, ESI and Professional Tax don't apply to the {office.name} office, so these switches have no effect there.
          </div>
        )}
        <ToggleRow label="PF applies" hint="Provident Fund, calculated on the Basic line" checked={form.pfApplicable} onChange={(v) => set('pfApplicable', v)} />
        <ToggleRow label="ESI applies" hint="Only when monthly gross is within the ESI limit" checked={form.esiApplicable} onChange={(v) => set('esiApplicable', v)} />
        <ToggleRow label="Professional Tax applies" hint="Only when annual gross is above the PT limit" checked={form.ptApplicable} onChange={(v) => set('ptApplicable', v)} />
      </div>

      <div className="fg2">
        <div className="fg"><label className="fl">PAN</label><input className="fc" placeholder="ABCDE1234F" value={form.pan} onChange={(e) => set('pan', e.target.value.toUpperCase())} /></div>
        <div className="fg"><label className="fl">UAN</label><input className="fc" value={form.uan} onChange={(e) => set('uan', e.target.value)} /></div>
        <div className="fg"><label className="fl">EPF Number</label><input className="fc" placeholder="PB/MOH/0012345/000/0101" value={form.epfNumber} onChange={(e) => set('epfNumber', e.target.value.toUpperCase())} /></div>
        <div className="fg"><label className="fl">ESI Number</label><input className="fc" placeholder="Leave empty if not covered" value={form.esiNumber} onChange={(e) => set('esiNumber', e.target.value)} /></div>
        <div className="fg"><label className="fl">Bank Name</label><input className="fc" value={form.bankName} onChange={(e) => set('bankName', e.target.value)} /></div>
        <div className="fg"><label className="fl">Account Number</label><input className="fc" value={form.bankAccount} onChange={(e) => set('bankAccount', e.target.value)} /></div>
        <div className="fg"><label className="fl">IFSC</label><input className="fc" placeholder="SBIN0001234" value={form.ifsc} onChange={(e) => set('ifsc', e.target.value.toUpperCase())} /></div>
      </div>
      <div className="fg">
        <label className="fl">Employee Address</label>
        <textarea className="fc" rows={2} maxLength={500} placeholder="Printed on the salary slip" value={form.address} onChange={(e) => set('address', e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {!isNew && (
          <button className="btn brd bsm" style={{ marginRight: 'auto' }} onClick={() => setConfirmRemove(true)}><i className="fa-solid fa-trash" /> Remove structure</button>
        )}
        <button className="btn bs bsm" onClick={onClose}>Cancel</button>
        <button className="btn bp bsm" disabled={save.isPending} onClick={() => save.mutate()}><i className="fa-solid fa-check" /> Save</button>
      </div>

      {confirmRemove && (
        <ConfirmModal
          title="Remove Salary Structure"
          message={`Removes ${employee?.name}'s salary structure. No new slips will be generated for them until a structure is set again. Existing slips are not affected.`}
          confirmLabel="Remove"
          danger
          pending={remove.isPending}
          onConfirm={() => remove.mutate()}
          onClose={() => setConfirmRemove(false)}
        />
      )}
    </ModalShell>
  );
}
