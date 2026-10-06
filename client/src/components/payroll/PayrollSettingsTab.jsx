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

function SectionHeading({ icon, title, badge, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', margin: '6px 2px 10px' }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--t1)' }}><i className={`fa-solid ${icon}`} style={{ color: 'var(--accent)', marginRight: 6 }} />{title}</div>
      {badge}
      {children && <div style={{ fontSize: 11.5, color: 'var(--t3)' }}>{children}</div>}
    </div>
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

  const officeGrid = officeEntries.length >= 3 ? 'g3' : officeEntries.length === 2 ? 'g2' : '';
  const multiOffice = officeEntries.length > 1;

  return (
    <>
      <SectionHeading icon="fa-building" title={scope.office ? `Your office · ${scope.office}` : 'Offices'}>
        {scope.office
          ? "Currency, company name, address and phone printed on your employees' salary slips."
          : "Each employee is paid in their office's currency; the office's company details head their slip."}
      </SectionHeading>
      <div className={`${officeGrid} mb13`}>
        {officeEntries.map(([name, o]) => (
          <div key={name} className="card">
            <div className="chd">
              <div className="cht"><i className="fa-solid fa-location-dot" /> {multiOffice ? name : 'Company details on the slip'}</div>
              <ResetButton onClick={() => update((f) => { if (defaults.offices?.[name]) f.offices[name] = { ...clone(defaults.offices[name]), statutory: f.offices[name].statutory }; })} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 12px' }}>
              <div className="fg" style={{ flex: '0 0 96px' }}>
                <label className="fl">Currency</label>
                <input className="fc" maxLength={3} placeholder="INR" value={o.currency} onChange={(e) => update((f) => { f.offices[name].currency = e.target.value.toUpperCase(); })} />
              </div>
              <div className="fg" style={{ flex: '1 1 240px', minWidth: 0 }}>
                <label className="fl">Company Name</label>
                <input className="fc" placeholder={branding?.companyName} value={o.companyName} onChange={(e) => update((f) => { f.offices[name].companyName = e.target.value; })} />
              </div>
              <div className="fg" style={{ flex: '1 1 180px', minWidth: 0 }}>
                <label className="fl">Phone</label>
                <input className="fc" placeholder="e.g. 0172-4065302" value={o.phone || ''} onChange={(e) => update((f) => { f.offices[name].phone = e.target.value; })} />
              </div>
            </div>
            <div className="fg">
              <label className="fl">Address</label>
              <textarea className="fc" rows={2} placeholder="Registered office address" value={o.address} onChange={(e) => update((f) => { f.offices[name].address = e.target.value; })} />
            </div>
            <ToggleRow
              label="Indian statutory deductions"
              hint={canEditShared ? 'Apply PF, ESI and Professional Tax to this office' : 'PF, ESI and Professional Tax · set by a company-wide admin'}
              checked={o.statutory}
              disabled={!canEditShared}
              onChange={(v) => update((f) => { f.offices[name].statutory = v; })}
            />
          </div>
        ))}
      </div>

      {form.pf && (
        <>
          <SectionHeading icon="fa-scale-balanced" title="Statutory deductions (India)">
            Calculated automatically on every slip for offices with Indian statutory deductions switched on.
          </SectionHeading>
          <div className="g3 mb13">
            <div className="card">
              <div className="chd">
                <div className="cht"><i className="fa-solid fa-piggy-bank" /> Provident Fund</div>
                <ResetButton onClick={() => resetKey('pf')} />
              </div>
              <ToggleRow label="PF enabled" hint="Employee share, on the Basic line" checked={form.pf.enabled} onChange={(v) => update((f) => { f.pf.enabled = v; })} />
              <NumberRow label="Rate" value={form.pf.ratePct} suffix="%" disabled={!form.pf.enabled} onChange={(v) => update((f) => { f.pf.ratePct = v; })} />
              <ToggleRow label="Wage ceiling" hint="PF on the lower of Basic and the ceiling" checked={form.pf.applyWageCeiling} onChange={(v) => update((f) => { f.pf.applyWageCeiling = v; })} />
              <NumberRow label="Ceiling amount" hint="Per month" value={form.pf.wageCeiling} disabled={!form.pf.enabled || !form.pf.applyWageCeiling} onChange={(v) => update((f) => { f.pf.wageCeiling = v; })} />
            </div>
            <div className="card">
              <div className="chd">
                <div className="cht"><i className="fa-solid fa-notes-medical" /> ESI</div>
                <ResetButton onClick={() => resetKey('esi')} />
              </div>
              <ToggleRow label="ESI enabled" hint="Employees' State Insurance" checked={form.esi.enabled} onChange={(v) => update((f) => { f.esi.enabled = v; })} />
              <NumberRow label="Rate" value={form.esi.ratePct} suffix="%" disabled={!form.esi.enabled} onChange={(v) => update((f) => { f.esi.ratePct = v; })} />
              <NumberRow label="Gross limit" hint="Applies at or below this monthly gross" value={form.esi.grossThreshold} disabled={!form.esi.enabled} onChange={(v) => update((f) => { f.esi.grossThreshold = v; })} />
            </div>
            <div className="card">
              <div className="chd">
                <div className="cht"><i className="fa-solid fa-landmark" /> Professional Tax</div>
                <ResetButton onClick={() => resetKey('pt')} />
              </div>
              <ToggleRow label="PT enabled" hint="Fixed monthly deduction" checked={form.pt.enabled} onChange={(v) => update((f) => { f.pt.enabled = v; })} />
              <NumberRow label="Monthly amount" value={form.pt.monthlyAmount} disabled={!form.pt.enabled} onChange={(v) => update((f) => { f.pt.monthlyAmount = v; })} />
              <NumberRow label="Income limit" hint="Applies above this annual gross" value={form.pt.annualIncomeThreshold} disabled={!form.pt.enabled} onChange={(v) => update((f) => { f.pt.annualIncomeThreshold = v; })} />
            </div>
          </div>
        </>
      )}

      {/* Shared by every office: read-only for an office-scoped HR. */}
      <SectionHeading icon="fa-globe" title="Shared settings" badge={!canEditShared && <span className="badge b-gy"><i className="fa-solid fa-lock" /> Read only</span>}>
        {canEditShared ? 'These apply to every office.' : 'These apply to every office, so only a company-wide admin can change them.'}
      </SectionHeading>
      <fieldset disabled={!canEditShared} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="g2 mb13">
          <div className="card">
            <div className="chd">
              <div className="cht"><i className="fa-solid fa-calendar-minus" /> Loss of Pay</div>
              {canEditShared && <ResetButton onClick={() => resetKey('lopBasis')} />}
            </div>
            <div className="fg">
              <label className="fl">Days used for per-day pay</label>
              <Select value={form.lopBasis} disabled={!canEditShared} onChange={(e) => update((f) => { f.lopBasis = e.target.value; })}>
                {LOP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
              <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 6 }}>
                Per-day pay = monthly gross ÷ these days. Only days off without an approved leave are deducted.
              </div>
            </div>
          </div>
          <div className="card">
            <div className="chd">
              <div className="cht"><i className="fa-solid fa-note-sticky" /> Slip Footer</div>
              {canEditShared && <ResetButton onClick={() => resetKey('footerNote')} />}
            </div>
            <div className="fg">
              <label className="fl">Printed at the bottom of every slip</label>
              <textarea className="fc" rows={3} maxLength={300} placeholder="e.g. This is a computer-generated slip and does not need a signature." value={form.footerNote || ''} onChange={(e) => update((f) => { f.footerNote = e.target.value; })} />
            </div>
          </div>
        </div>

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
                {canEditShared && <button className="btn brd bxs bico" title="Remove" onClick={() => update((f) => { f.defaultEarnings.splice(i, 1); })}><i className="fa-solid fa-trash" /></button>}
              </div>
            ))}
            {canEditShared && <button className="btn bs bxs" onClick={() => update((f) => { f.defaultEarnings.push({ name: '' }); })}><i className="fa-solid fa-plus" /> Add earning</button>}
          </div>
          <div className="card">
            <div className="chd">
              <div className="cht"><i className="fa-solid fa-list-check" /> Default Deductions</div>
              {canEditShared && <ResetButton onClick={() => resetKey('defaultDeductions')} />}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>Fixed deduction lines a new salary structure starts with. PF, ESI and PT are added automatically.</div>
            {form.defaultDeductions.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 6 }}>None.</div>}
            {form.defaultDeductions.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <input className="fc" style={{ flex: 1, minWidth: 0 }} placeholder="e.g. TDS" value={l.name} onChange={(e) => update((f) => { f.defaultDeductions[i].name = e.target.value; })} />
                {canEditShared && <button className="btn brd bxs bico" title="Remove" onClick={() => update((f) => { f.defaultDeductions.splice(i, 1); })}><i className="fa-solid fa-trash" /></button>}
              </div>
            ))}
            {canEditShared && <button className="btn bs bxs" onClick={() => update((f) => { f.defaultDeductions.push({ name: '' }); })}><i className="fa-solid fa-plus" /> Add deduction</button>}
          </div>
        </div>
      </fieldset>

      {/* Sticky so Save is always in reach on this long page. */}
      <div
        className="card"
        style={{
          position: 'sticky',
          bottom: 12,
          zIndex: 5,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '10px 14px',
          boxShadow: '0 6px 24px rgba(13,27,42,.12)',
        }}
      >
        <span style={{ fontSize: 12, color: dirty ? 'var(--orange, #E67E22)' : 'var(--t3)', marginRight: 'auto' }}>
          <i className={`fa-solid ${dirty ? 'fa-circle-exclamation' : 'fa-circle-check'}`} /> {dirty ? 'You have unsaved changes' : 'All changes saved'}
        </span>
        {dirty && <button className="btn bs bsm" onClick={() => { setForm(clone(data.payroll)); setDirty(false); }}>Discard</button>}
        <button className="btn bp bsm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}><i className="fa-solid fa-check" /> Save changes</button>
      </div>
    </>
  );
}
