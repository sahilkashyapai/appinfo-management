// Groups a flat employee list into a parent -> children tree keyed by managerRef.
// Roots are employees with no manager, or whose manager isn't in the list.
export function buildOrgTree(items) {
  const byId = new Map(items.map((e) => [e._id, { ...e, children: [] }]));
  const roots = [];
  for (const e of byId.values()) {
    if (e.managerRef && byId.has(e.managerRef)) {
      byId.get(e.managerRef).children.push(e);
    } else {
      roots.push(e);
    }
  }
  return roots;
}

// Finds a node anywhere in a built tree by id.
export function findOrgNode(tree, id) {
  for (const node of tree) {
    if (node._id === id) return node;
    const found = findOrgNode(node.children, id);
    if (found) return found;
  }
  return null;
}

// A node's own id plus every descendant's id — dropping a node onto any of
// these would create a cycle (you can't report to your own report).
export function collectSubtreeIds(node) {
  const ids = new Set([node._id]);
  for (const child of node.children) {
    for (const id of collectSubtreeIds(child)) ids.add(id);
  }
  return ids;
}
