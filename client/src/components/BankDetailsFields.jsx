import { useState } from 'react';

// An employee's PAN + salary account. Shared by sign-up, the profile card,
// the change-request modal, the structure editor and HR's Bank Requests tab.
// Same formats the API enforces (server/src/utils/bankDetails.js).

export const BANK_FIELDS = [
  { key: 'pan', label: 'PAN' },
  { key: 'accountHolder', label: 'Account holder name' },
  { key: 'bankName', label: 'Bank name' },
  { key: 'bankAccount', label: 'Account number' },
  { key: 'ifsc', label: 'IFSC' },
];

export const EMPTY_BANK = { pan: '', accountHolder: '', bankName: '', bankAccount: '', ifsc: '' };

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_REGEX = /^[0-9]{6,20}$/;

// Picks the five bank fields (as strings) out of any object.
export function pickBank(src) {
  return Object.fromEntries(BANK_FIELDS.map(({ key }) => [key, src?.[key] || '']));
}

// Form values -> request body, trimmed. With `omitEmpty`, blank fields are left out.
export function bankPayload(v, { omitEmpty = false } = {}) {
  const out = {};
  for (const { key } of BANK_FIELDS) {
    const value = String(v?.[key] || '').trim();
    if (!omitEmpty || value) out[key] = value;
  }
  return out;
}

export function hasAnyBank(v) {
  return BANK_FIELDS.some(({ key }) => String(v?.[key] || '').trim());
}

export function sameBank(a, b) {
  return BANK_FIELDS.every(({ key }) => String(a?.[key] || '').trim() === String(b?.[key] || '').trim());
}

// -> { field: message } for fields that are filled in but malformed.
// `confirmAccount` is checked only when `withConfirm` is set.
export function bankErrors(v, { withConfirm = true } = {}) {
  const errs = {};
  const pan = String(v.pan || '').trim();
  const ifsc = String(v.ifsc || '').trim();
  const acc = String(v.bankAccount || '').trim();
  if (pan && !PAN_REGEX.test(pan)) errs.pan = 'PAN should look like ABCDE1234F.';
  if (ifsc && !IFSC_REGEX.test(ifsc)) errs.ifsc = 'IFSC should look like HDFC0001234 (11 characters, 5th is zero).';
  if (acc && !ACCOUNT_REGEX.test(acc)) errs.bankAccount = 'Account number should be 6-20 digits.';
  if (withConfirm && acc !== String(v.confirmAccount || '').trim()) errs.confirmAccount = 'Account numbers do not match.';
  return errs;
}

export function maskAccount(acc) {
  const s = String(acc || '');
  if (s.length <= 4) return s;
  return `${'•'.repeat(Math.min(s.length - 4, 8))}${s.slice(-4)}`;
}

// Masked account number with a small show/hide toggle.
export function MaskedAccount({ value, style }) {
  const [show, setShow] = useState(false);
  if (!value) return <span style={{ color: 'var(--t3)', ...style }}>-</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...style }}>
      <span style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: show ? 0 : '.04em' }}>{show ? value : maskAccount(value)}</span>
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        title={show ? 'Hide account number' : 'Show account number'}
        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--accent)', fontSize: 10.5, fontWeight: 700 }}
      >
        <i className={`fa-solid ${show ? 'fa-eye-slash' : 'fa-eye'}`} /> {show ? 'hide' : 'show'}
      </button>
    </span>
  );
}

// Read-only value for one bank field.
export function BankValue({ field, value }) {
  if (field === 'bankAccount') return <MaskedAccount value={value} />;
  return value ? <span>{value}</span> : <span style={{ color: 'var(--t3)' }}>-</span>;
}

function Hint({ msg }) {
  if (!msg) return null;
  return <div style={{ fontSize: 10.5, color: 'var(--red)', marginTop: 3 }}>{msg}</div>;
}

// Inputs for the five fields, plus "Confirm account number" when `withConfirm`.
// `value` holds the five fields and `confirmAccount`; onChange(key, value).
export function BankDetailsFields({ value, onChange, withConfirm = true, disabled = false }) {
  const errs = bankErrors(value, { withConfirm });
  // Show the mismatch only once they've started confirming.
  const confirmErr = value.confirmAccount ? errs.confirmAccount : '';
  return (
    <div className="fg2">
      <div className="fg">
        <label className="fl">PAN</label>
        <input className="fc" placeholder="ABCDE1234F" maxLength={10} disabled={disabled} value={value.pan} onChange={(e) => onChange('pan', e.target.value.toUpperCase().replace(/\s/g, ''))} />
        <Hint msg={errs.pan} />
      </div>
      <div className="fg">
        <label className="fl">Account Holder Name</label>
        <input className="fc" placeholder="As per bank records" maxLength={191} disabled={disabled} value={value.accountHolder} onChange={(e) => onChange('accountHolder', e.target.value)} />
      </div>
      <div className="fg">
        <label className="fl">Bank Name</label>
        <input className="fc" placeholder="e.g. HDFC Bank" maxLength={191} disabled={disabled} value={value.bankName} onChange={(e) => onChange('bankName', e.target.value)} />
      </div>
      <div className="fg">
        <label className="fl">IFSC</label>
        <input className="fc" placeholder="HDFC0001234" maxLength={11} disabled={disabled} value={value.ifsc} onChange={(e) => onChange('ifsc', e.target.value.toUpperCase().replace(/\s/g, ''))} />
        <Hint msg={errs.ifsc} />
      </div>
      <div className="fg">
        <label className="fl">Account Number</label>
        <input className="fc" inputMode="numeric" autoComplete="off" placeholder="6-20 digits" maxLength={20} disabled={disabled} value={value.bankAccount} onChange={(e) => onChange('bankAccount', e.target.value.replace(/\D/g, ''))} />
        <Hint msg={errs.bankAccount} />
      </div>
      {withConfirm && (
        <div className="fg">
          <label className="fl">Confirm Account Number</label>
          <input
            className="fc"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Re-enter account number"
            maxLength={20}
            disabled={disabled}
            value={value.confirmAccount || ''}
            onChange={(e) => onChange('confirmAccount', e.target.value.replace(/\D/g, ''))}
            onPaste={(e) => e.preventDefault()}
          />
          <Hint msg={confirmErr} />
        </div>
      )}
    </div>
  );
}
