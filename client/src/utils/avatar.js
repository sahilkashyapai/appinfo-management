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

export function daysSinceLast(monthDayDate) {
  const d = new Date(monthDayDate);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let last = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (last > now) last = new Date(now.getFullYear() - 1, d.getMonth(), d.getDate());
  return Math.round((now - last) / (24 * 60 * 60 * 1000));
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
