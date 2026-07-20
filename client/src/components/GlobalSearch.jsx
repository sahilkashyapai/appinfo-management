import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function GlobalSearch() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function onChange(value) {
    setQ(value);
    clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      api.get('/search', { params: { q: value } }).then((res) => setResults(res.data));
    }, 250);
  }

  function goTo(path) {
    setQ('');
    setResults(null);
    setOpen(false);
    navigate(path);
  }

  const hasResults = results && (results.employees.length || results.events.length || results.departments.length);

  return (
    <div className="hs-wrap">
      <div className="hs-inner">
        <i className="fa-solid fa-magnifying-glass" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Ctrl+K · Search…"
          value={q}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
      </div>
      {open && q.length >= 2 && (
        <div className="sr-drop show">
          {!results && <div style={{ padding: 12, fontSize: 12, color: 'var(--t3)', textAlign: 'center' }}>Searching…</div>}
          {results && !hasResults && <div style={{ padding: 12, fontSize: 12, color: 'var(--t3)', textAlign: 'center' }}>No results found</div>}
          {results?.employees.map((e) => (
            <div className="sr-item" key={e._id} onClick={() => goTo(`/employees?open=${e._id}`)}>
              <div style={{ fontSize: 20, width: 26, textAlign: 'center' }}>👤</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{e.name}</div>
                <div style={{ fontSize: 10, color: 'var(--t3)' }}>{e.dept}</div>
              </div>
              <span className="sr-tag" style={{ background: '#DBEAFE', color: '#1D4ED8' }}>Employee</span>
            </div>
          ))}
          {results?.events.map((e) => (
            <div className="sr-item" key={e._id} onClick={() => goTo('/events')}>
              <div style={{ fontSize: 20, width: 26, textAlign: 'center' }}>{e.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{e.title}</div>
                <div style={{ fontSize: 10, color: 'var(--t3)' }}>{new Date(e.date).toLocaleDateString()}</div>
              </div>
              <span className="sr-tag" style={{ background: '#D1FAE5', color: '#065F46' }}>Event</span>
            </div>
          ))}
          {results?.departments.map((d) => (
            <div className="sr-item" key={d._id} onClick={() => goTo('/departments')}>
              <div style={{ fontSize: 20, width: 26, textAlign: 'center' }}>{d.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{d.name}</div>
              </div>
              <span className="sr-tag" style={{ background: '#EDE9FE', color: '#5B21B6' }}>Dept</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
