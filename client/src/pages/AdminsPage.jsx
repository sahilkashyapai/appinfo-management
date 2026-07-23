import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Avatar from '../components/Avatar';
import AdminFormModal from '../components/AdminFormModal';
import ConfirmModal from '../components/ConfirmModal';
import Select from '../components/Select';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDateTime } from '../utils/avatar';

const ROLE_LABEL = { manager: 'Manager', hr: 'HR', superadmin: 'Superadmin' };
const ROLE_BADGE = { manager: 'b-bl', hr: 'b-gr', superadmin: 'b-go' };

export default function AdminsPage() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const toast = useToast();
  const qc = useQueryClient();

  const { data: admins = [] } = useQuery({
    queryKey: ['admins'],
    queryFn: () => api.get('/admins').then((r) => r.data.items),
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }) => api.put(`/admins/${id}`, { role }),
    onSuccess: () => {
      toast('Role updated ✓', 'success');
      qc.invalidateQueries({ queryKey: ['admins'] });
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not change role.', 'error'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }) => api.put(`/admins/${id}`, { isActive }),
    onSuccess: () => {
      toast('Admin account updated ✓', 'success');
      qc.invalidateQueries({ queryKey: ['admins'] });
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not update account.', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id) => api.delete(`/admins/${id}`),
    onSuccess: (res) => {
      toast(res.data.message, 'warning');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['admins'] });
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not delete account.', 'error'),
  });

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Admins</div>
          <div className="pgs">{isSuperadmin ? 'Manage manager, HR and superadmin accounts' : 'Manager and HR accounts'}</div>
        </div>
        {isSuperadmin && (
          <div className="ph-r">
            <button className="btn bp bsm" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <i className="fa-solid fa-user-plus" /> Add Admin
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Location</th><th>Last Login</th>
                {isSuperadmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a._id}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Avatar name={a.name} index={a.avatarIndex} src={a.avatarUrl} size={26} fontSize={9} /><span style={{ fontWeight: 600 }}>{a.name}</span></div></td>
                  <td style={{ color: 'var(--t3)' }}>{a.email}</td>
                  <td>
                    {!isSuperadmin && a._id !== user?.id ? (
                      <Select style={{ width: 130 }} value={a.role} onChange={(e) => changeRole.mutate({ id: a._id, role: e.target.value })}>
                        <option value="manager">Manager</option>
                        <option value="hr">HR</option>
                      </Select>
                    ) : (
                      <span className={`badge ${ROLE_BADGE[a.role]}`}>{ROLE_LABEL[a.role]}</span>
                    )}
                  </td>
                  <td><span className={`badge ${a.isActive ? 'b-gr' : 'b-gy'}`}>{a.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td style={{ color: 'var(--t3)' }}>{a.location || '—'}</td>
                  <td style={{ fontSize: 10.5, color: 'var(--t3)', whiteSpace: 'nowrap' }}>{a.lastLogin ? formatDateTime(a.lastLogin) : 'Never'}</td>
                  {isSuperadmin && (
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn bs bxs bico" title="Edit" onClick={() => { setEditing(a); setFormOpen(true); }}>
                          <i className="fa-solid fa-pen" />
                        </button>
                        <button
                          className="btn bs bxs bico"
                          title={a.isActive ? 'Deactivate' : 'Activate'}
                          disabled={toggleActive.isPending}
                          onClick={() => toggleActive.mutate({ id: a._id, isActive: !a.isActive })}
                        >
                          <i className={`fa-solid ${a.isActive ? 'fa-user-slash' : 'fa-user-check'}`} />
                        </button>
                        {a._id !== user?.id && (
                          <button className="btn brd bxs bico" title="Delete" onClick={() => setDeleting(a)}>
                            <i className="fa-solid fa-trash" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {admins.length === 0 && (
                <tr><td colSpan={isSuperadmin ? 7 : 6} style={{ textAlign: 'center', color: 'var(--t3)', padding: 14 }}>No admin accounts yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && <AdminFormModal admin={editing} onClose={() => setFormOpen(false)} />}
      {deleting && (
        <ConfirmModal
          title={deleting.promotedAdmin ? 'Revoke Admin Access' : 'Delete Admin Account'}
          message={
            deleting.promotedAdmin
              ? `Revoke ${deleting.name}'s ${ROLE_LABEL[deleting.role]} access? Their employee login stays active — they just drop back to a regular employee account.`
              : `Permanently delete ${deleting.name}'s ${ROLE_LABEL[deleting.role]} account? This cannot be undone.`
          }
          confirmLabel={deleting.promotedAdmin ? 'Revoke' : 'Delete'}
          danger={!deleting.promotedAdmin}
          pending={remove.isPending}
          onConfirm={() => remove.mutate(deleting._id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
