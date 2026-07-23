import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Avatar from '../components/Avatar';
import AssetFormModal from '../components/AssetFormModal';
import AssetAssignModal from '../components/AssetAssignModal';
import Select from '../components/Select';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const STATUS_BADGE = { unassigned: 'b-gy', assigned: 'b-bl', returned: 'b-gy', damaged: 'b-re', lost: 'b-re' };
const CATEGORY_LABEL = { laptop: 'Laptop', mobile: 'Mobile', id_card: 'ID Card', access_card: 'Access Card', other: 'Other' };

export default function AssetsPage() {
  const { user } = useAuth();
  const canDelete = user?.role === 'superadmin' || user?.role === 'hr';
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [assigning, setAssigning] = useState(null);
  const toast = useToast();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['assets', statusFilter, categoryFilter],
    queryFn: () => api.get('/assets', { params: { status: statusFilter, category: categoryFilter, limit: 100 } }).then((r) => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['assets'] });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/assets/${id}/status`, { status }),
    onSuccess: (_res, vars) => {
      toast(`Asset marked ${vars.status}`, 'info');
      invalidate();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not update asset.', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/assets/${id}`),
    onSuccess: () => {
      toast('Asset deleted', 'warning');
      invalidate();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not delete asset.', 'error'),
  });

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Assets</div>
          <div className="pgs">{data?.total || 0} assets tracked</div>
        </div>
        <div className="ph-r" style={{ display: 'flex', gap: 7 }}>
          <Select style={{ width: 130 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="unassigned">Unassigned</option>
            <option value="assigned">Assigned</option>
            <option value="returned">Returned</option>
            <option value="damaged">Damaged</option>
            <option value="lost">Lost</option>
          </Select>
          <Select style={{ width: 140 }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All Categories</option>
            <option value="laptop">Laptop</option>
            <option value="mobile">Mobile</option>
            <option value="id_card">ID Card</option>
            <option value="access_card">Access Card</option>
            <option value="other">Other</option>
          </Select>
          <button className="btn bp bsm" onClick={() => setShowForm(true)}><i className="fa-solid fa-plus" /> Add Asset</button>
        </div>
      </div>
      <div className="card">
        <div className="tbl">
          <table>
            <thead>
              <tr><th>Asset</th><th>Category</th><th>Assigned To</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {data?.items.map((a) => (
                <tr key={a._id}>
                  <td style={{ fontWeight: 700, color: 'var(--t1)' }}>{a.name}{a.serialNumber ? <span style={{ color: 'var(--t3)', fontWeight: 400 }}> · {a.serialNumber}</span> : ''}</td>
                  <td>{CATEGORY_LABEL[a.category]}</td>
                  <td>
                    {a.employeeRef ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Avatar name={a.employeeRef.name} index={a.employeeRef.avatarIndex} size={22} fontSize={7} />
                        {a.employeeRef.name}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--t3)' }}>—</span>
                    )}
                  </td>
                  <td><span className={`badge ${STATUS_BADGE[a.status]}`}>{a.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button className="btn bs bxs" onClick={() => setAssigning(a)}>Assign</button>
                      {a.status === 'assigned' && (
                        <button className="btn bs bxs" onClick={() => updateStatus.mutate({ id: a._id, status: 'returned' })}>Return</button>
                      )}
                      <button className="btn bor bxs" onClick={() => updateStatus.mutate({ id: a._id, status: 'damaged' })}>Mark Damaged</button>
                      {canDelete && (
                        <button className="btn brd bxs bico" onClick={() => remove.mutate(a._id)}><i className="fa-solid fa-trash" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {data?.items.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--t3)', padding: 14 }}>No assets tracked yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {showForm && <AssetFormModal onClose={() => setShowForm(false)} />}
      {assigning && <AssetAssignModal asset={assigning} onClose={() => setAssigning(null)} />}
    </div>
  );
}
