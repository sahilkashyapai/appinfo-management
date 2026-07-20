import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import HolidayFormModal from '../components/HolidayFormModal';
import { formatDate } from '../utils/avatar';

const TYPE_BADGE = { National: 'b-re', Festival: 'b-or', Optional: 'b-gy' };

export default function HolidaysPage() {
  const [formState, setFormState] = useState(undefined);
  const toast = useToast();
  const qc = useQueryClient();

  const { data: items = [] } = useQuery({ queryKey: ['holidays'], queryFn: () => api.get('/holidays').then((r) => r.data.items) });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/holidays/${id}`),
    onSuccess: () => {
      toast('Removed', 'warning');
      qc.invalidateQueries({ queryKey: ['holidays'] });
    },
  });

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Holidays</div>
          <div className="pgs">{items.length} holidays configured</div>
        </div>
        <div className="ph-r">
          <button className="btn bp bsm" onClick={() => setFormState(null)}><i className="fa-solid fa-plus" /> Add Holiday</button>
        </div>
      </div>
      <div className="card">
        <div className="tbl">
          <table>
            <thead>
              <tr><th>Holiday Name</th><th>Date</th><th>Day</th><th>Type</th><th>Description</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {items.map((h) => (
                <tr key={h._id}>
                  <td style={{ fontWeight: 700, color: 'var(--t1)' }}>{h.name}</td>
                  <td>{formatDate(h.date)}</td>
                  <td>{new Date(h.date).toLocaleDateString('en-US', { weekday: 'long' })}</td>
                  <td><span className={`badge ${TYPE_BADGE[h.type]}`}>{h.type}</span></td>
                  <td style={{ color: 'var(--t3)' }}>{h.description}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button className="btn bs bxs bico" onClick={() => setFormState(h)}><i className="fa-solid fa-pen-to-square" /></button>
                      <button className="btn brd bxs bico" onClick={() => remove.mutate(h._id)}><i className="fa-solid fa-trash" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {formState !== undefined && <HolidayFormModal holiday={formState} onClose={() => setFormState(undefined)} />}
    </div>
  );
}
