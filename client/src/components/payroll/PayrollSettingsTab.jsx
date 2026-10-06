import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import Select from '../Select';
import { useBranding } from '../../context/BrandingContext';
import { useToast } from '../../context/ToastContext';
import { ToggleRow, errMessage } from './payrollUtils';

const LOP_OPTIONS = [
  { value: 'calendar', label: 'Days in the month (28–31)' },
  { value: 'working', label: 'Working days (Mon–Fri, excluding holidays)' },
  { value: 'fixed30', label: 'Always 30 days' },
];

const clone = (v) => JSON.parse(JSON.stringify(v));

function NumberRow({ label, hint, value, onChange, suffix, disabled }) {
  return (
    <div className="trow">
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: disabled ? 'var(--t3)' : 'var(--t1)' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--t3)' }}>{hint}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <input type="number" min={0} step="any" className="fc" style={{ width: 110 }} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        {suffix && <span style={{ fontSize: 11.5, color: 'var(--t3)' }}>{suffix}</span>}
      </div>
    </div>
  );
}

function ResetButton({ onClick }) {
  return (
    <button className="btn bs bxs" title="Reset this section to defaults (save to apply)" onClick={onClick}>
      <i className="fa-solid fa-rotate-left" /> Defaults
    </button>
  );
}

export default function PayrollSettingsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const branding = useBranding();
  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);

  const { data } = useQuery({
    queryKey: ['payroll-settings'],
    queryFn: () => api.get('/payroll/settings').then((r) => r.data),
  });

  useEffect(() => {
    if (data && !dirty) setForm(clone(data.payroll));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const canEditShared = data?.scope?.canEditShared ?? true;

  const save = useMutation({
    mutationFn: () => {
      const n = (v) => Number(v) || 0;
      // Only what this HR may change: an office-scoped HR sends just their
      // office (plus PF/ESI/PT for an Indian office); the server enforces this too.
      const body = {
        offices: Object.fromEntries(Object.entries(form.offices).map(([k, o]) => [k, { ...o, currency: String(o.currency || '').trim().toUpperCase() }])),
      };
      if (form.pf) {
        body.pf = { ...form.pf, ratePct: n(form.pf.ratePct), wageCeiling: n(form.pf.wageCeiling) };
        body.esi = { ...form.esi, ratePct: n(form.esi.ratePct), grossThreshold: n(form.esi.grossThreshold) };
        body.pt = { ...form.pt, monthlyAmount: n(form.pt.monthlyAmount), annualIncomeThreshold: n(form.pt.annualIncomeThreshold) };
      }
      if (canEditShared) {
        body.lopBasis = form.lopBasis;
        body.defaultEarnings = form.defaultEarnings.map((l) => ({ name: l.name, ...(l.isBasic ? { isBasic: true } : {}) }));
        body.defaultDeductions = form.defaultDeductions.map((l) => ({ name: l.name }));
        body.footerNote = form.footerNote;
      }
      return api.put('/payroll/settings', body).then((r) => r.data.payroll);
    },
    onSuccess: (payroll) => {
      toast('Payroll settings saved', 'success');
      setForm(clone(payroll));
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['payroll-settings'] });
      // Currency/office changes show up in the structures list.
      qc.invalidateQueries({ queryKey: ['payroll-structures'] });
    },
    onError: (err) => toast(errMessage(err, 'Could not save payroll settings.'), 'error'),
  });

  if (!form) return <div style={{ fontSize: 12, color: 'var(--t3)' }}>Loading payroll settings…</div>;

  const defaults = data?.defaults || {};
  const scope = data?.scope || { office: null, canEditShared: true };
  const officeEntries = Object.entries(form.offices || {});
  const update = (fn) => {
    setForm((f) => {
      const next = clone(f);
      fn(next);
      return next;
    });
    setDirty(true);
  };
  const resetKey = (key) => defaults[key] !== undefined && update((f) => { f[key] = clone(defaults[key]); });

  return (
    <>
      <div className="card mb13">
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-building" /> Offices</div>
          <ResetButton onClick={() => resetKey('offices')} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 10 }}>
          {scope.office
            ? `You manage payroll for ${scope.office}. Its currency, company name and address appear on your employees' slips.`
            : "Each employee is paid in their office's currency, and the office's company name and address appear at the top of their slip."}
        </div>
        <div className={officeEntries.length > 1 ? 'g2' : ''}>
          {officeEntries.map(([name, o]) => (
            <div key={name} style={{ border: '1px solid var(--bd)', borderRadius: 'var(--r)', padding: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--t1)', marginBottom: 8 }}><i className="fa-solid fa-location-dot" style={{ color: 'var(--t3)' }} /> {name}</div>
              <div className="fg2">
                <div className="fg">
                  <label className="fl">Currency</label>
                  <input className="fc" maxLength={3} placeholder="INR" value={o.currency} onChange={(e) => update((f) => { f.offices[name].currency = e.target.value.toUpperCase(); })} />
                </div>
                <div className="fg">
                  <label className="fl">Company Name on Slip</label>
                  <input className="fc" placeholder={branding?.companyName} value={o.companyName} onChange={(e) => update((f) => { f.offices[name].companyName = e.target.value; })} />
                </div>
              </div>
              <div className="fg">
                <label className="fl">Address</label>
                <textarea className="fc" rows={2} value={o.address} onChange={(e) => update((f) => { f.offices[name].address = e.target.value; })} />
              </div>
              <div className="fg">
                <label className="fl">Phone</label>
                <input className="fc" placeholder="e.g. 0172-4065302" value={o.phone || ''} onChange={(e) => update((f) => { f.offices[name].phone = e.target.value; })} />
              </div>
              <ToggleRow
                label="Apply Indian statutory deductions"
                hint={canEditShared ? 'PF, ESI and Professional Tax' : 'PF, ESI and Professional Tax · set by a company-wide admin'}
                checked={o.statutory}
                disabled={!canEditShared}
                onChange={(v) => update((f) => { f.offices[name].statutory = v; })}
              />
            </div>
          ))}
        </div>
      </div>

      {form.pf ? (
      <div className="g2 mb13">
        <div>
          <div className="card mb13">
            <div className="chd">
              <div className="cht"><i className="fa-solid fa-piggy-bank" /> Provident Fund (PF)</div>
              <ResetButton onClick={() => resetKey('pf')} />
            </div>
            <ToggleRow label="PF enabled" hint="Employee contribution, calculated on the Basic line" checked={form.pf.enabled} onChange={(v) => update((f) => { f.pf.enabled = v; })} />
            <NumberRow label="Rate" value={form.pf.ratePct} suffix="%" disabled={!form.pf.enabled} onChange={(v) => update((f) => { f.pf.ratePct = v; })} />
            <ToggleRow label="Limit basic to a wage ceiling" hint="PF is calculated on the lower of Basic and the ceiling" checked={form.pf.applyWageCeiling} onChange={(v) => update((f) => { f.pf.applyWageCeiling = v; })} />
            <NumberRow label="Wage ceiling" hint="Monthly amount" value={form.pf.wageCeiling} disabled={!form.pf.enabled || !form.pf.applyWageCeiling} onChange={(v) => update((f) => { f.pf.wageCeiling = v; })} />
          </div>
          <div className="card">
            <div className="chd">
              <div className="cht"><i className="fa-solid fa-notes-medical" /> ESI</div>
              <ResetButton onClick={() => resetKey('esi')} />
            </div>
            <ToggleRow label="ESI enabled" hint="Employees' State Insurance" checked={form.esi.enabled} onChange={(v) => update((f) => { f.esi.enabled = v; })} />
            <NumberRow label="Rate" value={form.esi.ratePct} suffix="%" disabled={!form.esi.enabled} onChange={(v) => update((f) => { f.esi.ratePct = v; })} />
            <NumberRow label="Gross salary limit" hint="ESI applies when monthly gross is at or below this" value={form.esi.grossThreshold} disabled={!form.esi.enabled} onChange={(v) => update((f) => { f.esi.grossThreshold = v; })} />
          </div>
        </div>
        <div>
          <div className="card mb13">
            <div className="chd">
              <div className="cht"><i className="fa-solid fa-landmark" /> Professional Tax</div>
              <ResetButton onClick={() => resetKey('pt')} />
            </div>
            <ToggleRow label="Professional Tax enabled" checked={form.pt.enabled} onChange={(v) => update((f) => { f.pt.enabled = v; })} />
            <NumberRow label="Monthly amount" value={form.pt.monthlyAmount} disabled={!form.pt.enabled} onChange={(v) => update((f) => { f.pt.monthlyAmount = v; })} />
            <NumberRow label="Annual income limit" hint="PT applies when annual gross is above this" value={form.pt.annualIncomeThreshold} disabled={!form.pt.enabled} onChange={(v) => update((f) => { f.pt.annualIncomeThreshold = v; })} />
          </div>
        </div>
      </div>
      ) : null}

      {/* Shared by every office: read-only for an office-scoped HR. */}
      {!canEditShared && (
        <div style={{ fontSize: 11.5, color: 'var(--t3)', margin: '4px 0 8px' }}>
          <i className="fa-solid fa-lock" /> Loss of pay, default lines and the slip footer apply to every office. Only a company-wide admin can change them.
        </div>
      )}
      <div className="card mb13">
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-calendar-minus" /> Loss of Pay</div>
          {canEditShared && <ResetButton onClick={() => resetKey('lopBasis')} />}
        </div>
        <div className="fg">
          <label className="fl">Days used for per-day pay</label>
          <Select value={form.lopBasis} disabled={!canEditShared} onChange={(e) => update((f) => { f.lopBasis = e.target.value; })}>
            {LOP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 4 }}>Per-day pay = monthly gross ÷ these days. Each LOP day deducts one day's pay.</div>
        </div>
      </div>

      <fieldset disabled={!canEditShared} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <div className="g2 mb13">
        <div className="card">
          <div className="chd">
            <div className="cht"><i className="fa-solid fa-list" /> Default Earnings</div>
            {canEditShared && <ResetButton onClick={() => resetKey('defaultEarnings')} />}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>Lines a new salary structure starts with. Mark one as Basic — PF is calculated on it.</div>
          {form.defaultEarnings.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <input className="fc" style={{ flex: 1, minWidth: 0 }} placeholder="e.g. Basic" value={l.name} onChange={(e) => update((f) => { f.defaultEarnings[i].name = e.target.value; })} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--t2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input
                  type="radio"
                  name="default-basic"
                  checked={!!l.isBasic}
                  onChange={() => {}}
                  onClick={() => update((f) => { f.defaultEarnings.forEach((x, idx) => { x.isBasic = idx === i ? !l.isBasic : false; }); })}
                /> Basic
              </label>
              <button className="btn brd bxs bico" title="Remove" onClick={() => update((f) => { f.defaultEarnings.splice(i, 1); })}><i className="fa-solid fa-trash" /></button>
            </div>
          ))}
          <button className="btn bs bxs" onClick={() => update((f) => { f.defaultEarnings.push({ name: '' }); })}><i className="fa-solid fa-plus" /> Add earning</button>
        </div>
        <div className="card">
          <div className="chd">
            <div className="cht"><i className="fa-solid fa-list-check" /> Default Deductions</div>
            {canEditShared && <ResetButton onClick={() => resetKey('defaultDeductions')} />}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>Fixed deduction lines a new salary structure starts with (PF/ESI/PT are added automatically).</div>
          {form.defaultDeductions.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 6 }}>None.</div>}
          {form.defaultDeductions.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <input className="fc" style={{ flex: 1, minWidth: 0 }} placeholder="e.g. TDS" value={l.name} onChange={(e) => update((f) => { f.defaultDeductions[i].name = e.target.value; })} />
              <button className="btn brd bxs bico" title="Remove" onClick={() => update((f) => { f.defaultDeductions.splice(i, 1); })}><i className="fa-solid fa-trash" /></button>
            </div>
          ))}
          <button className="btn bs bxs" onClick={() => update((f) => { f.defaultDeductions.push({ name: '' }); })}><i className="fa-solid fa-plus" /> Add deduction</button>
        </div>
      </div>

      <div className="card mb13">
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-note-sticky" /> Slip Footer</div>
          {canEditShared && <ResetButton onClick={() => resetKey('footerNote')} />}
        </div>
        <textarea className="fc" rows={2} maxLength={300} placeholder="e.g. This is a computer-generated slip and does not need a signature." value={form.footerNote || ''} onChange={(e) => update((f) => { f.footerNote = e.target.value; })} />
      </div>
      </fieldset>

      <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end', alignItems: 'center' }}>
        {dirty && <span style={{ fontSize: 11.5, color: 'var(--t3)' }}>Unsaved changes</span>}
        {dirty && (
          <button className="btn bs bsm" onClick={() => { setForm(clone(data.payroll)); setDirty(false); }}>Discard</button>
        )}
        <button className="btn bp bsm" disabled={save.isPending} onClick={() => save.mutate()}><i className="fa-solid fa-check" /> Save</button>
      </div>
    </>
  );
}
