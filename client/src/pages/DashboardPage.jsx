import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useNavigate, useOutletContext } from 'react-router-dom';
import api from '../api/client';
import KpiCard from '../components/KpiCard';
import Avatar from '../components/Avatar';
import WorkTimerCard from '../components/WorkTimerCard';
import AttendanceListModal from '../components/AttendanceListModal';
import { useDrawers } from '../context/DrawerContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { STATUS_LABEL } from '../utils/attendance';

const LEAVE_TYPE_COLOR = { casual: 'var(--accent)', sick: 'var(--orange)', earned: 'var(--green)' };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? ['Good morning', '☀️'] : h < 17 ? ['Good afternoon', '🌤️'] : ['Good evening', '🌙'];
}

export default function DashboardPage() {
  const { openEmployee, openRsvp } = useDrawers();
  const { openEditEmployee } = useOutletContext();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [attendanceListStatus, setAttendanceListStatus] = useState(null);

  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get('/dashboard/summary').then((r) => r.data) });
  const { data: myAttendance } = useQuery({
    queryKey: ['attendance-my-summary'],
    queryFn: () => api.get('/attendance/my-summary').then((r) => r.data),
    enabled: !!user?.employeeRef,
  });
  const { data: myLeaveBalance } = useQuery({
    queryKey: ['leave-balance'],
    queryFn: () => api.get('/leave/balance').then((r) => r.data.balance),
    enabled: !!user?.employeeRef,
  });

  const sendWish = useMutation({
    mutationFn: ({ name, tag, text }) => api.post('/wall', { text, tag }),
    onSuccess: (_res, vars) => {
      toast(vars.toastMsg, vars.tag);
      qc.invalidateQueries({ queryKey: ['wall'] });
    },
  });

  if (!data) return null;
  const [greetLabel, emoji] = greeting();
  const maxDept = Math.max(...data.deptHeadcount.map((d) => d.count), 1);
  const maxSpark = Math.max(...data.sparkline.map((s) => s.value), 1);
  const isAdmin = ['superadmin', 'hr', 'manager'].includes(user?.role);

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">{greetLabel}, {(user?.name || 'Admin').split(' ')[0]}! {emoji}</div>
          <div className="pgs">
            {data.kpis.todaysBirthdaysCount} birthday(s) · {data.kpis.todaysAnniversariesCount} anniversary(ies) · {data.kpis.upcomingEventsCount} events upcoming
          </div>
        </div>
        {isAdmin && (
          <div className="ph-r">
            <button className="btn bp bsm" onClick={() => openEditEmployee(null)}><i className="fa-solid fa-user-plus" /> Add Employee</button>
          </div>
        )}
      </div>

      <WorkTimerCard />

      {myAttendance?.hasRecord && (
        <div className="g2 mb14">
          <div className="card">
            <div className="chd">
              <div className="cht"><i className="fa-solid fa-calendar-check" /> My Attendance This Month</div>
              <button className="btn bs bxs" onClick={() => navigate('/attendance')}>View all</button>
            </div>
            <div className="g4" style={{ gap: 8 }}>
              <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: 9, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--t1)' }}>{myAttendance.office}</div>
                <div style={{ fontSize: 9.5, color: 'var(--t3)' }}>Office</div>
              </div>
              <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: 9, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--t1)' }}>{myAttendance.wfh}</div>
                <div style={{ fontSize: 9.5, color: 'var(--t3)' }}>WFH</div>
              </div>
              <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: 9, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--t1)' }}>{myAttendance.leave}</div>
                <div style={{ fontSize: 9.5, color: 'var(--t3)' }}>Leave</div>
              </div>
              <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: 9, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--t1)' }}>{myAttendance.absent}</div>
                <div style={{ fontSize: 9.5, color: 'var(--t3)' }}>Absent</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
              <span style={{ fontSize: 10.5, color: 'var(--t3)' }}>Today: <strong style={{ color: 'var(--t1)' }}>{myAttendance.today ? STATUS_LABEL[myAttendance.today] : 'Not marked'}</strong></span>
              {myAttendance.notMarked > 0 && <span style={{ fontSize: 10.5, color: 'var(--t3)' }}>{myAttendance.notMarked} day(s) not marked</span>}
            </div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 6 }}>
              See something wrong? <span style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 700 }} onClick={() => navigate('/attendance')}>Request a correction</span>.
            </div>
          </div>
          <div className="card">
            <div className="chd">
              <div className="cht"><i className="fa-solid fa-plane-departure" /> My Leave Balance</div>
              <button className="btn bp bxs" onClick={() => navigate('/leave')}>Request Leave</button>
            </div>
            {myLeaveBalance &&
              Object.entries(myLeaveBalance).map(([type, b]) => (
                <div key={type} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t2)', marginBottom: 3 }}>
                    <span style={{ textTransform: 'capitalize' }}>{type}</span>
                    <span>{b.used}/{b.allocated} days</span>
                  </div>
                  <div className="sbar"><div className="sfill" style={{ width: `${b.allocated ? Math.min((b.used / b.allocated) * 100, 100) : 0}%`, background: LEAVE_TYPE_COLOR[type] }} /></div>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="g4 mb14">
        <KpiCard value={data.kpis.totalEmployees} label="Total Employees" delta={`↑ ${data.kpis.newHiresThisMonth} this month`} deltaClass="up" bg="#EBF5FB" icon="fa-solid fa-users" iconColor="#2E86AB" />
        <KpiCard value={data.kpis.todaysBirthdaysCount} label="Today's Birthdays" delta="Celebrate them!" bg="#FDEBD0" icon="fa-solid fa-cake-candles" iconColor="#E67E22" />
        <KpiCard value={data.kpis.todaysAnniversariesCount} label="Today's Anniversaries" delta="Milestones today" bg="#D5F5E3" icon="fa-solid fa-medal" iconColor="#27AE60" />
        <KpiCard value={data.kpis.upcomingEventsCount} label="Upcoming Events" delta="View the Events page" deltaClass="up" bg="#E8DAEF" icon="fa-solid fa-calendar-days" iconColor="#8E44AD" />
      </div>

      <div className="g6 mb14">
        {[
          ...(isAdmin ? [{ l: 'Add Employee', ic: 'fa-solid fa-user-plus', c: '#2E86AB', fn: () => openEditEmployee(null) }] : []),
          { l: 'Events', ic: 'fa-solid fa-calendar-plus', c: '#8E44AD', fn: () => navigate('/events') },
          ...(isAdmin ? [{ l: 'Announcement', ic: 'fa-solid fa-bullhorn', c: '#E67E22', fn: () => navigate('/announcements') }] : []),
          { l: 'Celebration Wall', ic: 'fa-solid fa-heart', c: '#0D1B2A', fn: () => navigate('/wall') },
          { l: 'Send Wishes', ic: 'fa-solid fa-paper-plane', c: '#27AE60', fn: () => navigate('/birthdays') },
          isAdmin
            ? { l: 'View Reports', ic: 'fa-solid fa-chart-column', c: '#E74C3C', fn: () => navigate('/reports') }
            : { l: 'My Profile', ic: 'fa-solid fa-user', c: '#E74C3C', fn: () => navigate('/profile') },
        ].map((q) => (
          <div
            key={q.l}
            style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--rl)', padding: '10px 7px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer', textAlign: 'center', boxShadow: 'var(--sh)' }}
            onClick={q.fn}
          >
            <div style={{ width: 34, height: 34, borderRadius: 9, background: q.c, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className={q.ic} style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--t1)' }}>{q.l}</div>
          </div>
        ))}
      </div>

      <div className={isAdmin && data.ops ? 'g2 mb13' : 'mb13'}>
        {data.attendanceToday && (
          <div className="card">
            <div className="chd">
              <div className="cht"><i className="fa-solid fa-calendar-check" /> Team Attendance Today</div>
              <button className="btn bs bxs" onClick={() => navigate('/attendance/today')}>View all</button>
            </div>
            <div className="g4" style={{ gap: 8 }}>
              <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: 9, textAlign: 'center', cursor: 'pointer' }} onClick={() => setAttendanceListStatus('office')}>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--t1)' }}>{data.attendanceToday.office}</div>
                <div style={{ fontSize: 9.5, color: 'var(--t3)' }}>Office</div>
              </div>
              <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: 9, textAlign: 'center', cursor: 'pointer' }} onClick={() => setAttendanceListStatus('wfh')}>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--t1)' }}>{data.attendanceToday.wfh}</div>
                <div style={{ fontSize: 9.5, color: 'var(--t3)' }}>WFH</div>
              </div>
              <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: 9, textAlign: 'center', cursor: 'pointer' }} onClick={() => setAttendanceListStatus('leave')}>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--t1)' }}>{data.attendanceToday.leave}</div>
                <div style={{ fontSize: 9.5, color: 'var(--t3)' }}>Leave</div>
              </div>
              <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: 9, textAlign: 'center', cursor: 'pointer' }} onClick={() => setAttendanceListStatus('absent')}>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--t1)' }}>{data.attendanceToday.absent}</div>
                <div style={{ fontSize: 9.5, color: 'var(--t3)' }}>Absent</div>
              </div>
            </div>
            {data.attendanceToday.notMarked > 0 && (
              <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 8, cursor: 'pointer' }} onClick={() => setAttendanceListStatus('not_marked')}>
                {data.attendanceToday.notMarked} employee(s) not marked yet today.
              </div>
            )}
          </div>
        )}
        {isAdmin && data.ops && (
          <div className="card">
            <div className="chd"><div className="cht"><i className="fa-solid fa-clipboard-check" /> Pending Actions</div></div>
            <div className="pr" style={{ cursor: 'pointer' }} onClick={() => navigate('/leave?tab=approvals')}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FDEBD0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="fa-solid fa-plane-departure" style={{ color: '#E67E22', fontSize: 14 }} />
              </div>
              <div style={{ flex: 1, fontSize: 12, fontWeight: 700 }}>Leave Approvals</div>
              <span className="badge b-or">{data.ops.pendingLeaveApprovals} pending</span>
            </div>
            <div className="pr" style={{ cursor: 'pointer' }} onClick={() => navigate('/registrations')}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EBF5FB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="fa-solid fa-user-check" style={{ color: '#2E86AB', fontSize: 14 }} />
              </div>
              <div style={{ flex: 1, fontSize: 12, fontWeight: 700 }}>Registrations</div>
              <span className="badge b-bl">{data.ops.pendingRegistrations} pending</span>
            </div>
            <div className="pr" style={{ cursor: 'pointer' }} onClick={() => navigate('/assets')}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#E8DAEF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className="fa-solid fa-boxes-stacked" style={{ color: '#8E44AD', fontSize: 14 }} />
              </div>
              <div style={{ flex: 1, fontSize: 12, fontWeight: 700 }}>Assets Assigned / Total</div>
              <span className="badge b-pu">{data.ops.assets.assigned}/{data.ops.assets.total}</span>
            </div>
            {data.ops.assets.needsAttention > 0 && (
              <div className="pr" style={{ cursor: 'pointer' }} onClick={() => navigate('/assets')}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="fa-solid fa-triangle-exclamation" style={{ color: '#E74C3C', fontSize: 14 }} />
                </div>
                <div style={{ flex: 1, fontSize: 12, fontWeight: 700 }}>Assets Damaged / Lost</div>
                <span className="badge b-re">{data.ops.assets.needsAttention}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {attendanceListStatus && <AttendanceListModal status={attendanceListStatus} onClose={() => setAttendanceListStatus(null)} />}

      <div className="g2 mb13">
        <div className="card">
          <div className="chd">
            <div className="cht" style={{ color: 'var(--orange)' }}><i className="fa-solid fa-cake-candles" /> Today's Birthdays</div>
            <span className="badge b-or">{data.todaysBirthdays.length} today</span>
          </div>
          {data.todaysBirthdays.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)' }}>No birthdays today.</div>}
          {data.todaysBirthdays.map((e) => (
            <div className="pr" key={e._id}>
              <Avatar name={e.name} index={e.avatarIndex} size={32} onClick={() => openEmployee(e._id)} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{e.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>{e.dept}</div>
              </div>
              <button
                className="btn bp bxs"
                onClick={() =>
                  sendWish.mutate({ tag: 'birthday', toastMsg: `Wish sent to ${e.name}! 🎂`, text: `🎂 Happy Birthday, ${e.name}! Wishing you a fantastic year ahead! 🎉` })
                }
              >
                <i className="fa-solid fa-paper-plane" /> Wish
              </button>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="chd">
            <div className="cht" style={{ color: 'var(--gold)' }}><i className="fa-solid fa-medal" /> Today's Anniversaries</div>
            <span className="badge b-go">{data.todaysAnniversaries.length} today</span>
          </div>
          {data.todaysAnniversaries.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)' }}>No anniversaries today.</div>}
          {data.todaysAnniversaries.map((e) => (
            <div className="pr" key={e._id}>
              <Avatar name={e.name} index={e.avatarIndex} size={32} onClick={() => openEmployee(e._id)} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{e.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>{e.dept} · <strong style={{ color: 'var(--gold)' }}>{e.years}yr 🏆</strong></div>
              </div>
              <button
                className="btn bgn bxs"
                onClick={() =>
                  sendWish.mutate({ tag: 'anniversary', toastMsg: `Congrats sent to ${e.name}! 🏆`, text: `🎉 Congratulations ${e.name} on ${e.years} year(s) at Applied Information India! 🌟` })
                }
              >
                <i className="fa-solid fa-medal" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="g2 mb13">
        <div className="card">
          <div className="chd">
            <div className="cht" style={{ color: 'var(--purple)' }}><i className="fa-solid fa-calendar-days" /> Upcoming Events</div>
            <button className="btn bs bxs" onClick={() => navigate('/events')}>View all</button>
          </div>
          {data.upcomingEvents.map((e) => (
            <div className="pr" key={e._id} style={{ cursor: 'pointer' }} onClick={() => openRsvp(e._id)}>
              <div style={{ fontSize: 22, width: 32, textAlign: 'center', flexShrink: 0 }}>{e.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{e.title}</div>
                <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>{e.venue}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="chd">
            <div className="cht"><i className="fa-solid fa-trophy" /> Celebration Leaderboard</div>
            <span className="badge b-pu">This month</span>
          </div>
          {data.leaderboard.length === 0 && <div style={{ fontSize: 12, color: 'var(--t3)' }}>No wall activity yet this month.</div>}
          {data.leaderboard.map((l, i) => (
            <div key={l.user._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i === data.leaderboard.length - 1 ? 'none' : '1px solid var(--bd)' }}>
              <div style={{ width: 18, fontSize: 11.5, fontWeight: 900, textAlign: 'center' }}>{['🥇', '🥈', '🥉', '4', '5'][i]}</div>
              <Avatar name={l.user.name} index={l.user.avatarIndex} size={27} fontSize={8} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{l.user.name}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--purple)' }}>{l.score}pts</div>
            </div>
          ))}
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="chd"><div className="cht"><i className="fa-solid fa-chart-column" /> Department Headcount</div></div>
          {data.deptHeadcount.map((d) => (
            <div className="cbr" key={d.dept}>
              <div className="cbl">{d.dept.split(' ')[0]}</div>
              <div className="cbb"><div className="cbf" style={{ width: `${Math.round((d.count / maxDept) * 100)}%`, background: d.color }}>{d.count >= 8 ? d.count : ''}</div></div>
              <div className="cbv">{d.count}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="chd">
            <div className="cht"><i className="fa-solid fa-chart-line" /> Monthly Engagement</div>
          </div>
          <div className="mb12">
            <div className="sparkline">
              {data.sparkline.map((s, i) => (
                <div key={s.label} className="spk" style={{ height: `${Math.round((s.value / maxSpark) * 100)}%`, background: i === data.sparkline.length - 1 ? '#2E86AB' : 'rgba(46,134,171,.3)' }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
              <span style={{ fontSize: 9.5, color: 'var(--t3)' }}>{data.sparkline[0]?.label}</span>
              <span style={{ fontSize: 9.5, color: 'var(--t3)' }}>{data.sparkline[data.sparkline.length - 1]?.label}</span>
            </div>
          </div>
          <div className="g4" style={{ gap: 8 }}>
            <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: 9, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--t1)' }}>{data.stats.notificationsSentTotal}</div>
              <div style={{ fontSize: 9.5, color: 'var(--t3)' }}>Notifs Sent</div>
            </div>
            <div style={{ background: 'var(--bg3)', borderRadius: 'var(--r)', padding: 9, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--t1)' }}>{data.stats.wallPostsTotal}</div>
              <div style={{ fontSize: 9.5, color: 'var(--t3)' }}>Wall Posts</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
