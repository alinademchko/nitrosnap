export const API_BASE =
  process.env.REACT_APP_API_BASE || '/api';

export async function saveReport(payload) {
  const res = await fetch(`${API_BASE}/save_report.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Save failed');
  return res.json();
}

export async function getReportById(id) {
  const res = await fetch(`${API_BASE}/get_report.php?id=${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('Fetch failed');
  return res.json();
}
