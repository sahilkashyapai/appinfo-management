import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useToast } from '../context/ToastContext';
import AnnouncementFormModal from '../components/AnnouncementFormModal';
import CandidateReviewModal from '../components/CandidateReviewModal';
import Select from '../components/Select';
import { formatDate } from '../utils/avatar';

const PRIORITY_BADGE = { high: 'b-re', medium: 'b-or', low: 'b-gr' };
const STATUS_BADGE = { new: 'b-bl', reviewed: 'b-or', shortlisted: 'b-pu', hired: 'b-gr', rejected: 'b-re' };
const STATUSES = ['new', 'reviewed', 'shortlisted', 'rejected', 'hired'];
const STATUS_LABEL = { new: 'New', reviewed: 'Reviewed', shortlisted: 'Shortlisted', rejected: 'Rejected', hired: 'Hired' };
const APPLY_LINK = `${window.location.origin}/apply`;

const GENDER_LABEL = { male: 'Male', female: 'Female', other: 'Other' };

export default function HiringPage() {
  const [formState, setFormState] = useState(undefined); // undefined=closed, {}=create, {announcement}=edit
  const [reviewCandidate, setReviewCandidate] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const toast = useToast();
  const qc = useQueryClient();

  const { data: alerts = [] } = useQuery({
    queryKey: ['announcements', 'hiring'],
    queryFn: () => api.get('/announcements?type=hiring').then((r) => r.data.items),
  });

  const removeAlert = useMutation({
    mutationFn: (id) => api.delete(`/announcements/${id}`),
    onSuccess: () => {
      toast('Hiring alert removed', 'warning');
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const { data: depts = [] } = useQuery({
    queryKey: ['departments-public'],
    queryFn: () => api.get('/departments/public').then((r) => r.data.items),
  });

  const candidateParams = {
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(deptFilter !== 'all' && { department: deptFilter }),
    ...(dateFrom && { from: dateFrom }),
    ...(dateTo && { to: dateTo }),
  };
  const { data: candidates = [] } = useQuery({
    queryKey: ['job-applications', statusFilter, deptFilter, dateFrom, dateTo],
    queryFn: () => api.get('/job-applications', { params: candidateParams }).then((r) => r.data.items),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/job-applications/${id}`, { status }),
    onSuccess: () => {
      toast('Status updated', 'success');
      qc.invalidateQueries({ queryKey: ['job-applications'] });
    },
  });

  const removeCandidate = useMutation({
    mutationFn: (id) => api.delete(`/job-applications/${id}`),
    onSuccess: () => {
      toast('Application deleted', 'warning');
      qc.invalidateQueries({ queryKey: ['job-applications'] });
    },
  });

  async function copyApplyLink() {
    try {
      await navigator.clipboard.writeText(APPLY_LINK);
      toast('Application form link copied ✓', 'success');
    } catch {
      toast(`Copy this link: ${APPLY_LINK}`, 'info');
    }
  }

  async function copyToClipboard(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied ✓`, 'success');
    } catch {
      toast(`Copy this ${label.toLowerCase()}: ${text}`, 'info');
    }
  }

  function dataUrlToBlobUrl(dataUrl) {
    const [header, base64] = dataUrl.split(',');
    const mime = header.match(/data:(.*?);base64/)?.[1] || 'application/octet-stream';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  }

  async function previewResume(candidate) {
    try {
      const res = await api.get(`/job-applications/${candidate._id}`);
      window.open(dataUrlToBlobUrl(res.data.item.resumeUrl), '_blank');
    } catch {
      toast('Could not load resume.', 'error');
    }
  }

  async function downloadResume(candidate) {
    try {
      const res = await api.get(`/job-applications/${candidate._id}`);
      const { resumeUrl, resumeName } = res.data.item;
      const a = document.createElement('a');
      a.href = dataUrlToBlobUrl(resumeUrl);
      a.download = resumeName || `${candidate.name}-resume`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast('Could not load resume.', 'error');
    }
  }

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Hiring Management</div>
          <div className="pgs">{alerts.length} hiring alert(s) · {candidates.length} candidate(s)</div>
        </div>
        <div className="ph-r" style={{ display: 'flex', gap: 7 }}>
          <button className="btn bs bsm" onClick={copyApplyLink}><i className="fa-solid fa-link" /> Copy Application Form Link</button>
          <button className="btn bp bsm" onClick={() => setFormState({})}><i className="fa-solid fa-plus" /> New Hiring Alert</button>
        </div>
      </div>

      <div className="card mb13">
        <div className="chd"><div className="cht"><i className="fa-solid fa-briefcase" /> Hiring Alerts</div></div>
        {alerts.map((a) => (
          <div className={`ann ${a.priority}`} key={a._id}>
            <div style={{ fontSize: 24, flexShrink: 0, marginTop: 1 }}>{a.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t1)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                {a.pinned ? '📌 ' : ''}{a.title}
                <span className={`badge ${PRIORITY_BADGE[a.priority]}`}>{a.priority}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, marginBottom: 6 }}>{a.body}</div>
              <div style={{ fontSize: 12.5, color: 'var(--t3)' }}>Posted by <strong>{a.postedByRef?.name || 'Unknown'}</strong> · {formatDate(a.createdAt)}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, marginLeft: 8 }}>
              <button className="btn bs bxs bico" onClick={() => setFormState({ announcement: a })}><i className="fa-solid fa-pen-to-square" /></button>
              <button className="btn brd bxs bico" onClick={() => removeAlert.mutate(a._id)}><i className="fa-solid fa-trash" /></button>
            </div>
          </div>
        ))}
        {alerts.length === 0 && <div style={{ color: 'var(--t3)', fontSize: 12 }}>No hiring alerts yet. Post one to notify every employee.</div>}
      </div>

      <div className="ph">
        <div className="ph-l">
          <div className="cht"><i className="fa-solid fa-address-card" /> Candidates</div>
          <div className="pgs">{candidates.length} matching application(s)</div>
        </div>
        <div className="ph-r" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ width: 150 }}>
            <label className="fl">Department</label>
            <Select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
              <option value="all">All departments</option>
              {depts.map((d) => <option key={d._id} value={d.name}>{d.name}</option>)}
            </Select>
          </div>
          <div style={{ width: 150 }}>
            <label className="fl">Status</label>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </Select>
          </div>
          <div>
            <label className="fl">From</label>
            <input className="fc" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="fl">To</label>
            <input className="fc" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
      </div>

      {candidates.map((c) => (
        <div className="card mb13" key={c._id}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t1)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                {c.name}
                <span className={`badge ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                {c.source === 'referral' && <span className="badge b-pu"><i className="fa-solid fa-user-plus" /> Referral</span>}
              </div>
              <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 6 }}>
                <strong>{c.department}</strong>
                {c.gender && <> · {GENDER_LABEL[c.gender]}</>}
                {c.experienceYears != null && <> · {c.experienceYears} yr(s) experience</>}
                {c.source === 'referral' && c.referrerRef && <> · Referred by <strong>{c.referrerRef.name}</strong></>}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                {c.email && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="fa-solid fa-envelope" /> {c.email}
                    <i
                      className="fa-solid fa-copy"
                      style={{ cursor: 'pointer', color: 'var(--accent)' }}
                      title="Copy email"
                      onClick={() => copyToClipboard(c.email, 'Email')}
                    />
                  </span>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="fa-solid fa-phone" /> {c.phone}
                  <i
                    className="fa-solid fa-copy"
                    style={{ cursor: 'pointer', color: 'var(--accent)' }}
                    title="Copy phone number"
                    onClick={() => copyToClipboard(c.phone, 'Phone number')}
                  />
                </span>
                <span>Applied {formatDate(c.createdAt)}</span>
              </div>
              {(c.referrerComment || c.notes) && (
                <div style={{ fontSize: 11.5, color: 'var(--t2)', background: 'var(--bg3)', borderRadius: 'var(--r)', padding: '7px 9px', marginTop: 7 }}>
                  {c.referrerComment && <div><i className="fa-solid fa-comment" style={{ color: 'var(--t3)', marginRight: 5 }} />{c.referrerComment}</div>}
                  {c.notes && <div style={{ marginTop: c.referrerComment ? 4 : 0 }}><i className="fa-solid fa-lock" style={{ color: 'var(--t3)', marginRight: 5 }} /><em>Internal:</em> {c.notes}</div>}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
              <div style={{ width: 130 }}>
                <Select value={c.status} onChange={(e) => updateStatus.mutate({ id: c._id, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </Select>
              </div>
              <button className="btn bs bxs bico" title="Add comment / notes" onClick={() => setReviewCandidate(c)}><i className="fa-solid fa-comment" /></button>
              <button className="btn bs bxs bico" title="Preview resume" onClick={() => previewResume(c)}><i className="fa-solid fa-eye" /></button>
              <button className="btn bs bxs bico" title="Download resume" onClick={() => downloadResume(c)}><i className="fa-solid fa-download" /></button>
              <button className="btn brd bxs bico" onClick={() => removeCandidate.mutate(c._id)}><i className="fa-solid fa-trash" /></button>
            </div>
          </div>
        </div>
      ))}
      {candidates.length === 0 && <div className="card" style={{ color: 'var(--t3)', fontSize: 12 }}>No applications match these filters.</div>}

      {formState !== undefined && (
        <AnnouncementFormModal announcement={formState.announcement} defaultType="hiring" lockType onClose={() => setFormState(undefined)} />
      )}
      {reviewCandidate && <CandidateReviewModal candidate={reviewCandidate} onClose={() => setReviewCandidate(null)} />}
    </div>
  );
}
