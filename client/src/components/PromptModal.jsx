import { useState } from 'react';

export default function PromptModal({
  title = 'Enter a value',
  label,
  placeholder = '',
  defaultValue = '',
  required = false,
  multiline = false,
  submitLabel = 'Submit',
  pending = false,
  onSubmit,
  onClose,
}) {
  const [value, setValue] = useState(defaultValue);
  const canSubmit = !required || value.trim();

  function submit() {
    if (!canSubmit) return;
    onSubmit(value.trim());
  }

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 960, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 'min(400px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-pen" /> {title}</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="fg">
          {label && <label className="fl">{label}</label>}
          {multiline ? (
            <textarea
              className="fc"
              style={{ resize: 'none', height: 70 }}
              placeholder={placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          ) : (
            <input
              className="fc"
              placeholder={placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              autoFocus
            />
          )}
        </div>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button className="btn bp bsm" disabled={!canSubmit || pending} onClick={submit}>
            <i className="fa-solid fa-check" /> {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
