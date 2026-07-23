import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MONTH_SHORT, WEEKDAY_SHORT } from '../utils/dateLabels';

const POPOVER_WIDTH = 252;

function parseISODate(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplay(value) {
  const d = parseISODate(value);
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function buildGrid(viewDate) {
  const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
  const gridStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1 - startWeekday);
  const cells = [];
  for (let i = 0; i < totalCells; i++) {
    cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }
  return cells;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 116 }, (_, i) => CURRENT_YEAR + 15 - i);

export default function DatePicker({ value, onChange, min, max, placeholder = 'Select date', disabled, style }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [viewDate, setViewDate] = useState(() => parseISODate(value) || new Date());
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const popRef = useRef(null);

  const selected = parseISODate(value);
  const minDate = parseISODate(min);
  const maxDate = parseISODate(max);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // midnight, so it compares evenly against midnight-normalized min/max

  useEffect(() => {
    if (open) setViewDate(selected || new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    let left = rect.left;
    if (left + POPOVER_WIDTH > window.innerWidth - 8) left = Math.max(window.innerWidth - POPOVER_WIDTH - 8, 8);
    let top = rect.bottom + 6;
    if (top + 320 > window.innerHeight) top = Math.max(rect.top - 326, 8);
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

  function isDisabled(d) {
    if (minDate && d < minDate) return true;
    if (maxDate && d > maxDate) return true;
    return false;
  }

  function pick(d) {
    if (isDisabled(d)) return;
    onChange(toISODate(d));
    setOpen(false);
  }

  const cells = buildGrid(viewDate);

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
        <div ref={popRef} className="dp-pop" style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()}>
          <div className="dp-head">
            <button type="button" className="dp-nav" onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
              <i className="fa-solid fa-chevron-left" />
            </button>
            <select value={viewDate.getMonth()} onChange={(e) => setViewDate((d) => new Date(d.getFullYear(), Number(e.target.value), 1))}>
              {MONTH_SHORT.map((m, i) => (
                <option key={m} value={i}>{m}</option>
              ))}
            </select>
            <select value={viewDate.getFullYear()} onChange={(e) => setViewDate((d) => new Date(Number(e.target.value), d.getMonth(), 1))}>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button type="button" className="dp-nav" onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
              <i className="fa-solid fa-chevron-right" />
            </button>
          </div>
          <div className="dp-week">
            {WEEKDAY_SHORT.map((w) => <span key={w}>{w}</span>)}
          </div>
          <div className="dp-grid">
            {cells.map((d) => {
              const outside = d.getMonth() !== viewDate.getMonth();
              const isSelected = selected && sameDay(d, selected);
              const isToday = sameDay(d, today);
              return (
                <button
                  type="button"
                  key={d.toISOString()}
                  className={`dp-day${outside ? ' outside' : ''}${isSelected ? ' on' : ''}${isToday && !isSelected ? ' today' : ''}`}
                  disabled={isDisabled(d)}
                  onClick={() => pick(d)}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="dp-foot">
            <button type="button" disabled={isDisabled(today)} onClick={() => pick(today)}>Today</button>
            <button type="button" onClick={() => { onChange(''); setOpen(false); }}>Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}
