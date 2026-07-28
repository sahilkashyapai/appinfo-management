import { initials } from '../utils/avatar';

export default function Avatar({ name, size = 32, fontSize, src, onClick, style }) {
  if (src) {
    return (
      <img
        className="av"
        src={src}
        alt={name || 'Avatar'}
        onClick={onClick}
        style={{
          width: size,
          height: size,
          objectFit: 'cover',
          cursor: onClick ? 'pointer' : undefined,
          ...style,
        }}
      />
    );
  }

  return (
    <div
      className="av"
      onClick={onClick}
      style={{
        width: size,
        height: size,
        fontSize: fontSize || Math.round(size * 0.32),
        background: 'var(--accent)',
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {initials(name)}
    </div>
  );
}
