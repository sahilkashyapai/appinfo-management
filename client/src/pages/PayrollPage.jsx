import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import SlipsTab from '../components/payroll/SlipsTab';
import StructuresTab from '../components/payroll/StructuresTab';
import PayrollSettingsTab from '../components/payroll/PayrollSettingsTab';
import QueriesTab from '../components/payroll/QueriesTab';
import BankRequestsTab from '../components/payroll/BankRequestsTab';

const TABS = [
  { key: 'slips', label: 'Salary Slips', sub: 'Generate, review and publish monthly salary slips' },
  { key: 'structures', label: 'Salary Structures', sub: "Each employee's monthly earnings, fixed deductions and bank details" },
  { key: 'queries', label: 'Queries', sub: "Employees' questions about their salary slips" },
  { key: 'bank', label: 'Bank Requests', sub: "Employees' requests to change their locked bank and PAN details" },
  { key: 'settings', label: 'Payroll Settings', sub: 'Offices, statutory deductions, loss of pay and slip defaults' },
];

export default function PayrollPage() {
  const [searchParams] = useSearchParams();
  // Notifications link to /payroll?tab=queries and /payroll?tab=bank.
  const [tab, setTab] = useState(() => (TABS.some((t) => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'slips'));
  const current = TABS.find((t) => t.key === tab);
  const { data: openQueries = [] } = useQuery({
    queryKey: ['salary-queries', 'open'],
    queryFn: () => api.get('/salary-queries', { params: { status: 'open' } }).then((r) => r.data.items),
  });
  const { data: pendingBank = [] } = useQuery({
    queryKey: ['bank-detail-requests', 'pending'],
    queryFn: () => api.get('/bank-detail-requests', { params: { status: 'pending' } }).then((r) => r.data.items),
  });

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Payroll</div>
          <div className="pgs">{current.sub}</div>
        </div>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <div key={t.key} className={`tab${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === 'queries' && openQueries.length > 0 && <span className="nb" style={{ marginLeft: 6 }}>{openQueries.length}</span>}
            {t.key === 'bank' && pendingBank.length > 0 && <span className="nb" style={{ marginLeft: 6 }}>{pendingBank.length}</span>}
          </div>
        ))}
      </div>
      {tab === 'slips' && <SlipsTab onGoToStructures={() => setTab('structures')} />}
      {tab === 'structures' && <StructuresTab />}
      {tab === 'queries' && <QueriesTab />}
      {tab === 'bank' && <BankRequestsTab />}
      {tab === 'settings' && <PayrollSettingsTab />}
    </div>
  );
}
