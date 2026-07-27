import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Avatar from '../components/Avatar';
import { useDrawers } from '../context/DrawerContext';
import { useToast } from '../context/ToastContext';
import { daysSinceLast, daysUntilNext, formatDate, yearsSince } from '../utils/avatar';

const TABS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'milestones', label: 'Milestones', icon: 'fa-solid fa-trophy' },
];

const EMPTY_MESSAGES = {
  today: 'No anniversaries today.',
  week: 'No anniversaries this week.',
  milestones: 'No milestones to show yet.',
};

const TENURE_BUCKETS = [
  { key: '1-2', label: '1–2 years', min: 1, max: 2, color: '#2980B9' },
  { key: '3-5', label: '3–5 years', min: 3, max: 5, color: '#27AE60' },
  { key: '6-9', label: '6–9 years', min: 6, max: 9, color: '#E67E22' },
  { key: '10+', label: '10+ years', min: 10, max: Infinity, color: '#8E44AD' },
];

const MILESTONE_ICON = (years) =>
  years >= 10 ? 'fa-solid fa-trophy' : years >= 7 ? 'fa-solid fa-rocket' : years >= 5 ? 'fa-solid fa-gem' : years >= 3 ? 'fa-solid fa-star' : 'fa-solid fa-medal';

export default function AnniversariesPage() {
  const [tab, setTab] = useState('today');
  const { openEmployee } = useDrawers();
  const toast = useToast();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['employees-all-active'],
    queryFn: () => api.get('/employees', { params: { status: 'active', limit: 100 } }).then((r) => r.data.items),
  });

  const withYears = useMemo(
    () => (data || []).map((e) => ({ ...e, years: yearsSince(e.joined), days: daysUntilNext(e.joined), since: daysSinceLast(e.joined) })).filter((e) => e.years >= 1),
    [data]
  );

  const allMilestones = useMemo(
    () => withYears.filter((e) => [1, 3, 5, 7, 10].includes(e.years) || e.years >= 10).sort((a, b) => b.years - a.years),
    [withYears]
  );
  const milestoneList = useMemo(() => allMilestones.slice(0, 6), [allMilestones]);

  const filtered = useMemo(() => {
    switch (tab) {
      case 'today':
        return withYears.filter((e) => e.days === 0).sort((a, b) => a.days - b.days);
      case 'week':
        return withYears.filter((e) => e.days <= 7).sort((a, b) => a.days - b.days);
      default:
        return allMilestones;
    }
  }, [withYears, allMilestones, tab]);

  // When the current tab has nothing to show, fall back to the full milestone roster
  // instead of leaving the page looking empty.
  const showingFallback = filtered.length === 0 && tab !== 'milestones' && allMilestones.length > 0;
  const gridItems = showingFallback ? allMilestones : filtered;

  const tenureDist = useMemo(() => {
    const total = withYears.length || 1;
    return TENURE_BUCKETS.map((b) => ({
      ...b,
      pct: Math.round((withYears.filter((e) => e.years >= b.min && e.years <= b.max).length / total) * 100),
    }));
  }, [withYears]);

  function congratulate(e) {
    api.post('/wall', { text: `Congratulations ${e.name} on ${e.years} year(s) at Applied Information India!`, tag: 'anniversary' }).then(() => {
      toast(`Congrats sent to ${e.name}!`, 'anniversary');
      qc.invalidateQueries({ queryKey: ['wall'] });
    });
  }

  function bulkCongrats() {
    const todays = withYears.filter((e) => e.days === 0);
    if (!todays.length) {
      toast('No anniversaries today.', 'info');
      return;
    }
    Promise.all(todays.map((e) => api.post('/wall', { text: `Congratulations ${e.name} on ${e.years} year(s)!`, tag: 'anniversary' }))).then(() => {
      toast('Bulk congrats sent!', 'anniversary');
      qc.invalidateQueries({ queryKey: ['wall'] });
    });
  }

  const todayCount = withYears.filter((e) => e.days === 0).length;

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Work Anniversaries</div>
          <div className="pgs">{todayCount} today · {milestoneList.length} milestones</div>
        </div>
        <div className="ph-r">
          <button className="btn bp bsm" onClick={bulkCongrats}><i className="fa-solid fa-medal" /> Bulk Congrats</button>
        </div>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <div key={t.key} className={`tab${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}>
            {t.icon && <i className={t.icon} style={{ marginRight: 5 }} />}{t.label}
          </div>
        ))}
      </div>
      {filtered.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 13px', borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', color: 'var(--accent)', fontSize: 12, fontWeight: 600, marginBottom: 13 }}>
          <i className="fa-solid fa-circle-info" />
          {EMPTY_MESSAGES[tab]}
          {showingFallback && ' Showing all service milestones instead.'}
        </div>
      )}
      <div className="g2 mb13">
        <div className="card">
          <div className="chd"><div className="cht"><i className="fa-solid fa-medal" /> Service Milestones</div></div>
          {milestoneList.map((e) => (
            <div key={e._id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderBottom: '1px solid var(--bd)' }}>
              <i className={MILESTONE_ICON(e.years)} style={{ fontSize: 16, width: 19, textAlign: 'center', color: 'var(--accent)' }} />
              <Avatar name={e.name} index={e.avatarIndex} size={28} fontSize={9} onClick={() => openEmployee(e._id)} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{e.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>{e.dept} · Joined {formatDate(e.joined)}</div>
              </div>
              <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: '#DBEAFE', color: '#1D4ED8' }}>{e.years} yrs</span>
            </div>
          ))}
          {milestoneList.length === 0 && <div style={{ color: 'var(--t3)', fontSize: 12, padding: '7px 0' }}>No milestones to show yet.</div>}
        </div>
        <div className="card">
          <div className="chd"><div className="cht"><i className="fa-solid fa-chart-pie" /> Tenure Distribution</div></div>
          {tenureDist.map((d) => (
            <div key={d.key} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: 'var(--t2)' }}>{d.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t1)' }}>{d.pct}%</span>
              </div>
              <div className="sbar"><div className="sfill" style={{ width: `${d.pct}%`, background: d.color }} /></div>
            </div>
          ))}
        </div>
      </div>
      {showingFallback && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', marginBottom: 8 }}><i className="fa-solid fa-trophy" style={{ marginRight: 6, color: 'var(--accent)' }} />All Milestones</div>}
      <div className="g3">
        {gridItems.map((e) => {
          // Today/Week entries are always upcoming-or-today, so early congrats stay allowed there.
          // Milestones (year-based, not date-bounded) and the empty-state fallback need the grace-window gate.
          const gated = tab === 'milestones' || showingFallback;
          const canAct = !gated || e.since <= 3;
          return (
            <div key={e._id} className="card" style={{ textAlign: 'center', padding: 14 }}>
              <Avatar name={e.name} index={e.avatarIndex} size={50} fontSize={17} onClick={() => openEmployee(e._id)} style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t1)', marginBottom: 2 }}>
                <i className="fa-solid fa-trophy" style={{ marginRight: 5, color: 'var(--gold)' }} />{e.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 5 }}>{e.dept}</div>
              <div style={{ fontSize: 10.5, color: 'var(--t3)', marginBottom: 5 }}>Joined {formatDate(e.joined)}</div>
              <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: 10, fontWeight: 700, background: '#FEF9C3', color: '#854D0E', display: 'inline-block', marginBottom: 8 }}>
                <i className="fa-solid fa-star" style={{ marginRight: 4 }} />{e.years} Year{e.years > 1 ? 's' : ''}
              </span>
              <div className="sbar mb13"><div className="sfill" style={{ width: `${Math.min(e.years * 10, 100)}%`, background: 'var(--gold)' }} /></div>
              <button
                className="btn bgn"
                style={{ width: '100%', fontSize: 11 }}
                onClick={() => congratulate(e)}
                disabled={!canAct}
                title={canAct ? '' : 'Congratulations can only be sent within 3 days of the anniversary.'}
              >
                <i className="fa-solid fa-medal" /> Congratulate
              </button>
            </div>
          );
        })}
        {gridItems.length === 0 && <div style={{ color: 'var(--t3)', fontSize: 12 }}>Nothing in this range.</div>}
      </div>
    </div>
  );
}
