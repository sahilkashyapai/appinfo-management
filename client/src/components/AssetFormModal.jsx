import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Select from './Select';
import { useToast } from '../context/ToastContext';

export default function AssetFormModal({ onClose }) {
  const [form, setForm] = useState({ name: '', category: 'laptop', serialNumber: '', notes: '' });
  const toast = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => api.post('/assets', form),
    onSuccess: () => {
      toast('Asset added ✓', 'success');
      qc.invalidateQueries({ queryKey: ['assets'] });
      onClose();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not add asset.', 'error'),
  });

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 'min(400px, 92vw)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-boxes-stacked" /> Add Asset</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="fg"><label className="fl">Name</label><input className="fc" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div className="fg2">
          <div className="fg">
            <label className="fl">Category</label>
            <Select value={form.category} onChange={(e) => set('category', e.target.value)}>
              <option value="laptop">Laptop</option>
              <option value="mobile">Mobile</option>
              <option value="id_card">ID Card</option>
              <option value="access_card">Access Card</option>
              <option value="other">Other</option>
            </Select>
          </div>
          <div className="fg"><label className="fl">Serial Number</label><input className="fc" value={form.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} /></div>
        </div>
        <div className="fg"><label className="fl">Notes</label><input className="fc" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button className="btn bp bsm" disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()}>
            <i className="fa-solid fa-check" /> Add Asset
          </button>
        </div>
      </div>
    </div>
  );
}
