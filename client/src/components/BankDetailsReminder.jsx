import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { BANK_DETAILS_QUERY_KEY } from './BankDetailsCard';

// Post-login caution popup: shown to employees until they've submitted their
// own PAN/bank details (locked) or have a change request pending. "Remind me
// later" hides it for this browser session only.

const SNOOZE_KEY = 'bank-reminder-snoozed';

function isSnoozed(userId) {
  try {
    return sessionStorage.getItem(SNOOZE_KEY) === String(userId);
  } catch {
    return false;
  }
}

function snooze(userId) {
  try {
    sessionStorage.setItem(SNOOZE_KEY, String(userId));
  } catch { /* storage unavailable: just hide for now */ }
}

export default function BankDetailsReminder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [hidden, setHidden] = useState(() => isSnoozed(user?.id));
  const isEmployee = !!user?.employeeRef;

  const { data } = useQuery({
    queryKey: BANK_DETAILS_QUERY_KEY,
    queryFn: () => api.get('/profile/bank-details').then((r) => r.data),
    enabled: isEmployee && !hidden,
  });

  const show = isEmployee && !hidden && pathname !== '/profile' && data && !data.locked && !data.pendingRequest;
  if (!show) return null;

  function later() {
    snooze(user?.id);
    setHidden(true);
  }

  return (
    <div style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 960, alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" role="alertdialog" aria-labelledby="bank-reminder-title" style={{ width: 'min(420px, 92vw)', textAlign: 'center', padding: '24px 22px 20px' }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            margin: '0 auto 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(230, 126, 34, .14)',
            color: 'var(--orange)',
            fontSize: 21,
          }}
        >
          <i className="fa-solid fa-triangle-exclamation" />
        </div>
        <div id="bank-reminder-title" style={{ fontSize: 15, fontWeight: 900, color: 'var(--t1)', marginBottom: 6 }}>Please submit your bank details</div>
        <div style={{ fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.6, marginBottom: 16 }}>
          We need your PAN and salary bank account to process your salary. Please add them in your profile - it only takes a minute.
        </div>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn bs bsm" onClick={later}>Remind me later</button>
          <button className="btn bp bsm" autoFocus onClick={() => navigate('/profile#bank')}>
            <i className="fa-solid fa-building-columns" /> Add bank details
          </button>
        </div>
      </div>
    </div>
  );
}
