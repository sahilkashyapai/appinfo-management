import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import Avatar from '../Avatar';
import ConfirmModal from '../ConfirmModal';
import SlipEditorModal from './SlipEditorModal';
import { useToast } from '../../context/ToastContext';
import { ModalShell, currentPeriod, errMessage, formatMoney, openSlipPdf, periodLabel } from './payrollUtils';

export default function SlipsTab({ onGoToStructures }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [period, setPeriod] = useState(currentPeriod());
  const [showGenerate, setShowGenerate] = useState(false);
  const [refreshDrafts, setRefreshDrafts] = useState(false);
  const [skipped, setSkipped] = useState(null);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null); // { type, slip? }

  const { data, isLoading } = useQuery({
    queryKey: ['payroll-slips', period],
    queryFn: () => api.get('/payroll/slips', { params: { period } }).then((r) => r.data.items),
    enabled: /^\d{4}-\d{2}$/.test(period),
  });
  const items = data || [];
  const drafts = items.filter((s) => s.status === 'draft');
  const published = items.filter((s) => s.status === 'published');
  const netByCurrency = items.reduce((acc, s) => {
    acc[s.currency] = (acc[s.currency] || 0) + (Number(s.netPay) || 0);
    return acc;
  }, {});

  const invalidate = () => qc.invalidateQueries({ queryKey: ['payroll-slips', period] });
  const closeConfirm = () => setConfirm(null);

  const generate = useMutation({
    mutationFn: () => api.post('/payroll/slips/generate', { period, refreshDrafts: drafts.length > 0 && refreshDrafts }).then((r) => r.data),
    onSuccess: (res) => {
      toast(`${res.created} created, ${res.refreshed} refreshed`, 'success');
      setShowGenerate(false);
      setRefreshDrafts(false);
      setSkipped(res.skipped?.length ? res.skipped : null);
      invalidate();
    },
    onError: (err) => toast(errMessage(err, 'Could not generate salary slips.'), 'error'),
  });

  const publishAll = useMutation({
    mutationFn: () => api.post('/payroll/slips/publish', { period }).then((r) => r.data),
    onSuccess: (res) => {
      if (res.failed?.length) {
        toast(`${res.published} published, ${res.failed.length} failed: ${res.failed.map((f) => f.name).join(', ')}`, 'warning');
      } else {
        toast(`${res.published} slip${res.published === 1 ? '' : 's'} published`, 'success');
      }
      closeConfirm();
      invalidate();
    },
    onError: (err) => {
      closeConfirm();
      toast(errMessage(err, 'Could not publish slips.'), 'error');
    },
  });

  const slipAction = useMutation({
    mutationFn: ({ type, slip }) => {
      if (type === 'publish') return api.post(`/payroll/slips/${slip._id}/publish`);
      if (type === 'unpublish') return api.post(`/payroll/slips/${slip._id}/unpublish`);
      return api.delete(`/payroll/slips/${slip._id}`);
    },
    onSuccess: (_res, { type, slip }) => {
      const name = slip.employeeRef?.name || 'Slip';
      if (type === 'publish') toast(`${name}'s slip published`, 'success');
      else if (type === 'unpublish') toast(`${name}'s slip reverted to draft`, 'warning');
      else toast(`${name}'s draft deleted`, 'warning');
      closeConfirm();
      invalidate();
    },
    onError: (err) => {
      closeConfirm();
      toast(errMessage(err, 'Could not update the salary slip.'), 'error');
    },
  });

  return (
    <>
      <div className="card mb13">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <label className="fl">Month</label>
              <input className="fc" type="month" style={{ width: 170 }} value={period} onChange={(e) => { if (e.target.value) { setPeriod(e.target.value); setSkipped(null); } }} />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', paddingTop: 16 }}>
              <span className="badge b-or">{drafts.length} draft{drafts.length === 1 ? '' : 's'}</span>
              <span className="badge b-gr">{published.length} published</span>
              {Object.entries(netByCurrency).map(([cur, total]) => (
                <span key={cur} className="badge b-bl">Net {formatMoney(total, cur)}</span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7, paddingTop: 16 }}>
            {drafts.length > 0 && (
              <button className="btn bs bsm" onClick={() => setConfirm({ type: 'publishAll' })}><i className="fa-solid fa-paper-plane" /> Publish all drafts</button>
            )}
            <button className="btn bp bsm" onClick={() => setShowGenerate(true)}><i className="fa-solid fa-gears" /> Generate slips</button>
          </div>
        </div>
      </div>

      {skipped && (
        <div className="card mb13" style={{ borderColor: 'var(--orange)' }}>
          <div className="chd">
            <div className="cht"><i className="fa-solid fa-triangle-exclamation" style={{ color: 'var(--orange)' }} /> {skipped.length} employee{skipped.length === 1 ? '' : 's'} skipped</div>
            <button className="btn bs bxs bico" title="Dismiss" onClick={() => setSkipped(null)}><i className="fa-solid fa-xmark" /></button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            {skipped.map((s, i) => (
              <div key={s.employeeId || i}>
                <strong style={{ color: 'var(--t1)' }}>{s.name}</strong> <span style={{ color: 'var(--t3)' }}>- {s.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="tbl">
          <table>
            <thead>
              <tr><th>Employee</th><th>Department</th><th>Paid / LOP Days</th><th>Gross</th><th>Deductions</th><th>Net Pay</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {items.map((s) => {
                const isDraft = s.status === 'draft';
                const emp = s.employeeRef || {};
                return (
                  <tr key={s._id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <Avatar name={emp.name} index={emp.avatarIndex} size={26} fontSize={8} />
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--t1)' }}>{emp.name || '-'}</div>
                          {emp.empId && <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>{emp.empId}</div>}
                        </div>
                      </div>
                    </td>
                    <td>{emp.dept || <span style={{ color: 'var(--t3)' }}>-</span>}</td>
                    <td>{s.paidDays} <span style={{ color: 'var(--t3)' }}>/ {s.lopDays}</span></td>
                    <td>{formatMoney(s.grossEarnings, s.currency)}</td>
                    <td>{formatMoney(s.totalDeductions, s.currency)}</td>
                    <td style={{ fontWeight: 700, color: 'var(--t1)' }}>{formatMoney(s.netPay, s.currency)}</td>
                    <td><span className={`badge ${isDraft ? 'b-or' : 'b-gr'}`}>{isDraft ? 'Draft' : 'Published'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        <button className="btn bs bxs" onClick={() => setEditing(s._id)}>{isDraft ? 'Edit' : 'View'}</button>
                        <button className="btn bs bxs bico" title={isDraft ? 'Preview PDF' : 'PDF'} onClick={() => openSlipPdf(s._id, toast)}><i className="fa-solid fa-file-pdf" /></button>
                        {isDraft ? (
                          <>
                            <button className="btn bp bxs" onClick={() => setConfirm({ type: 'publish', slip: s })}>Publish</button>
                            <button className="btn brd bxs bico" title="Delete draft" onClick={() => setConfirm({ type: 'delete', slip: s })}><i className="fa-solid fa-trash" /></button>
                          </>
                        ) : (
                          <button className="btn bor bxs" onClick={() => setConfirm({ type: 'unpublish', slip: s })}>Revert to draft</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--t3)', padding: 18 }}>
                    No salary slips for {periodLabel(period)} yet.
                    <div style={{ fontSize: 11.5, marginTop: 4 }}>
                      Add salary structures for your employees first (
                      <a href="#" onClick={(e) => { e.preventDefault(); onGoToStructures(); }} style={{ color: 'var(--accent)' }}>Salary Structures</a>
                      ), then click <strong>Generate slips</strong>.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showGenerate && (
        <ModalShell width={420}>
          <div className="chd">
            <div className="cht"><i className="fa-solid fa-gears" /> Generate Slips</div>
            <button className="btn bs bxs bico" onClick={() => setShowGenerate(false)}><i className="fa-solid fa-xmark" /></button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.6, marginBottom: 12 }}>
            Creates draft salary slips for {periodLabel(period)} for every employee with a salary structure, using attendance for loss-of-pay days. Published slips are never changed.
          </div>
          {drafts.length > 0 && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--t1)', marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={refreshDrafts} onChange={(e) => setRefreshDrafts(e.target.checked)} style={{ marginTop: 2 }} />
              <span>
                <strong>Recalculate existing drafts</strong> ({drafts.length})
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                  Rebuilds salary-structure and PF/ESI/PT lines from current structures and settings. Lines you added to a draft are kept.
                </div>
              </span>
            </label>
          )}
          <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
            <button className="btn bs bsm" onClick={() => setShowGenerate(false)}>Cancel</button>
            <button className="btn bp bsm" disabled={generate.isPending} onClick={() => generate.mutate()}>
              <i className="fa-solid fa-check" /> {generate.isPending ? 'Generating…' : 'Generate'}
            </button>
          </div>
        </ModalShell>
      )}

      {confirm?.type === 'publishAll' && (
        <ConfirmModal
          title="Publish All Drafts"
          message={`Publishes ${drafts.length} draft slip${drafts.length === 1 ? '' : 's'} for ${periodLabel(period)}. Each employee will see their slip as a PDF in My Documents.`}
          confirmLabel="Publish all"
          pending={publishAll.isPending}
          onConfirm={() => publishAll.mutate()}
          onClose={closeConfirm}
        />
      )}
      {confirm?.type === 'publish' && (
        <ConfirmModal
          title="Publish Slip"
          message={`${confirm.slip.employeeRef?.name || 'The employee'} will see this slip as a PDF in My Documents.`}
          confirmLabel="Publish"
          pending={slipAction.isPending}
          onConfirm={() => slipAction.mutate(confirm)}
          onClose={closeConfirm}
        />
      )}
      {confirm?.type === 'delete' && (
        <ConfirmModal
          title="Delete Draft"
          message={`Deletes ${confirm.slip.employeeRef?.name || 'this employee'}'s draft slip for ${periodLabel(period)}, including any lines you added. You can generate it again later.`}
          confirmLabel="Delete"
          danger
          pending={slipAction.isPending}
          onConfirm={() => slipAction.mutate(confirm)}
          onClose={closeConfirm}
        />
      )}
      {confirm?.type === 'unpublish' && (
        <ConfirmModal
          title="Revert to Draft"
          message={`The slip PDF will be removed from ${confirm.slip.employeeRef?.name || 'the employee'}'s documents and the slip becomes an editable draft again.`}
          confirmLabel="Revert to draft"
          pending={slipAction.isPending}
          onConfirm={() => slipAction.mutate(confirm)}
          onClose={closeConfirm}
        />
      )}

      {editing && <SlipEditorModal slipId={editing} period={period} onClose={() => setEditing(null)} />}
    </>
  );
}
