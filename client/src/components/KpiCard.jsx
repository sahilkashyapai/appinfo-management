export default function KpiCard({ value, label, delta, deltaClass = 'na', bg, icon, iconColor }) {
  return (
    <div className="kpi">
      <div className="kico" style={{ background: bg }}>
        <i className={icon} style={{ color: iconColor }} />
      </div>
      <div>
        <div className="kv">{value}</div>
        <div className="kl">{label}</div>
        {delta && <div className={`kd ${deltaClass}`}>{delta}</div>}
      </div>
    </div>
  );
}
