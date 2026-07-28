// "#2E86AB" -> "46, 134, 171", so CSS can do rgba(var(--accent-rgb), .3) for a
// translucent tint of a theme color that's only ever stored/edited as hex.
export function hexToRgbTriplet(hex) {
  const clean = (hex || '').replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(clean)) return '46, 134, 171';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}
