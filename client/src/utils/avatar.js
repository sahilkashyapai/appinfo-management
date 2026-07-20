export const AVC = ['#2E86AB', '#E74C3C', '#27AE60', '#E67E22', '#8E44AD', '#16A085', '#D35400', '#2980B9', '#1ABC9C', '#C0392B'];

export function avatarColor(i) {
  return AVC[Math.abs(i || 0) % AVC.length];
}

export function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function yearsSince(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  let years = now.getFullYear() - date.getFullYear();
  const anniversaryPassed = now.getMonth() > date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() >= date.getDate());
  if (!anniversaryPassed) years -= 1;
  return Math.max(years, 0);
}

export function daysUntilNext(monthDayDate) {
  const d = new Date(monthDayDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (next < now) next = new Date(now.getFullYear() + 1, d.getMonth(), d.getDate());
  return Math.round((next - now) / (24 * 60 * 60 * 1000));
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const time = new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return `${formatDate(dateStr)} ${time}`;
}
