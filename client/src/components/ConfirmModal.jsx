export default function ConfirmModal({ title = 'Are you sure?', message, confirmLabel = 'Confirm', danger = false, pending = false, onConfirm, onClose }) {
  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 960, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 'min(400px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht">
            <i className={danger ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-question'} style={danger ? { color: 'var(--red)' } : undefined} /> {title}
          </div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.6, marginBottom: 14 }}>{message}</div>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button className={`btn ${danger ? 'brd' : 'bp'} bsm`} disabled={pending} onClick={onConfirm}>
            <i className={`fa-solid ${danger ? 'fa-trash' : 'fa-check'}`} /> {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
