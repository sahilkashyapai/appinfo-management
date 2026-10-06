import api from '../../api/client';

const LOCALES = { INR: 'en-IN', USD: 'en-US', ZAR: 'en-ZA' };

export function formatMoney(n, cur) {
  const value = Number(n) || 0;
  try {
    return new Intl.NumberFormat(LOCALES[cur] || 'en-US', { style: 'currency', currency: cur || 'INR' }).format(value);
  } catch {
    // An invalid currency code (e.g. mid-edit in settings) shouldn't crash the page.
    return `${cur || ''} ${value.toFixed(2)}`.trim();
  }
}

export function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function periodLabel(period) {
  const [y, m] = String(period || '').split('-').map(Number);
  if (!y || !m) return period || '';
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function sumLines(lines) {
  return Math.round((lines || []).reduce((s, l) => s + (Number(l.amount) || 0), 0) * 100) / 100;
}

export function errMessage(err, fallback) {
  return err?.response?.data?.message || fallback;
}

// Same approach as HiringPage: fetch the file through the authed API client,
// then open it as a blob URL. The tab is opened up front (synchronously in the
// click) so popup blockers don't swallow it after the await.
export async function openSlipPdf(id, toast) {
  const win = window.open('', '_blank');
  try {
    const res = await api.get(`/payroll/slips/${id}/pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    if (win) win.location.href = url;
    else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    if (win) win.close();
    let msg = 'Could not load the salary slip PDF.';
    // With responseType 'blob', a JSON error body arrives as a Blob too.
    const data = err?.response?.data;
    if (data instanceof Blob) {
      try {
        msg = JSON.parse(await data.text()).message || msg;
      } catch { /* not JSON */ }
    }
    toast(msg, 'error');
  }
}

export function ToggleRow({ label, hint, checked, onChange, disabled }) {
  return (
    <div className="trow">
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--t3)' }}>{hint}</div>}
      </div>
      <label className="tgl">
        <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <div className="tgl-t" />
        <div className="tgl-d" />
      </label>
    </div>
  );
}

export const SOURCE_BADGE = {
  structure: { label: 'Structure', cls: 'b-bl', title: 'From the salary structure' },
  statutory: { label: 'PF/ESI/PT', cls: 'b-pu', title: 'Calculated statutory deduction' },
  manual: { label: 'Added', cls: 'b-gy', title: 'Added by HR on this slip' },
};

// Shared full-screen overlay used by the payroll modals (same look as AdminFormModal).
export function ModalShell({ width = 420, children }) {
  return (
    <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: `min(${width}px, 94vw)`, maxHeight: '90vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
