import { Children, isValidElement, useEffect, useLayoutEffect, useRef, useState } from 'react';

function flattenText(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (isValidElement(node)) return flattenText(node.props.children);
  return '';
}

export default function Select({ value, onChange, disabled, style, children, searchable = false, searchPlaceholder = 'Search…' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const popRef = useRef(null);

  const options = Children.toArray(children)
    .filter((el) => isValidElement(el) && el.type === 'option')
    .map((el) => ({ value: el.props.value, label: el.props.children, disabled: el.props.disabled, text: flattenText(el.props.children).toLowerCase() }));

  const selected = options.find((o) => String(o.value) === String(value)) || options[0];

  const q = query.trim().toLowerCase();
  const visibleOptions = searchable && q ? options.filter((o) => o.text.includes(q)) : options;

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const searchBarHeight = searchable ? 40 : 0;
    const estHeight = Math.min(options.length * 33 + 8 + searchBarHeight, 260 + searchBarHeight);
    const rect = triggerRef.current.getBoundingClientRect();
    let top = rect.bottom + 4;
    if (top + estHeight > window.innerHeight) top = Math.max(rect.top - estHeight - 4, 8);
    setPos({ top, left: rect.left, width: rect.width });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
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
          {searchable && (
            <div className="sel-search">
              <i className="fa-solid fa-magnifying-glass" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && visibleOptions.length === 1) pick(visibleOptions[0]);
                }}
              />
            </div>
          )}
          {visibleOptions.length === 0 ? (
            <div className="sel-opt disabled">No matches</div>
          ) : (
            visibleOptions.map((opt, i) => (
              <div
                key={`${opt.value}-${i}`}
                className={`sel-opt${String(opt.value) === String(value) ? ' on' : ''}${opt.disabled ? ' disabled' : ''}`}
                onClick={() => pick(opt)}
              >
                {opt.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
