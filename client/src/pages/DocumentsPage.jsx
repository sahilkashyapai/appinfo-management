import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import Avatar from '../components/Avatar';
import ConfirmModal from '../components/ConfirmModal';
import PromptModal from '../components/PromptModal';
import DocumentUploadModal from '../components/DocumentUploadModal';
import DocumentRequestModal from '../components/DocumentRequestModal';
import DocumentFulfillModal from '../components/DocumentFulfillModal';
import DocumentPreviewModal from '../components/DocumentPreviewModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDate } from '../utils/avatar';
import { ADMIN_ROLES, APPROVER_ROLES } from '../utils/roles';

const DOC_CATEGORY_LABEL = {
  aadhar: 'Aadhar Card',
  pan: 'PAN Card',
  passport: 'Passport',
  joining_letter: 'Joining Letter',
  offer_letter: 'Offer Letter',
  salary_slip: 'Salary Slip',
  experience_letter: 'Experience Letter',
  relieving_letter: 'Relieving Letter',
  salary_certificate: 'Salary Certificate',
  form16: 'Form 16',
  id_proof: 'ID Proof',
  certificate: 'Certificate',
  other: 'Other',
};

const REQUEST_TYPE_LABEL = {
  salary_slip: 'Salary Slip',
  experience_letter: 'Experience Letter',
  relieving_letter: 'Relieving Letter',
  salary_certificate: 'Salary Certificate',
  form16: 'Form 16',
  other: 'Other',
};

const REQUEST_STATUS_BADGE = { pending: 'b-or', fulfilled: 'b-gr', rejected: 'b-re' };

