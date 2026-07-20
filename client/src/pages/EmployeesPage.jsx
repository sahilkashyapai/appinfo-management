import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import Avatar from '../components/Avatar';
import { useDrawers } from '../context/DrawerContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { yearsSince, formatDate } from '../utils/avatar';
import { ADMIN_ROLES } from '../utils/roles';
import { STATUS_LABEL, STATUS_BADGE } from '../utils/attendance';

const ROLE_LABEL_BADGE = {
  CEO: 'b-pu',
  CTO: 'b-pu',
  CFO: 'b-pu',
  HR: 'b-go',
  'Team Lead': 'b-bl',
  Manager: 'b-bl',
  'Senior Employee': 'b-gr',
  Employee: 'b-gy',
  Intern: 'b-gy',
};

export default function EmployeesPage() {
  const [params] = useSearchParams();
  const { openEmployee } = useDrawers();
  const { openEditEmployee } = useOutletContext();
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  const canDelete = user?.role === 'superadmin';
  const toast = useToast();
  const qc = useQueryClient();

  const [dept, setDept] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const openId = params.get('open');
    if (openId) openEmployee(openId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const { data: summary } = useQuery({ queryKey: ['employees-summary'], queryFn: () => api.get('/employees/summary').then((r) => r.data) });
  const { data: depts = [] } = useQuery({ queryKey: ['departments'], queryFn: () => api.get('/departments').then((r) => r.data.items) });
  const { data } = useQuery({
    queryKey: ['employees', dept, q, page],
    queryFn: () => api.get('/employees', { params: { dept, q, page, limit: 10 } }).then((r) => r.data),
  });
  const { data: todayStatuses = {} } = useQuery({
    queryKey: ['attendance-today'],
    queryFn: () => api.get('/attendance/today').then((r) => r.data.statuses),
  });

  const deactivate = useMutation({
    mutationFn: (emp) => api.patch(`/employees/${emp._id}/status`, { status: emp.status === 'active' ? 'inactive' : 'active' }),
    onSuccess: (_res, emp) => {
      toast(`${emp.name} ${emp.status === 'active' ? 'deactivated' : 'reactivated'}`, 'warning');
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['employees-summary'] });
    },
  });

  const deleteEmployee = useMutation({
    mutationFn: (emp) => api.delete(`/employees/${emp._id}`),
    onSuccess: (_res, emp) => {
      toast(`${emp.name} permanently deleted`, 'warning');
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['employees-summary'] });
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not delete employee.', 'error'),
  });

  function confirmDelete(emp) {
    if (window.confirm(`Permanently delete ${emp.name}? This removes their employee record and login account from the database and cannot be undone.`)) {
      deleteEmployee.mutate(emp);
    }
  }

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Employees</div>
          <div className="pgs">{summary ? `${summary.active} active · ${summary.inactive} inactive · ${summary.leave} on leave` : '—'}</div>
        </div>
        {isAdmin && (
          <div className="ph-r">
            <button className="btn bp bsm" onClick={() => openEditEmployee(null)}><i className="fa-solid fa-user-plus" /> Add Employee</button>
          </div>
        )}
      </div>

      <div className="chips">
        <div className={`chip${dept === 'all' ? ' on' : ''}`} onClick={() => { setDept('all'); setPage(1); }}>All</div>
        {depts.map((d) => (
          <div key={d._id} className={`chip${dept === d.name ? ' on' : ''}`} onClick={() => { setDept(d.name); setPage(1); }}>
            {d.name} ({d.count})
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 7, marginBottom: 12, alignItems: 'center' }}>
          <div className="hs-inner" style={{ flex: 1 }}>
            <i className="fa-solid fa-magnifying-glass" />
            <input type="text" placeholder="Search name, email, department…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
        </div>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Employee</th><th>Position</th><th>Account Role</th><th>Department</th><th>Designation</th><th>Joined</th><th>Birthday</th><th>Yrs</th><th>Today</th><th>Status</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((e) => (
                <tr key={e._id} style={{ cursor: 'pointer' }} onClick={() => openEmployee(e._id)}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar name={e.name} index={e.avatarIndex} src={e.userRef?.avatarUrl} size={28} fontSize={9} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{e.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--t3)' }}>{e.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className={`badge ${ROLE_LABEL_BADGE[e.roleLabel] || 'b-gy'}`}>{e.roleLabel || 'Employee'}</span></td>
                  <td style={{ textTransform: 'capitalize' }}>{e.userRef?.role || '—'}</td>
                  <td><span className="badge b-bl">{e.dept}</span></td>
                  <td>{e.desig}</td>
                  <td>{formatDate(e.joined)}</td>
                  <td>{formatDate(e.dob)}</td>
                  <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{yearsSince(e.joined)}yr</td>
                  <td>
                    {todayStatuses[e._id] ? (
                      <span className={`badge ${STATUS_BADGE[todayStatuses[e._id]]}`}>{STATUS_LABEL[todayStatuses[e._id]]}</span>
                    ) : (
                      <span className="badge b-gy">Not marked</span>
                    )}
                  </td>
                  <td><span className={`badge ${e.status === 'active' ? 'b-gr' : 'b-re'}`}>{e.status}</span></td>
                  {isAdmin && (
                    <td onClick={(ev) => ev.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 3 }}>
                        <button className="btn bs bxs bico" onClick={() => openEmployee(e._id)}><i className="fa-solid fa-eye" /></button>
                        <button className="btn bs bxs bico" onClick={() => openEditEmployee(e)}><i className="fa-solid fa-pen-to-square" /></button>
                        <button className="btn brd bxs bico" onClick={() => deactivate.mutate(e)}><i className="fa-solid fa-user-slash" /></button>
                        {canDelete && (
                          <button className="btn brd bxs bico" onClick={() => confirmDelete(e)}><i className="fa-solid fa-trash" /></button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--bd)' }}>
            <div style={{ fontSize: 11, color: 'var(--t3)' }}>
              Showing {(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, data.total)} of {data.total} employees
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn bs bxs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
              <button className="btn bs bxs" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
