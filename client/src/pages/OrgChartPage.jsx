import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import OrgChartNode from '../components/OrgChartNode';
import { buildOrgTree } from '../utils/orgChart';

export default function OrgChartPage() {
  const { data } = useQuery({
    queryKey: ['org-chart'],
    queryFn: () => api.get('/employees/org-chart').then((r) => r.data.items),
  });

  const tree = useMemo(() => buildOrgTree(data || []), [data]);

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Org Chart</div>
          <div className="pgs">{data?.length || 0} employees</div>
        </div>
      </div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <div className="org-root">
          {tree.map((root) => (
            <OrgChartNode key={root._id} node={root} />
          ))}
          {tree.length === 0 && <div style={{ color: 'var(--t3)', fontSize: 12, padding: 14 }}>No employees to display.</div>}
        </div>
      </div>
    </div>
  );
}
