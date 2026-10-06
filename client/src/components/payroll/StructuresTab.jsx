import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import Avatar from '../Avatar';
import StructureEditorModal from './StructureEditorModal';
import { formatMoney } from './payrollUtils';

export default function StructuresTab() {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['payroll-structures'],
    queryFn: () => api.get('/payroll/structures').then((r) => r.data.items),
  });

  const q = search.trim().toLowerCase();
  const items = q
    ? data.filter(({ employee: e }) => [e.name, e.empId, e.dept, e.location, e.desig].some((v) => String(v || '').toLowerCase().includes(q)))
    : data;
  const setCount = data.filter((i) => i.hasStructure).length;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: 'min(300px, 100%)' }}>
          <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', fontSize: 11 }} />
          <input className="fc" style={{ paddingLeft: 30 }} placeholder="Search name, ID, department, office…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span style={{ fontSize: 11.5, color: 'var(--t3)' }}>{setCount} of {data.length} employees have a salary structure</span>
      </div>
      <div className="card">
        <div className="tbl">
          <table>
            <thead>
              <tr><th>Employee</th><th>Department</th><th>Office</th><th>Currency</th><th>Monthly Gross</th><th>Fixed Deductions</th><th>Structure</th><th>Last Updated</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {items.map(({ employee: e, currency, hasStructure, monthlyGross, fixedDeductions, updatedAt }) => (
                <tr key={e._id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Avatar name={e.name} index={e.avatarIndex} size={26} fontSize={8} />
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--t1)' }}>{e.name}</div>
                        {e.empId && <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>{e.empId}</div>}
                      </div>
                    </div>
                  </td>
                  <td>{e.dept || <span style={{ color: 'var(--t3)' }}>-</span>}</td>
                  <td>{e.location || <span style={{ color: 'var(--t3)' }}>-</span>}</td>
                  <td>{currency}</td>
                  <td style={{ fontWeight: hasStructure ? 700 : 400, color: hasStructure ? 'var(--t1)' : 'var(--t3)' }}>{hasStructure ? formatMoney(monthlyGross, currency) : '-'}</td>
                  <td>{hasStructure ? formatMoney(fixedDeductions, currency) : <span style={{ color: 'var(--t3)' }}>-</span>}</td>
                  <td><span className={`badge ${hasStructure ? 'b-gr' : 'b-gy'}`}>{hasStructure ? 'Set' : 'Not set'}</span></td>
                  <td style={{ color: 'var(--t3)' }}>{updatedAt ? new Date(updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</td>
                  <td>
                    <button className={`btn ${hasStructure ? 'bs' : 'bp'} bxs`} onClick={() => setEditing(e._id)}>
                      <i className={`fa-solid ${hasStructure ? 'fa-pen' : 'fa-plus'}`} /> {hasStructure ? 'Edit' : 'Set up'}
                    </button>
                  </td>
                </tr>
              ))}
              {!isLoading && items.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--t3)', padding: 14 }}>{q ? 'No employees match your search.' : 'No employees found.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {editing && <StructureEditorModal employeeId={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
