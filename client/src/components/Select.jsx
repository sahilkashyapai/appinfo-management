import { Children, isValidElement, useEffect, useLayoutEffect, useRef, useState } from 'react';

export default function Select({ value, onChange, disabled, style, children }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const popRef = useRef(null);

  const options = Children.toArray(children)
    .filter((el) => isValidElement(el) && el.type === 'option')
    .map((el) => ({ value: el.props.value, label: el.props.children, disabled: el.props.disabled }));

  const selected = options.find((o) => String(o.value) === String(value)) || options[0];

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const estHeight = Math.min(options.length * 33 + 8, 260);
    let top = rect.bottom + 4;
    if (top + estHeight > window.innerHeight) top = Math.max(rect.top - estHeight - 4, 8);
    setPos({ top, left: rect.left, width: rect.width });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e) {
      if (popRef.current?.contains(e.target) || wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(opt) {
    if (opt.disabled) return;
    onChange({ target: { value: opt.value } });
    setOpen(false);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', ...style }}>
      <button ref={triggerRef} type="button" className="fc dp-trigger sel-trigger" disabled={disabled} onClick={() => setOpen((o) => !o)}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected ? selected.label : ''}</span>
        <i className="fa-solid fa-chevron-down" />
      </button>

      {open && pos && (
        <div ref={popRef} className="sel-pop" style={{ top: pos.top, left: pos.left, width: pos.width }} onClick={(e) => e.stopPropagation()}>
          {options.map((opt, i) => (
            <div
              key={`${opt.value}-${i}`}
              className={`sel-opt${String(opt.value) === String(value) ? ' on' : ''}${opt.disabled ? ' disabled' : ''}`}
              onClick={() => pick(opt)}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
