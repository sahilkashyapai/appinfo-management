import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import OrgChartNode from './OrgChartNode';

// Position of `el`, relative to `ancestor`, in *layout* pixels (unaffected by
// any CSS `zoom`/`transform` applied between them) — walks the offsetParent
// chain rather than using getBoundingClientRect, which reports post-zoom
// screen pixels and would double-scale once fed back into a zoomed SVG.
function rectRelativeTo(el, ancestor) {
  let left = 0;
  let top = 0;
  let node = el;
  while (node && node !== ancestor) {
    left += node.offsetLeft;
    top += node.offsetTop;
    node = node.offsetParent;
  }
  return { left, top, width: el.offsetWidth, height: el.offsetHeight };
}

// Draws every parent -> children connector by measuring actual rendered card
// positions after layout, instead of hard-coded CSS math — the old fixed
// left/right: 140px/2 trick assumed every child was exactly one card wide,
// which broke as soon as a child's own subtree was wider than its own card.
export default function OrgChartCanvas({ tree, zoom, ...dragProps }) {
  const canvasRef = useRef(null);
  const nodeEls = useRef(new Map());
  const [paths, setPaths] = useState([]);

  const registerNode = useCallback((id, el) => {
    if (el) nodeEls.current.set(id, el);
    else nodeEls.current.delete(id);
  }, []);

  const recompute = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const next = [];

    function walk(node) {
      const children = node.children || [];
      const parentEl = nodeEls.current.get(node._id);
      if (parentEl && children.length) {
        const pRect = rectRelativeTo(parentEl, canvas);
        const px = pRect.left + pRect.width / 2;
        const py = pRect.top + pRect.height;

        const childXs = [];
        const stems = [];
        children.forEach((child) => {
          const childEl = nodeEls.current.get(child._id);
          if (!childEl) return;
          const cRect = rectRelativeTo(childEl, canvas);
          const cx = cRect.left + cRect.width / 2;
          childXs.push(cx);
          stems.push({ x: cx, y: cRect.top });
        });

        if (stems.length) {
          const bendY = py + 18;
          next.push({ id: node._id, px, py, bendY, minX: Math.min(...childXs), maxX: Math.max(...childXs), stems });
        }
      }
      children.forEach(walk);
    }

    tree.forEach(walk);
    setPaths(next);
  }, [tree]);

  useLayoutEffect(() => {
    recompute();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(canvas);
    window.addEventListener('resize', recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [recompute]);

  return (
    <div ref={canvasRef} className="org-canvas" style={{ zoom }}>
      <svg className="org-lines">
        {paths.map((p) => (
          <g key={p.id}>
            <line x1={p.px} y1={p.py} x2={p.px} y2={p.bendY} />
            {p.stems.length > 1 && <line x1={p.minX} y1={p.bendY} x2={p.maxX} y2={p.bendY} />}
            {p.stems.map((s, i) => (
              <line key={i} x1={s.x} y1={p.bendY} x2={s.x} y2={s.y} />
            ))}
          </g>
        ))}
      </svg>
      <div className="org-tree">
        {tree.map((root) => (
          <OrgChartNode key={root._id} node={root} registerNode={registerNode} {...dragProps} />
        ))}
        {tree.length === 0 && <div style={{ color: 'var(--t3)', fontSize: 12, padding: 14 }}>No employees to display.</div>}
      </div>
    </div>
  );
}
