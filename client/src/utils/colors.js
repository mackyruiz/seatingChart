// Deterministic color per department name, so the same department always
// gets the same color across renders/sessions without a hardcoded palette
// (new departments "just work" as desk data changes).
export function colorForDepartment(name) {
  if (!name) return '#94a3b8'; // slate-400 for "no department"
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 55%)`;
}

export const STATUS_COLORS = {
  active: '#16a34a',
  reserved: '#eab308',
  unavailable: '#94a3b8',
};
