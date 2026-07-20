import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import DepartmentFormModal from '../components/DepartmentFormModal';

export default function DepartmentsPage() {
  const [formState, setFormState] = useState(undefined);
  const { data: items = [] } = useQuery({ queryKey: ['departments'], queryFn: () => api.get('/departments').then((r) => r.data.items) });
  const totalEmployees = items.reduce((s, d) => s + d.count, 0);

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Departments</div>
          <div className="pgs">{items.length} departments · {totalEmployees} employees</div>
        </div>
        <div className="ph-r">
          <button className="btn bp bsm" onClick={() => setFormState(null)}><i className="fa-solid fa-plus" /> Add Department</button>
        </div>
      </div>
      <div className="g3">
        {items.map((d) => (
          <div key={d._id} className="card" style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, background: `${d.color}16`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
              {d.emoji}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t1)' }}>{d.name}</div>
              <div style={{ fontSize: 10.5, color: 'var(--t3)', marginBottom: 4 }}>Code: <strong>{d.code}</strong> · Head: {d.headRef?.name || '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 8 }}>{d.description}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: d.color }}>{d.count} employees</span>
                <button className="btn bs bxs" onClick={() => setFormState(d)}><i className="fa-solid fa-pen-to-square" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {formState !== undefined && <DepartmentFormModal department={formState} onClose={() => setFormState(undefined)} />}
    </div>
  );
}
