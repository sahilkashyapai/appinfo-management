import { useState } from 'react';
import Avatar from './Avatar';
import { useDrawers } from '../context/DrawerContext';

// Colored underline per role tier — same idea as the classic org-chart mockups
// (a colored bar under each title), but drawn from our own theme palette.
const ROLE_COLOR = {
  CEO: 'var(--gold)',
  CTO: 'var(--gold)',
  CFO: 'var(--gold)',
  Manager: 'var(--purple)',
  'Team Lead': 'var(--accent)',
  'Senior Employee': 'var(--green)',
  Employee: 'var(--sky)',
  Intern: 'var(--orange)',
  HR: 'var(--purple)',
};

export default function OrgChartNode({ node, canManage, draggingId, setDraggingId, dragOverId, invalidDropIds, registerNode }) {
  const { openEmployee } = useDrawers();
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children?.length > 0;
  const roleColor = ROLE_COLOR[node.roleLabel] || 'var(--bd2)';

  const isDragging = draggingId === node._id;
  const isInvalidTarget = draggingId && invalidDropIds?.has(node._id);
  const isDropTarget = dragOverId === node._id && draggingId && !isInvalidTarget && !isDragging;

  // Pointer Events (not HTML5 drag-and-drop) so reassigning a manager works the
  // same way with mouse, touch, or pen — see OrgChartPage for the pointermove/up
  // tracking and hit-testing this kicks off.
  const pointerHandlers = canManage
    ? {
        onPointerDown: (e) => {
          if (e.button !== undefined && e.button !== 0) return;
          setDraggingId(node._id);
        },
      }
    : {};

  return (
    <div className="org-node">
      <div
        ref={(el) => registerNode?.(node._id, el)}
        data-node-id={node._id}
        className={`org-card${isDragging ? ' dragging' : ''}${isDropTarget ? ' drop-target' : ''}${isInvalidTarget ? ' drop-invalid' : ''}`}
        onClick={() => openEmployee(node._id)}
        {...pointerHandlers}
      >
        <Avatar name={node.name} index={node.avatarIndex} src={node.avatarUrl} size={32} fontSize={11} />
        <div className="org-name">{node.name}</div>
        <div className="org-role">{node.desig}{node.dept ? ` · ${node.dept}` : ''}</div>
        <div style={{ width: 36, height: 2, borderRadius: 2, background: roleColor, marginTop: 2 }} />
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
            <OrgChartNode
              key={c._id}
              node={c}
              canManage={canManage}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
              dragOverId={dragOverId}
              invalidDropIds={invalidDropIds}
              registerNode={registerNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}
