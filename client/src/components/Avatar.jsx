import { avatarColor, initials } from '../utils/avatar';

export default function Avatar({ name, index = 0, size = 32, fontSize, onClick, style }) {
  return (
    <div
      className="av"
      onClick={onClick}
      style={{
        width: size,
        height: size,
        fontSize: fontSize || Math.round(size * 0.32),
        background: avatarColor(index),
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {initials(name)}
    </div>
  );
}
