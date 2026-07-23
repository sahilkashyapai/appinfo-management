import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Select from './Select';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const MAX_RESUME_BYTES = 4 * 1024 * 1024;

export default function ReferralFormModal({ referral, onClose }) {
  const isEdit = !!referral;
  const { user } = useAuth();
  const [candidateName, setCandidateName] = useState(referral?.name || '');
  const [candidatePhone, setCandidatePhone] = useState(referral?.phone || '');
  const [department, setDepartment] = useState(referral?.department || '');
  const [resume, setResume] = useState(null);
  const [err, setErr] = useState('');
  const fileInputRef = useRef(null);
  const toast = useToast();
  const qc = useQueryClient();

  const { data: depts = [] } = useQuery({
    queryKey: ['departments-public'],
    queryFn: () => api.get('/departments/public').then((r) => r.data.items),
  });

  const submit = useMutation({
    mutationFn: (body) => (isEdit ? api.patch(`/job-applications/${referral._id}/referral`, body) : api.post('/job-applications/refer', body)),
    onSuccess: () => {
      toast(isEdit ? 'Referral updated ✓' : `Thanks! ${candidateName} has been referred for ${department}.`, 'success');
      qc.invalidateQueries({ queryKey: ['job-applications'] });
      qc.invalidateQueries({ queryKey: ['my-referrals'] });
      onClose();
    },
    onError: (ex) => setErr(ex.response?.data?.message || `Could not ${isEdit ? 'update' : 'submit'} referral.`),
  });

  function onFileSelected(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_RESUME_BYTES) {
      setErr('Resume file must be under 4MB.');
      return;
    }
    setErr('');
    setResume(f);
  }

  function onSubmit() {
    setErr('');
    if (!candidateName.trim() || !candidatePhone.trim() || !department) {
      setErr('Please fill in the candidate name, mobile number, and department.');
      return;
    }
    if (!resume && !isEdit) {
      setErr('Please attach the candidate’s resume.');
      return;
    }

    const payload = { candidateName: candidateName.trim(), candidatePhone: candidatePhone.trim(), department };
    if (!resume) {
      submit.mutate(payload);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => submit.mutate({ ...payload, resumeUrl: reader.result, resumeName: resume.name });
    reader.readAsDataURL(resume);
  }

  return (
    <div
      style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 950, alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: 'min(440px, 92vw)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="chd">
          <div className="cht"><i className="fa-solid fa-user-plus" /> {isEdit ? 'Edit Referral' : 'Refer a Candidate'}</div>
          <button className="btn bs bxs bico" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>

        <div className="fg">
          <label className="fl">Referred By</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '7px 10px', fontSize: 11.5 }}>
            <i className="fa-solid fa-circle-user" style={{ color: 'var(--t3)' }} />
            <div>
              <div style={{ fontWeight: 700, color: 'var(--t1)' }}>{user?.name}</div>
              <div style={{ color: 'var(--t3)', fontSize: 10.5 }}>{user?.email}</div>
            </div>
          </div>
        </div>

        <div className={`af-err${err ? ' show' : ''}`}><i className="fa-solid fa-circle-exclamation" /><span>{err}</span></div>

        <div className="fg"><label className="fl">Candidate Name</label><input className="fc" value={candidateName} onChange={(e) => setCandidateName(e.target.value)} placeholder="Jane Doe" /></div>
        <div className="fg"><label className="fl">Candidate Mobile Number</label><input className="fc" type="tel" value={candidatePhone} onChange={(e) => setCandidatePhone(e.target.value)} placeholder="+91 98765 43210" /></div>
        <div className="fg">
          <label className="fl">Department</label>
          <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">Select department</option>
            {depts.filter((d) => d.name.toLowerCase() !== 'Head of Company').map((d) => <option key={d._id} value={d.name}>{d.name}</option>)}
          </Select>
        </div>
        <div className="fg">
          <label className="fl">Resume (max 4MB)</label>
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" hidden onChange={onFileSelected} />
          {resume || (isEdit && referral.resumeName) ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '7px 10px' }}>
              <i className="fa-solid fa-file" style={{ color: 'var(--t3)' }} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {resume ? resume.name : referral.resumeName}
                {!resume && <span style={{ color: 'var(--t3)', fontWeight: 400 }}> (current)</span>}
              </div>
              <button className="btn bs bxs" type="button" onClick={() => fileInputRef.current?.click()}><i className="fa-solid fa-rotate" /> Replace</button>
            </div>
          ) : (
            <button className="btn bs bsm" type="button" onClick={() => fileInputRef.current?.click()} style={{ width: '100%' }}>
              <i className="fa-solid fa-upload" /> Choose File
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="btn bs bsm" onClick={onClose}>Cancel</button>
          <button className="btn bp bsm" disabled={submit.isPending} onClick={onSubmit}>
            <i className="fa-solid fa-check" /> {isEdit ? 'Save Changes' : 'Submit Referral'}
          </button>
        </div>
      </div>
    </div>
  );
}
