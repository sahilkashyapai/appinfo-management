import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MONTH_SHORT } from '../utils/dateLabels';

const POPOVER_WIDTH = 220;
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 116 }, (_, i) => CURRENT_YEAR + 15 - i);

function parseYM(s) {
  if (!s) return null;
  const [y, m] = s.split('-').map(Number);
  if (!y || !m) return null;
  return { y, m: m - 1 };
}

function toYM(y, m) {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

function formatDisplay(value) {
  const p = parseYM(value);
  if (!p) return '';
  return `${MONTH_SHORT[p.m]} ${p.y}`;
}

function isMonthDisabled(y, m, min, max) {
  const val = y * 12 + m;
  const minP = parseYM(min);
  const maxP = parseYM(max);
  if (minP && val < minP.y * 12 + minP.m) return true;
  if (maxP && val > maxP.y * 12 + maxP.m) return true;
  return false;
}

export default function MonthPicker({ value, onChange, min, max, placeholder = 'Select month', disabled, style }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const selected = parseYM(value);
  const [viewYear, setViewYear] = useState(selected?.y || CURRENT_YEAR);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const popRef = useRef(null);

  useEffect(() => {
    if (open) setViewYear(selected?.y || CURRENT_YEAR);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    let left = rect.left;
    if (left + POPOVER_WIDTH > window.innerWidth - 8) left = Math.max(window.innerWidth - POPOVER_WIDTH - 8, 8);
    let top = rect.bottom + 6;
    if (top + 220 > window.innerHeight) top = Math.max(rect.top - 226, 8);
    setPos({ top, left });
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

  function pick(m) {
    if (isMonthDisabled(viewYear, m, min, max)) return;
    onChange(toYM(viewYear, m));
    setOpen(false);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', ...style }}>
      <button
        ref={triggerRef}
        type="button"
        className="fc dp-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected ? '' : 'dp-ph'}>{selected ? formatDisplay(value) : placeholder}</span>
        <i className="fa-solid fa-calendar-days" />
      </button>

      {open && pos && (
        <div ref={popRef} className="dp-pop" style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH }} onClick={(e) => e.stopPropagation()}>
          <div className="dp-head">
            <button type="button" className="dp-nav" onClick={() => setViewYear((y) => y - 1)}>
              <i className="fa-solid fa-chevron-left" />
            </button>
            <select value={viewYear} onChange={(e) => setViewYear(Number(e.target.value))}>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button type="button" className="dp-nav" onClick={() => setViewYear((y) => y + 1)}>
              <i className="fa-solid fa-chevron-right" />
            </button>
          </div>
          <div className="mp-grid">
            {MONTH_SHORT.map((label, m) => {
              const isSelected = selected && selected.y === viewYear && selected.m === m;
              return (
                <button
                  type="button"
                  key={label}
                  className={`mp-month${isSelected ? ' on' : ''}`}
                  disabled={isMonthDisabled(viewYear, m, min, max)}
                  onClick={() => pick(m)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
