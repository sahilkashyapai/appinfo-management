const MAP = {
  blue: 'b-bl',
  green: 'b-gr',
  orange: 'b-or',
  red: 'b-re',
  purple: 'b-pu',
  gold: 'b-go',
  gray: 'b-gy',
};

export default function Badge({ color = 'gray', children }) {
  return <span className={`badge ${MAP[color] || MAP.gray}`}>{children}</span>;
}
