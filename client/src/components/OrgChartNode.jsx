import { useState } from 'react';
import Avatar from './Avatar';
import { useDrawers } from '../context/DrawerContext';

export default function OrgChartNode({ node }) {
  const { openEmployee } = useDrawers();
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children?.length > 0;

  return (
    <div className="org-node">
      <div className="org-card" onClick={() => openEmployee(node._id)}>
        <Avatar name={node.name} index={node.avatarIndex} src={node.avatarUrl} size={32} fontSize={11} />
        <div className="org-name">{node.name}</div>
        <div className="org-role">{node.desig}{node.dept ? ` · ${node.dept}` : ''}</div>
        {hasChildren && (
          <button
            className="org-toggle"
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((c) => !c);
            }}
          >
            <i className={`fa-solid fa-chevron-${collapsed ? 'down' : 'up'}`} />
          </button>
        )}
      </div>
      {hasChildren && !collapsed && (
        <div className="org-children">
          {node.children.map((c) => (
            <OrgChartNode key={c._id} node={c} />
          ))}
        </div>
      )}
    </div>
  );
}