export default function DocumentsPage() {
  const { user } = useAuth();
  const canApprove = APPROVER_ROLES.includes(user?.role);
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(canApprove && searchParams.get('tab') === 'requests' ? 'requests' : 'mine');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [deletingDoc, setDeletingDoc] = useState(null);
  const [fulfilling, setFulfilling] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const toast = useToast();
  const qc = useQueryClient();

  const hasEmployeeRecord = !!user?.employeeRef;

  const { data: myDocs } = useQuery({
    queryKey: ['my-documents'],
    queryFn: () => api.get('/documents', { params: { employeeRef: user.employeeRef } }).then((r) => r.data.items),
    enabled: hasEmployeeRecord,
  });
  const { data: myRequests } = useQuery({
    queryKey: ['document-requests', 'mine'],
    queryFn: () => api.get('/documents/requests/mine').then((r) => r.data.items),
    enabled: hasEmployeeRecord,
  });
  const { data: pendingRequests } = useQuery({
    queryKey: ['document-requests', 'pending'],
    queryFn: () => api.get('/documents/requests', { params: { status: 'pending' } }).then((r) => r.data.items),
    enabled: canApprove && tab === 'requests',
  });

  const download = useMutation({
    mutationFn: (id) => api.get(`/documents/${id}`).then((r) => r.data.item),
    onSuccess: (doc) => {
      const a = document.createElement('a');
      a.href = doc.fileUrl;
      a.download = doc.fileName || doc.name;
      a.click();
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not download document.', 'error'),
  });

  const loadPreview = useMutation({
    mutationFn: (id) => api.get(`/documents/${id}`).then((r) => r.data.item),
    onSuccess: (doc) => setPreviewDoc(doc),
    onError: (err) => toast(err.response?.data?.message || 'Could not open preview.', 'error'),
  });

  const deleteDoc = useMutation({
    mutationFn: (id) => api.delete(`/documents/${id}`),
    onSuccess: () => {
      toast('Document deleted', 'info');
      setDeletingDoc(null);
      qc.invalidateQueries({ queryKey: ['my-documents'] });
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not delete document.', 'error'),
  });

  const cancelRequest = useMutation({
    mutationFn: (id) => api.patch(`/documents/requests/${id}/cancel`),
    onSuccess: () => {
      toast('Request cancelled', 'info');
      qc.invalidateQueries({ queryKey: ['document-requests'] });
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not cancel request.', 'error'),
  });

  const rejectRequest = useMutation({
    mutationFn: ({ id, note }) => api.patch(`/documents/requests/${id}/reject`, { note }),
    onSuccess: () => {
      toast('Request rejected', 'warning');
      setRejecting(null);
      qc.invalidateQueries({ queryKey: ['document-requests'] });
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not reject request.', 'error'),
  });

  function canDeleteDoc(d) {
    return ADMIN_ROLES.includes(user?.role) || d.uploadedByRef?._id === user?.id;
  }

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Documents</div>
          <div className="pgs">Your personal documents and HR document requests</div>
        </div>
        {tab === 'mine' && hasEmployeeRecord && (
          <div className="ph-r">
            <button className="btn bs bsm" onClick={() => setRequestOpen(true)}><i className="fa-solid fa-file-circle-plus" /> Request Document</button>
            <button className="btn bp bsm" onClick={() => setUploadOpen(true)}><i className="fa-solid fa-upload" /> Upload Document</button>
          </div>
        )}
      </div>

      {!hasEmployeeRecord && (
        <div className="card" style={{ marginBottom: 13 }}>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>No employee record is linked to your account, so personal documents aren't available.</div>
        </div>
      )}

      <div className="tabs">
        <div className={`tab${tab === 'mine' ? ' on' : ''}`} onClick={() => setTab('mine')}>My Documents</div>
        {canApprove && <div className={`tab${tab === 'requests' ? ' on' : ''}`} onClick={() => setTab('requests')}>Requests Queue</div>}
      </div>

      {tab === 'mine' && (
        <>
          <div className="card" style={{ marginBottom: 13 }}>
            <div className="chd"><div className="cht"><i className="fa-solid fa-folder-open" /> Uploaded Documents</div></div>
            <div className="tbl">
              <table>
                <thead>
                  <tr><th>Name</th><th>Type</th><th>Uploaded By</th><th>Date</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {myDocs?.map((d) => (
                    <tr key={d._id}>
                      <td style={{ fontWeight: 600 }}><i className="fa-solid fa-file" /> {d.name}</td>
                      <td><span className="badge b-bl">{DOC_CATEGORY_LABEL[d.category] || d.category}</span></td>
                      <td style={{ color: 'var(--t3)' }}>{d.uploadedByRef?.name || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--t3)' }}>{formatDate(d.createdAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn bs bxs bico" onClick={() => loadPreview.mutate(d._id)} disabled={loadPreview.isPending} title="Preview">
                            <i className="fa-solid fa-eye" />
                          </button>
                          <button className="btn bs bxs bico" onClick={() => download.mutate(d._id)} disabled={download.isPending} title="Download">
                            <i className="fa-solid fa-download" />
                          </button>
                          {canDeleteDoc(d) && (
                            <button className="btn bs bxs bico" onClick={() => setEditingDoc(d)} title="Edit / Replace">
                              <i className="fa-solid fa-pen" />
                            </button>
                          )}
                          {canDeleteDoc(d) && (
                            <button className="btn brd bxs bico" onClick={() => setDeletingDoc(d)} title="Remove">
                              <i className="fa-solid fa-trash" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {myDocs?.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--t3)', padding: 14 }}>No documents uploaded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="chd"><div className="cht"><i className="fa-solid fa-file-circle-check" /> My Document Requests</div></div>
            <div className="tbl">
              <table>
                <thead>
                  <tr><th>Type</th><th>Period</th><th>Note</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {myRequests?.map((r) => (
                    <tr key={r._id}>
                      <td>{REQUEST_TYPE_LABEL[r.type]}</td>
                      <td style={{ color: 'var(--t3)' }}>{r.period || '—'}</td>
                      <td style={{ color: 'var(--t3)' }}>
                        {r.note || '—'}
                        {r.status === 'rejected' && r.decisionNote && (
                          <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 3 }}>Reason: {r.decisionNote}</div>
                        )}
                      </td>
                      <td><span className={`badge ${REQUEST_STATUS_BADGE[r.status]}`}>{r.status}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {r.status === 'fulfilled' && r.documentRef && (
                            <>
                              <button className="btn bs bxs bico" onClick={() => loadPreview.mutate(r.documentRef._id)} disabled={loadPreview.isPending} title="Preview">
                                <i className="fa-solid fa-eye" />
                              </button>
                              <button className="btn bgn bxs" onClick={() => download.mutate(r.documentRef._id)} disabled={download.isPending}>
                                <i className="fa-solid fa-download" /> Download
                              </button>
                            </>
                          )}
                          {r.status === 'pending' && (
                            <button className="btn brd bxs bico" onClick={() => cancelRequest.mutate(r._id)} disabled={cancelRequest.isPending}>
                              <i className="fa-solid fa-ban" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {myRequests?.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--t3)', padding: 14 }}>No document requests yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'requests' && canApprove && (
        <div className="card">
          <div className="chd"><div className="cht"><i className="fa-solid fa-inbox" /> Pending Document Requests</div></div>
          <div className="tbl">
            <table>
              <thead>
                <tr><th>Employee</th><th>Type</th><th>Period</th><th>Note</th><th>Requested</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {pendingRequests?.map((r) => (
                  <tr key={r._id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Avatar name={r.employeeRef?.name} index={r.employeeRef?.avatarIndex} size={22} fontSize={7} />
                        {r.employeeRef?.name}
                      </div>
                    </td>
                    <td>{REQUEST_TYPE_LABEL[r.type]}</td>
                    <td style={{ color: 'var(--t3)' }}>{r.period || '—'}</td>
                    <td style={{ color: 'var(--t3)' }}>{r.note || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--t3)' }}>{formatDate(r.createdAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button className="btn bgn bxs" onClick={() => setFulfilling(r)}>
                          <i className="fa-solid fa-paper-plane" /> Deliver
                        </button>
                        <button className="btn brd bxs" onClick={() => setRejecting(r._id)} disabled={rejectRequest.isPending}>
                          <i className="fa-solid fa-xmark" /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pendingRequests?.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--t3)', padding: 14 }}>No pending requests.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {uploadOpen && <DocumentUploadModal employeeRef={user.employeeRef} onClose={() => setUploadOpen(false)} />}
      {editingDoc && (
        <DocumentUploadModal employeeRef={user.employeeRef} document={editingDoc} onClose={() => setEditingDoc(null)} />
      )}
      {requestOpen && <DocumentRequestModal onClose={() => setRequestOpen(false)} />}
      {fulfilling && <DocumentFulfillModal request={fulfilling} onClose={() => setFulfilling(null)} />}
      {previewDoc && <DocumentPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
      {rejecting && (
        <PromptModal
          title="Reject Document Request"
          label="Reason (optional)"
          placeholder="e.g. Please resubmit after payroll closes this month"
          submitLabel="Reject"
          pending={rejectRequest.isPending}
          onSubmit={(note) => rejectRequest.mutate({ id: rejecting, note })}
          onClose={() => setRejecting(null)}
        />
      )}
      {deletingDoc && (
        <ConfirmModal
          title="Delete Document"
          message={`Permanently delete "${deletingDoc.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          pending={deleteDoc.isPending}
          onConfirm={() => deleteDoc.mutate(deletingDoc._id)}
          onClose={() => setDeletingDoc(null)}
        />
      )}
    </div>
  );
}
