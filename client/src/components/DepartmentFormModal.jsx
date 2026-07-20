import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useToast } from '../context/ToastContext';

export default function DepartmentFormModal({ department, onClose }) {
  const isEdit = !!department;
  const [form, setForm] = useState({
    name: department?.name || '',
    code: department?.code || '',
    description: department?.description || '',
  });
  const toast = useToast();
  const qc = useQueryClient();

  const hasUnsavedInput = !!(form.name.trim() || form.code.trim() || form.description.trim());

  function closeIfEmpty() {
    if (!hasUnsavedInput) onClose();
  }

  const save = useMutation({
    mutationFn: () => (isEdit ? api.put(`/departments/${department._id}`, form) : api.post('/departments', form)),
    onSuccess: () => {
      toast(isEdit ? 'Department updated ✓' : 'Department added ✓', 'success');
      qc.invalidateQueries({ queryKey: ['departments'] });
      onClose();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not save department.', 'error'),
  });

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && closeIfEmpty()}
    >
      <div className="card" style={{ width: 'min(420px, 92vw)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-building" /> {isEdit ? 'Edit Department' : 'Add Department'}</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="fg2">
          <div className="fg"><label className="fl">Name</label><input className="fc" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="fg"><label className="fl">Code</label><input className="fc" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} /></div>
        </div>
        <div className="fg"><label className="fl">Description</label><textarea className="fc" style={{ height: 60, resize: 'none' }} value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button className="btn bp bsm" disabled={!form.name || !form.code || save.isPending} onClick={() => save.mutate()}>
            <i className="fa-solid fa-check" /> {isEdit ? 'Save Changes' : 'Add Department'}
          </button>
        </div>
      </div>
    </div>
  );
}
