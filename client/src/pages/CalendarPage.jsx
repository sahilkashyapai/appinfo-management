import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { useToast } from '../context/ToastContext';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed
  const toast = useToast();

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-all-active'],
    queryFn: () => api.get('/employees', { params: { status: 'active', limit: 100 } }).then((r) => r.data.items),
  });
  const { data: events = [] } = useQuery({ queryKey: ['events', 'all'], queryFn: () => api.get('/events', { params: { type: 'all' } }).then((r) => r.data.items) });
  const { data: holidays = [] } = useQuery({ queryKey: ['holidays'], queryFn: () => api.get('/holidays').then((r) => r.data.items) });

  const dayMap = useMemo(() => {
    const map = {};
    const add = (day, marker, label) => {
      if (!map[day]) map[day] = { markers: [], label: null };
      map[day].markers.push(marker);
      if (!map[day].label) map[day].label = label;
    };
    employees.forEach((e) => {
      const dob = new Date(e.dob);
      if (dob.getMonth() === month) add(dob.getDate(), 'bd', `${e.name.split(' ')[0]} Bday`);
    });
    employees.forEach((e) => {
      const joined = new Date(e.joined);
      if (joined.getMonth() === month && year - joined.getFullYear() >= 1) add(joined.getDate(), 'an', `${e.name.split(' ')[0]} Anniv.`);
    });
    events.forEach((e) => {
      const d = new Date(e.date);
      if (d.getMonth() === month && d.getFullYear() === year) add(d.getDate(), 'ev', e.title);
    });
    holidays.forEach((h) => {
      const d = new Date(h.date);
      if (d.getMonth() === month) add(d.getDate(), 'ho', h.name);
    });
    return map;
  }, [employees, events, holidays, month, year]);

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

  const COLOR = { bd: 'var(--accent)', an: 'var(--gold)', ev: 'var(--green)', ho: 'var(--red)' };

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
            onClick={() => !c.other && toast(`${c.n} ${MONTHS[month]} ${year}${c.label ? ' — ' + c.label : ''}`, 'info')}
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
    </div>
  );
}
