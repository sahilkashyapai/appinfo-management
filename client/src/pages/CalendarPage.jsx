import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import Avatar from '../components/Avatar';
import { useDrawers } from '../context/DrawerContext';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const COLOR = { bd: 'var(--accent)', an: 'var(--gold)', ev: 'var(--green)', ho: 'var(--red)' };
const ICON = { bd: 'fa-solid fa-cake-candles', an: 'fa-solid fa-medal', ev: 'fa-solid fa-calendar-days', ho: 'fa-solid fa-umbrella-beach' };

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState(null);
  const { openEmployee, openRsvp } = useDrawers();

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-all-active'],
    queryFn: () => api.get('/employees', { params: { status: 'active', limit: 100 } }).then((r) => r.data.items),
  });
  const { data: events = [] } = useQuery({ queryKey: ['events', 'all'], queryFn: () => api.get('/events', { params: { type: 'all' } }).then((r) => r.data.items) });
  const { data: holidays = [] } = useQuery({ queryKey: ['holidays'], queryFn: () => api.get('/holidays').then((r) => r.data.items) });

  // Full detail per day (for the day-detail popover), keyed by day-of-month.
  const dayItemsMap = useMemo(() => {
    const map = {};
    const add = (day, item) => {
      if (!map[day]) map[day] = [];
      map[day].push(item);
    };
    employees.forEach((e) => {
      const dob = new Date(e.dob);
      if (dob.getMonth() === month) {
        add(dob.getDate(), { type: 'bd', title: `${e.name}'s Birthday`, subtitle: e.dept, employeeId: e._id, avatarName: e.name, avatarIndex: e.avatarIndex });
      }
    });
    employees.forEach((e) => {
      const joined = new Date(e.joined);
      const years = year - joined.getFullYear();
      if (joined.getMonth() === month && years >= 1) {
        add(joined.getDate(), { type: 'an', title: `${e.name}'s Work Anniversary`, subtitle: `${years} year(s) at ${e.dept}`, employeeId: e._id, avatarName: e.name, avatarIndex: e.avatarIndex });
      }
    });
    events.forEach((e) => {
      const d = new Date(e.date);
      if (d.getMonth() === month && d.getFullYear() === year) {
        add(d.getDate(), { type: 'ev', title: e.title, subtitle: e.venue, eventId: e._id, emoji: e.emoji });
      }
    });
    holidays.forEach((h) => {
      const d = new Date(h.date);
      if (d.getMonth() === month) {
        add(d.getDate(), { type: 'ho', title: h.name, subtitle: h.type + (h.description ? ` · ${h.description}` : '') });
      }
    });
    return map;
  }, [employees, events, holidays, month, year]);

  // Compact summary per day (dots + first label) for the month grid cells.
  const dayMap = useMemo(() => {
    const map = {};
    Object.entries(dayItemsMap).forEach(([day, items]) => {
      map[day] = { markers: items.map((it) => it.type), label: items[0].title.length > 20 ? items[0].title.slice(0, 18) + '…' : items[0].title };
    });
    return map;
  }, [dayItemsMap]);

  const first = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  function nav(delta) {
    let m = month + delta;
    let y = year;
    if (m > 11) { m = 0; y += 1; }
    if (m < 0) { m = 11; y -= 1; }
    setMonth(m);
    setYear(y);
  }

  function goToday() {
    setMonth(now.getMonth());
    setYear(now.getFullYear());
  }

  const cells = [];
  for (let i = 0; i < first; i++) cells.push({ n: daysInPrevMonth - first + i + 1, other: true });
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === now.getDate() && month === now.getMonth() && year === now.getFullYear();
    cells.push({ n: d, other: false, isToday, ...dayMap[d] });
  }

  const selectedItems = selectedDay ? dayItemsMap[selectedDay] || [] : [];
  const selectedWeekday = selectedDay ? FULL_WEEKDAYS[new Date(year, month, selectedDay).getDay()] : '';

  function onItemClick(item) {
    if (item.employeeId) openEmployee(item.employeeId);
    else if (item.eventId) openRsvp(item.eventId);
  }

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Calendar</div>
          <div className="pgs">{MONTHS[month]} {year}</div>
        </div>
        <div className="ph-r">
          <button className="btn bs bsm" onClick={() => nav(-1)}><i className="fa-solid fa-chevron-left" /></button>
          <button className="btn bs bsm" onClick={goToday}>Today</button>
          <button className="btn bs bsm" onClick={() => nav(1)}><i className="fa-solid fa-chevron-right" /></button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 800 }}>Legend:</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}><span className="cdot bd" style={{ display: 'inline-block', width: 9, height: 9 }} />Birthday</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}><span className="cdot an" style={{ display: 'inline-block', width: 9, height: 9 }} />Anniversary</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}><span className="cdot ev" style={{ display: 'inline-block', width: 9, height: 9 }} />Event</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}><span className="cdot ho" style={{ display: 'inline-block', width: 9, height: 9 }} />Holiday</span>
      </div>
      <div className="cal-hd">
        {WEEKDAYS.map((w) => <div key={w} className="cal-hdc">{w}</div>)}
      </div>
      <div className="cal-g">
        {cells.map((c, i) => (
          <div
            key={i}
            className={`cday${c.isToday ? ' today' : ''}${c.other ? ' other' : ''}`}
            onClick={() => !c.other && setSelectedDay(c.n)}
          >
            <div className="cday-n">{c.n}</div>
            {c.markers && (
              <div className="cdots">
                {c.markers.map((m, j) => <span key={j} className={`cdot ${m}`} />)}
              </div>
            )}
            {c.label && (
              <span className="cel" style={{ background: `${COLOR[c.markers[0]]}14`, color: COLOR[c.markers[0]] }}>{c.label}</span>
            )}
          </div>
        ))}
      </div>

      {selectedDay && (
        <div
          style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => e.target === e.currentTarget && setSelectedDay(null)}
        >
          <div className="card" style={{ width: 'min(440px, 92vw)', maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="chd">
              <div className="cht"><i className="fa-solid fa-calendar-day" /> {selectedWeekday}, {MONTHS[month]} {selectedDay}, {year}</div>
              <button className="btn bs bxs bico" onClick={() => setSelectedDay(null)}><i className="fa-solid fa-xmark" /></button>
            </div>
            {selectedItems.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>Nothing scheduled on this day.</div>
            )}
            {selectedItems.map((item, i) => (
              <div
                className="pr"
                key={i}
                style={{ cursor: item.employeeId || item.eventId ? 'pointer' : 'default' }}
                onClick={() => onItemClick(item)}
              >
                {item.employeeId ? (
                  <Avatar name={item.avatarName} index={item.avatarIndex} size={32} />
                ) : (
                  <div
                    style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `${COLOR[item.type]}18`, color: COLOR[item.type], fontSize: item.emoji ? 16 : 13,
                    }}
                  >
                    {item.emoji || <i className={ICON[item.type]} />}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t1)' }}>{item.title}</div>
                  {item.subtitle && <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>{item.subtitle}</div>}
                </div>
                {item.eventId && <i className="fa-solid fa-chevron-right" style={{ color: 'var(--t3)', fontSize: 11 }} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
