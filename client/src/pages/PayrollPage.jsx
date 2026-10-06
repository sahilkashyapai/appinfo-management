import { useState } from 'react';
import SlipsTab from '../components/payroll/SlipsTab';
import StructuresTab from '../components/payroll/StructuresTab';
import PayrollSettingsTab from '../components/payroll/PayrollSettingsTab';

const TABS = [
  { key: 'slips', label: 'Salary Slips', sub: 'Generate, review and publish monthly salary slips' },
  { key: 'structures', label: 'Salary Structures', sub: "Each employee's monthly earnings, fixed deductions and bank details" },
  { key: 'settings', label: 'Payroll Settings', sub: 'Offices, statutory deductions, loss of pay and slip defaults' },
];

export default function PayrollPage() {
  const [tab, setTab] = useState('slips');
  const current = TABS.find((t) => t.key === tab);

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
          <div key={t.key} className={`tab${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}>{t.label}</div>
        ))}
      </div>
      {tab === 'slips' && <SlipsTab onGoToStructures={() => setTab('structures')} />}
      {tab === 'structures' && <StructuresTab />}
      {tab === 'settings' && <PayrollSettingsTab />}
    </div>
  );
}
