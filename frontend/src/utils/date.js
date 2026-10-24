/**
 * Strictly format any date, ISO timestamp, or date string into DD/MM/YYYY format.
 * Examples:
 *   "2026-10-24" -> "24/10/2026"
 *   "2026-10-24T15:49:06.553Z" -> "24/10/2026"
 *   Date object -> "24/10/2026"
 */
export function formatDate(val) {
  if (!val) return '—';
  if (typeof val === 'string') {
    const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, d] = match;
      return `${d}/${m}/${y}`;
    }
  }
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Format a timestamp into DD/MM/YYYY hh:mm:ss format.
 */
export function formatDateTime(val) {
  if (!val) return '—';
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return '—';
  const dateStr = formatDate(d);
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${dateStr} ${timeStr}`;
}
