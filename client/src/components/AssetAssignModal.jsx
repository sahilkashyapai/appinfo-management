import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Select from './Select';
import { useToast } from '../context/ToastContext';

export default function AssetAssignModal({ asset, onClose }) {
  const [employeeId, setEmployeeId] = useState('');
  const toast = useToast();
  const qc = useQueryClient();

  const { data: employees = [] } = useQuery({
    queryKey: ['org-chart'],
    queryFn: () => api.get('/employees/org-chart').then((r) => r.data.items),
  });

  const assign = useMutation({
    mutationFn: () => api.patch(`/assets/${asset._id}/assign`, { employeeRef: employeeId }),
    onSuccess: () => {
      toast(`Asset assigned ✓`, 'success');
      qc.invalidateQueries({ queryKey: ['assets'] });
      onClose();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not assign asset.', 'error'),
  });

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 'min(360px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-user-check" /> Assign "{asset.name}"</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="fg">
          <label className="fl">Employee</label>
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Select an employee…</option>
            {employees.map((e) => (
              <option key={e._id} value={e._id}>{e.name}{e.dept ? ` — ${e.dept}` : ''}</option>
            ))}
          </Select>
        </div>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button className="btn bp bsm" disabled={!employeeId || assign.isPending} onClick={() => assign.mutate()}>
            <i className="fa-solid fa-check" /> Assign
          </button>
        </div>
      </div>
    </div>
  );
}
