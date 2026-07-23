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
    password: '',
    role: admin?.role || 'manager',
    phone: admin?.phone || '',
    department: admin?.department || '',
    location: admin?.location || '',
  });
  const [showPwd, setShowPwd] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();

  const { data: depts = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data.items),
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = isTargetSuperadmin ? { ...form, role: undefined } : form;
      return isEdit ? api.put(`/admins/${admin._id}`, payload) : api.post('/admins', payload);
    },
    onSuccess: () => {
      toast(isEdit ? `${form.name} updated ✓` : `${form.name} added as ${ROLE_LABEL[form.role]} ✓`, 'success');
      qc.invalidateQueries({ queryKey: ['admins'] });
      onClose();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not save admin account.', 'error'),
  });

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const canSave = form.name.trim() && form.email.trim() && form.role && (isEdit || form.password.length >= 8);

  return (
    <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 'min(420px, 92vw)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-user-shield" /> {isEdit ? 'Edit Admin' : 'Add Admin'}</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="fg"><label className="fl">Full Name</label><input className="fc" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div className="fg">
          <label className="fl">Email</label>
          <input className="fc" type="email" value={form.email} disabled={isEdit} onChange={(e) => set('email', e.target.value)} />
        </div>
        {!isEdit && (
          <div className="fg">
            <label className="fl">Password</label>
            <div className="pw-wrap">
              <input
                className="fc"
                type={showPwd ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                placeholder="At least 8 characters"
              />
              <button type="button" className="pw-btn" onClick={() => setShowPwd((s) => !s)}>
                <i className={`fa-solid ${showPwd ? 'fa-eye-slash' : 'fa-eye'}`} />
              </button>
            </div>
          </div>
        )}
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
