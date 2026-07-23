import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import OrgChartCanvas from '../components/OrgChartCanvas';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { buildOrgTree, collectSubtreeIds, findOrgNode } from '../utils/orgChart';

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2;

export default function OrgChartPage() {
  const { user } = useAuth();
  const canManage = ['superadmin', 'hr'].includes(user?.role);
  const toast = useToast();
  const qc = useQueryClient();
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const chartRef = useRef(null);

  function zoomBy(delta) {
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z + delta).toFixed(2))));
  }

  useEffect(() => {
    function onChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      chartRef.current?.requestFullscreen();
    }
  }

  // Figma-style click-and-drag panning across the chart canvas (any direction),
  // without hijacking clicks/drags that start on a card (those open the employee
  // drawer or reassign a manager — see OrgChartNode).
  const panRef = useRef(null);
  const panStateRef = useRef(null);
  const [isPanning, setIsPanning] = useState(false);

  function startPan(x, y) {
    const el = panRef.current;
    if (!el) return;
    panStateRef.current = { x, y, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
    setIsPanning(true);
  }
  function movePan(x, y) {
    const el = panRef.current;
    if (!el || !panStateRef.current) return;
    el.scrollLeft = panStateRef.current.scrollLeft - (x - panStateRef.current.x);
    el.scrollTop = panStateRef.current.scrollTop - (y - panStateRef.current.y);
  }
  function endPan() {
    panStateRef.current = null;
    setIsPanning(false);
  }

  useEffect(() => {
    if (!isPanning) return;
    const onMove = (e) => movePan(e.clientX, e.clientY);
    const onUp = () => endPan();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isPanning]);

  // Wheel-to-zoom, centered on the cursor: attached as a native (non-passive)
  // listener because React 17+ marks its own onWheel as passive, which would
  // silently ignore preventDefault and let the page/container scroll instead.
  useEffect(() => {
    const el = panRef.current;
    if (!el) return;
    function onWheel(e) {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const offsetX = e.clientX - rect.left + el.scrollLeft;
      const offsetY = e.clientY - rect.top + el.scrollTop;
      const ratioX = offsetX / el.scrollWidth;
      const ratioY = offsetY / el.scrollHeight;

      setZoom((z) => {
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z - Math.sign(e.deltaY) * 0.1).toFixed(2)));
        if (nextZoom === z) return z;
        requestAnimationFrame(() => {
          el.scrollLeft = ratioX * el.scrollWidth - (e.clientX - rect.left);
          el.scrollTop = ratioY * el.scrollHeight - (e.clientY - rect.top);
        });
        return nextZoom;
      });
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function onCanvasMouseDown(e) {
    if (e.button !== 0 || e.target.closest('.org-card')) return;
    startPan(e.clientX, e.clientY);
  }
  function onCanvasTouchStart(e) {
    if (e.target.closest('.org-card')) return;
    const t = e.touches[0];
    startPan(t.clientX, t.clientY);
  }
  function onCanvasTouchMove(e) {
    if (!panStateRef.current) return;
    const t = e.touches[0];
    movePan(t.clientX, t.clientY);
  }

  const { data } = useQuery({
    queryKey: ['org-chart'],
    queryFn: () => api.get('/employees/org-chart').then((r) => r.data.items),
  });

  const tree = useMemo(() => buildOrgTree(data || []), [data]);
  const draggingNode = useMemo(() => (draggingId ? findOrgNode(tree, draggingId) : null), [tree, draggingId]);
  const invalidDropIds = useMemo(() => (draggingNode ? collectSubtreeIds(draggingNode) : new Set()), [draggingNode]);

  const reparent = useMutation({
    mutationFn: ({ id, managerRef }) => api.put(`/employees/${id}`, { managerRef }),
    onSuccess: () => {
      toast('Reporting line updated ✓', 'success');
      qc.invalidateQueries({ queryKey: ['org-chart'] });
    },
    onError: (err) => toast(err.response?.data?.message || 'Could not update reporting line.', 'error'),
  });

  function onReparent(draggedId, newManagerId) {
    if (!draggedId || draggedId === newManagerId) return;
    if (newManagerId && invalidDropIds.has(newManagerId)) {
      toast('Can’t move someone under their own report.', 'error');
      return;
    }
    reparent.mutate({ id: draggedId, managerRef: newManagerId });
  }

  // Reassigning a manager by dragging a card, driven by Pointer Events (fires
  // uniformly for mouse/touch/pen) instead of HTML5 drag-and-drop, which has no
  // touch equivalent — see OrgChartNode's onPointerDown, which just sets
  // draggingId; everything else (hit-testing, hover highlight, committing the
  // move) happens here. A ref keeps onReparent/invalidDropIds fresh inside the
  // window listener without needing to re-attach it every render.
  const reparentStateRef = useRef({ onReparent, invalidDropIds });
  reparentStateRef.current = { onReparent, invalidDropIds };

  function hitTest(x, y) {
    const el = document.elementFromPoint(x, y);
    const card = el?.closest?.('.org-card');
    if (card) return card.dataset.nodeId;
    if (el?.closest?.('.org-droproot')) return 'root';
    return null;
  }

  useEffect(() => {
    if (!draggingId) return;
    function onMove(e) {
      const targetId = hitTest(e.clientX, e.clientY);
      const { invalidDropIds: invalid } = reparentStateRef.current;
      const valid = targetId && targetId !== draggingId && !(targetId !== 'root' && invalid.has(targetId));
      setDragOverId(valid ? targetId : null);
    }
    function onUp(e) {
      const targetId = hitTest(e.clientX, e.clientY);
      if (targetId && targetId !== draggingId) {
        reparentStateRef.current.onReparent(draggingId, targetId === 'root' ? null : targetId);
      }
      setDraggingId(null);
      setDragOverId(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [draggingId]);

  const dragProps = {
    canManage,
    draggingId,
    setDraggingId,
    dragOverId,
    invalidDropIds,
  };

  return (
    <div className="page on">
      <div className="ph">
        <div className="ph-l">
          <div className="pgt">Organizational Chart</div>
          <div className="pgs">
            {data?.length || 0} employees
            {canManage && ' · drag a card onto another to change who they report to'}
          </div>
        </div>
        <div className="ph-r">
          <button className="btn bs bxs bico" title="Zoom out" onClick={() => zoomBy(-0.1)} disabled={zoom <= MIN_ZOOM}>
            <i className="fa-solid fa-magnifying-glass-minus" />
          </button>
          <span style={{ fontSize: 11.5, color: 'var(--t3)', minWidth: 38, textAlign: 'center', fontWeight: 700 }}>{Math.round(zoom * 100)}%</span>
          <button className="btn bs bxs bico" title="Zoom in" onClick={() => zoomBy(0.1)} disabled={zoom >= MAX_ZOOM}>
            <i className="fa-solid fa-magnifying-glass-plus" />
          </button>
          <button className="btn bs bxs" title="Reset zoom" onClick={() => setZoom(1)}>Reset</button>
          <button className="btn bs bsm" onClick={toggleFullscreen}>
            <i className={`fa-solid ${isFullscreen ? 'fa-compress' : 'fa-expand'}`} /> {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </div>
      {canManage && draggingNode && draggingNode.managerRef && (
        <div className={`org-droproot${dragOverId === 'root' ? ' drop-target' : ''}`}>
          <i className="fa-solid fa-arrow-turn-up" /> Drop here to remove {draggingNode.name.split(' ')[0]}'s manager (make top-level)
        </div>
      )}
      <div ref={chartRef} className="card org-chart-card">
        <div
          ref={panRef}
          className={`org-root${isPanning ? ' panning' : ''}`}
          onMouseDown={onCanvasMouseDown}
          onTouchStart={onCanvasTouchStart}
          onTouchMove={onCanvasTouchMove}
          onTouchEnd={endPan}
        >
          <OrgChartCanvas tree={tree} zoom={zoom} {...dragProps} />
        </div>
      </div>
    </div>
  );
}
