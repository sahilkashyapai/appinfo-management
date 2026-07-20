import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

const EMP_ID_REGEX = /^APIIND\d{6}$/;
const ROLE_LABELS = ['CEO', 'CTO', 'CFO', 'HR', 'Team Lead', 'Manager', 'Senior Employee', 'Employee', 'Intern'];

function toInputDate(d) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

export default function EmployeeFormModal({ employee, onClose }) {
  const isEdit = !!employee;
  const { user } = useAuth();
  const canEditEmpId = !isEdit || user?.role === 'superadmin';
  const [form, setForm] = useState({
    empId: employee?.empId || '',
    name: employee?.name || '',
    dept: employee?.dept || '',
    desig: employee?.desig || '',
    roleLabel: employee?.roleLabel || 'Employee',
    joined: toInputDate(employee?.joined) || '',
    dob: toInputDate(employee?.dob) || '',
    email: employee?.email || '',
    phone: employee?.phone || '',
    location: employee?.location || '',
    status: employee?.status || 'active',
  });
  const toast = useToast();
  const qc = useQueryClient();

  const { data: depts = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data.items),
  });

  const { data: suggestedEmpId } = useQuery({
    queryKey: ['next-emp-id'],
    queryFn: () => api.get('/employees/next-emp-id').then((r) => r.data.empId),
    enabled: !isEdit,
  });

  useEffect(() => {
    if (!isEdit && suggestedEmpId && !form.empId) setForm((f) => ({ ...f, empId: suggestedEmpId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedEmpId]);

  const save = useMutation({
    mutationFn: () => (isEdit ? api.put(`/employees/${employee._id}`, form) : api.post('/employees', form)),
    onSuccess: () => {
      toast(isEdit ? `${form.name} updated ✓` : `${form.name} added ✓`, 'success');
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['employee', employee?._id] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['next-emp-id'] });
      onClose();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not save employee.', 'error'),
  });

  // Legacy employee ids (e.g. EMP001) predate the APIIND###### format — only force
  // validation when the id is actually being set/changed, not on unrelated edits.
  const empIdChanged = !isEdit || form.empId !== employee?.empId;
  const empIdValid = !empIdChanged || EMP_ID_REGEX.test(form.empId);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 'min(480px, 92vw)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-user-plus" /> {isEdit ? 'Edit Employee' : 'Add Employee'}</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="fg2">
          <div className="fg">
            <label className="fl">Employee ID</label>
            <input
              className="fc"
              value={form.empId}
              disabled={!canEditEmpId}
              onChange={(e) => set('empId', e.target.value.toUpperCase())}
              placeholder="APIIND000000"
            />
            {canEditEmpId && form.empId && !empIdValid && (
              <div style={{ fontSize: 10, color: 'var(--red, #E74C3C)', marginTop: 3 }}>Must look like APIIND000000.</div>
            )}
            {!canEditEmpId && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>Only a super admin can change an existing employee ID.</div>}
          </div>
          <div className="fg"><label className="fl">Full Name</label><input className="fc" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="fg">
            <label className="fl">Department</label>
            <select className="fc" value={form.dept} onChange={(e) => set('dept', e.target.value)}>
              <option value="">Select…</option>
              {depts.map((d) => <option key={d._id} value={d.name}>{d.name}</option>)}
            </select>
          </div>
          <div className="fg"><label className="fl">Designation</label><input className="fc" value={form.desig} onChange={(e) => set('desig', e.target.value)} /></div>
          <div className="fg">
            <label className="fl">Role Label</label>
            <select className="fc" value={form.roleLabel} onChange={(e) => set('roleLabel', e.target.value)}>
              {ROLE_LABELS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="fg"><label className="fl">Date Joined</label><input type="date" className="fc" value={form.joined} onChange={(e) => set('joined', e.target.value)} /></div>
          <div className="fg"><label className="fl">Date of Birth</label><input type="date" className="fc" value={form.dob} onChange={(e) => set('dob', e.target.value)} /></div>
          <div className="fg"><label className="fl">Email</label><input className="fc" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
          <div className="fg"><label className="fl">Phone</label><input className="fc" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          <div className="fg"><label className="fl">Location</label><input className="fc" value={form.location} onChange={(e) => set('location', e.target.value)} /></div>
          <div className="fg">
            <label className="fl">Status</label>
            <select className="fc" value={form.status} onChange={(e) => set('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="leave">On Leave</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button className="btn bp bsm" disabled={save.isPending || (canEditEmpId && !empIdValid)} onClick={() => save.mutate()}>
            <i className="fa-solid fa-check" /> {isEdit ? 'Save Changes' : 'Add Employee'}
          </button>
        </div>
      </div>
    </div>
  );
}
