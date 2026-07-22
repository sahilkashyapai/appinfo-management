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
