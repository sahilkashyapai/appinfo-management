const AVC = ['#2E86AB', '#E74C3C', '#27AE60', '#E67E22', '#8E44AD', '#16A085', '#D35400', '#2980B9', '#1ABC9C', '#C0392B'];

function avatarColor(i) {
  return AVC[Math.abs(i || 0) % AVC.length];
}

function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

module.exports = { AVC, avatarColor, initials };
