import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Select from './Select';
import { useToast } from '../context/ToastContext';
import { OFFICE_LOCATIONS } from '../utils/offices';

const ROLE_LABEL = { manager: 'Manager', hr: 'HR', superadmin: 'Superadmin' };
// Superadmin is never a choice here — an existing superadmin account can still be
// deactivated/deleted elsewhere on this page, but nobody grants that role from a dropdown.
const SETTABLE_ROLES = ['manager', 'hr'];

export default function AdminFormModal({ admin, onClose }) {
  const isEdit = !!admin;
  const isTargetSuperadmin = isEdit && admin?.role === 'superadmin';
  const [form, setForm] = useState({
    name: admin?.name || '',
    email: admin?.email || '',
    role: admin?.role || 'manager',
    phone: admin?.phone || '',
    department: admin?.department || '',
    location: admin?.location || '',
    employeeId: '',
  });
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();

  const { data: depts = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data.items),
  });

  // New admins are picked from any active employee (except those already admins) —
  // name/email/phone come straight from that record instead of being retyped.
  const { data: employees = [] } = useQuery({
    queryKey: ['admins-eligible-employees'],
    queryFn: () => api.get('/admins/eligible-employees').then((r) => r.data.items),
    enabled: !isEdit,
  });
  const selectedEmployee = employees.find((e) => e._id === form.employeeId);
  // Mirrors the server's roleFromLabel — shown so the admin knows what access
  // level they're about to grant, without making them pick it separately.
  const inferredRole = selectedEmployee ? (/hr/i.test(selectedEmployee.roleLabel || '') ? 'hr' : 'manager') : null;

  const save = useMutation({
    mutationFn: () => {
      if (isEdit) {
        const payload = isTargetSuperadmin ? { ...form, role: undefined } : form;
        return api.put(`/admins/${admin._id}`, payload);
      }
      return api.post('/admins', { employeeId: form.employeeId });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admins'] });
      if (isEdit) {
        toast(`${form.name} updated ✓`, 'success');
        onClose();
      } else {
        const { item, tempPassword, upgraded } = res.data;
        setCreated({ name: item.name, role: item.role, tempPassword, upgraded });
      }
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not save admin account.', 'error'),
  });

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function selectEmployee(id) {
    set('employeeId', id);
  }

  const canSave = isEdit
    ? form.name.trim() && form.email.trim() && form.role
    : !!form.employeeId;

  if (created) {
    return (
      <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ width: 'min(420px, 92vw)' }}>
          <div className="chd">
            <div className="cht"><i className="fa-solid fa-circle-check" style={{ color: 'var(--green)' }} /> {created.upgraded ? 'Admin Access Granted' : 'Admin Created'}</div>
          </div>
          <div style={{ padding: '2px 2px 14px' }}>
            <p style={{ margin: '0 0 10px', fontSize: 13 }}>
              <strong>{created.name}</strong> {created.upgraded ? 'was promoted to' : 'was added as'}{' '}
              <span className={`badge ${created.role === 'hr' ? 'b-gr' : 'b-bl'}`}>{ROLE_LABEL[created.role]}</span>.
            </p>
            {created.upgraded ? (
              <div style={{ fontSize: 11.5, color: 'var(--t3)' }}>
                They already had a login — it now has {ROLE_LABEL[created.role]} access. They sign in with their existing password, unchanged.
              </div>
            ) : (
              <>
                <label className="fl">Temporary Password</label>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <input className="fc" readOnly value={created.tempPassword} style={{ fontFamily: 'monospace', fontSize: 14 }} />
                  <button
                    type="button"
                    className="btn bs bsm"
                    onClick={() => {
                      navigator.clipboard.writeText(created.tempPassword);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'}`} /> {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 8 }}>
                  This was also emailed to them. Make a note of it now — it won't be shown again. They should change it after signing in.
                </div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn bp bsm" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 'min(420px, 92vw)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-user-shield" /> {isEdit ? 'Edit Admin' : 'Add Admin'}</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        {isEdit ? (
          <>
            <div className="fg"><label className="fl">Full Name</label><input className="fc" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
            <div className="fg">
              <label className="fl">Email</label>
              <input className="fc" type="email" value={form.email} disabled onChange={(e) => set('email', e.target.value)} />
            </div>
          </>
        ) : (
          <div className="fg">
            <label className="fl">Employee</label>
            <Select value={form.employeeId} onChange={(e) => selectEmployee(e.target.value)}>
              <option value="">Select…</option>
              {employees.map((e) => (
                <option key={e._id} value={e._id}>{e.name} · {e.email}{e.hasLogin ? ' (existing login)' : ''}</option>
              ))}
            </Select>
            {employees.length === 0 && (
              <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 4 }}>
                No employees available — everyone active is already an admin, or none exist yet.
              </div>
            )}
            {selectedEmployee && (
              <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span>{selectedEmployee.email}</span>
                {selectedEmployee.phone && <span>{selectedEmployee.phone}</span>}
                <span>
                  {selectedEmployee.hasLogin ? 'Existing login will be promoted to' : 'Will be added as'}{' '}
                  <span className={`badge ${inferredRole === 'hr' ? 'b-gr' : 'b-bl'}`}>{ROLE_LABEL[inferredRole]}</span>, based on their Role Label ({selectedEmployee.roleLabel})
                </span>
              </div>
            )}
          </div>
        )}
        {isEdit && (
          <div className="fg">
            <label className="fl">Role</label>
            {isTargetSuperadmin ? (
              <div className="fc" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="badge b-go">Superadmin</span>
                <span style={{ fontSize: 10.5, color: 'var(--t3)' }}>Can't be changed here</span>
              </div>
            ) : (
              <Select value={form.role} onChange={(e) => set('role', e.target.value)}>
                {SETTABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </Select>
            )}
          </div>
        )}
        {isEdit && (
          <>
            <div className="fg2">
              <div className="fg"><label className="fl">Phone</label><input className="fc" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
              <div className="fg">
                <label className="fl">Department</label>
                <Select value={form.department} onChange={(e) => set('department', e.target.value)}>
                  <option value="">Select…</option>
                  {depts.map((d) => <option key={d._id} value={d.name}>{d.name}</option>)}
                  {form.department && !depts.some((d) => d.name === form.department) && <option value={form.department}>{form.department}</option>}
                </Select>
              </div>
            </div>
            <div className="fg">
              <label className="fl">Location</label>
              <Select value={form.location} onChange={(e) => set('location', e.target.value)}>
                <option value="">Select…</option>
                {OFFICE_LOCATIONS.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
              </Select>
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button className="btn bp bsm" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
            <i className="fa-solid fa-check" /> {isEdit ? 'Save Changes' : 'Add Admin'}
          </button>
        </div>
      </div>
    </div>
  );
}
