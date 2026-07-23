import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Select from './Select';
import { useToast } from '../context/ToastContext';

const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

const CATEGORY_LABEL = {
  aadhar: 'Aadhar Card',
  pan: 'PAN Card',
  passport: 'Passport',
  joining_letter: 'Joining Letter',
  id_proof: 'Other ID Proof',
  certificate: 'Certificate',
  other: 'Other',
};
const CATEGORIES = Object.keys(CATEGORY_LABEL);

function fileSizeLabel(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentUploadModal({ employeeRef, document: existingDoc, onClose }) {
  const isEdit = !!existingDoc;
  const [category, setCategory] = useState(existingDoc?.category && CATEGORIES.includes(existingDoc.category) ? existingDoc.category : 'aadhar');
  const [name, setName] = useState(existingDoc?.name || '');
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);
  const toast = useToast();
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: (body) => (isEdit ? api.patch(`/documents/${existingDoc._id}`, body) : api.post('/documents', body)),
    onSuccess: () => {
      toast(isEdit ? 'Document updated ✓' : 'Document uploaded ✓', 'success');
      qc.invalidateQueries({ queryKey: ['my-documents'] });
      onClose();
    },
    onError: (err) => toast(err.response?.data?.message || `Could not ${isEdit ? 'update' : 'upload'} document.`, 'error'),
  });

  function onFileSelected(ev) {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    if (f.size > MAX_DOCUMENT_BYTES) {
      toast(`${f.name} is over 4MB.`, 'error');
      return;
    }
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''));
  }

  function submit() {
    const trimmedName = name.trim();
    if (!isEdit && !file) return;

    if (!file) {
      save.mutate({ employeeRef, name: trimmedName, category });
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      save.mutate({
        employeeRef,
        name: trimmedName || file.name,
        category,
        fileName: file.name,
        fileType: file.type,
        fileUrl: reader.result,
      });
    reader.readAsDataURL(file);
  }

  const currentFileLabel = file ? file.name : isEdit ? existingDoc.fileName || existingDoc.name : '';
  const canSave = isEdit ? !!name.trim() : !!file && !!name.trim();

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 'min(400px, 92vw)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className={`fa-solid ${isEdit ? 'fa-pen' : 'fa-upload'}`} /> {isEdit ? 'Edit Document' : 'Upload Document'}</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="fg">
          <label className="fl">Document Type</label>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
            ))}
          </Select>
        </div>
        <div className="fg">
          <label className="fl">Display Name</label>
          <input className="fc" placeholder="e.g. Aadhar Card" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="fg">
          <label className="fl">File (max 4MB)</label>
          <input ref={fileInputRef} type="file" hidden onChange={onFileSelected} />
          {currentFileLabel ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '7px 10px' }}>
              <i className="fa-solid fa-file" style={{ color: 'var(--t3)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentFileLabel}</div>
                {file && <div style={{ fontSize: 9.5, color: 'var(--t3)' }}>{fileSizeLabel(file.size)} · new file</div>}
              </div>
              <button className="btn bs bxs" type="button" onClick={() => fileInputRef.current?.click()}>
                <i className="fa-solid fa-rotate" /> Replace
              </button>
              {file && (
                <button className="btn brd bxs bico" type="button" onClick={() => setFile(null)} title="Remove selected file">
                  <i className="fa-solid fa-xmark" />
                </button>
              )}
            </div>
          ) : (
            <button className="btn bs bsm" type="button" onClick={() => fileInputRef.current?.click()} style={{ width: '100%' }}>
              <i className="fa-solid fa-upload" /> Choose File
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button className="btn bp bsm" disabled={!canSave || save.isPending} onClick={submit}>
            <i className="fa-solid fa-check" /> {isEdit ? 'Save Changes' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
