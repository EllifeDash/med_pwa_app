// ════════════════════════════════════════
// utils.js — Shared Utility Functions
// CHANGED: Added exportCSV() for bulk
//          visit export to spreadsheet.
// ════════════════════════════════════════

function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${+day} ${mo[+m-1]} ${y}`;
}

function fmtFileSize(b) {
  if (b < 1024)         return b + 'B';
  if (b < 1024 * 1024)  return (b / 1024).toFixed(1) + 'KB';
  return (b / 1024 / 1024).toFixed(1) + 'MB';
}

let _toastTimer;
function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent      = msg;
  el.style.background = type === 'danger' ? '#ef4444' : '#1a2332';
  el.style.opacity    = 1;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.style.opacity = 0, 2600);
}

/**
 * ADDED: Export all visits to a CSV file.
 * One row per service line within a visit so every
 * service amount is individually visible in a spreadsheet.
 * Triggered from the Settings page "Export Data" button.
 */
async function exportCSV() {
  const allVis = await gVis();
  const allPts = await gPts();

  if (!allVis.length) {
    toast('No visits to export', 'danger');
    return;
  }

  // Build a lookup for patient details
  const ptMap = {};
  allPts.forEach(p => { ptMap[p.id] = p; });

  // CSV header
  const cols = [
    'Date', 'Time', 'Receipt#',
    'Patient Name', 'Age', 'Gender', 'Phone',
    'Service', 'Service Price (Rs.)',
    'Subtotal (Rs.)', 'Discount (Rs.)', 'Net (Rs.)',
    'Notes'
  ];

  const escape = v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = [cols.map(escape).join(',')];

  // Sort visits newest first
  const sorted = [...allVis].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  sorted.forEach(v => {
    const p   = ptMap[v.patientId] || {};
    const rno = v.id.replace('v_', '').slice(-6);
    const svcs = v.services || [];

    if (!svcs.length) {
      // Visit with no services — still export one row
      rows.push([
        v.date, v.time || '', rno,
        v.patientName || p.name || '',
        p.age || '', p.gender || '', p.phone || '',
        '', '',
        v.subtotal || 0, v.discount || 0, v.net || 0,
        v.notes || ''
      ].map(escape).join(','));
      return;
    }

    svcs.forEach((svc, i) => {
      rows.push([
        i === 0 ? v.date       : '',
        i === 0 ? (v.time||'') : '',
        i === 0 ? rno          : '',
        i === 0 ? (v.patientName || p.name || '') : '',
        i === 0 ? (p.age    || '') : '',
        i === 0 ? (p.gender || '') : '',
        i === 0 ? (p.phone  || '') : '',
        svc.name,
        svc.price || 0,
        i === 0 ? (v.subtotal || 0) : '',
        i === 0 ? (v.discount || 0) : '',
        i === 0 ? (v.net      || 0) : '',
        i === 0 ? (v.notes    || '') : '',
      ].map(escape).join(','));
    });
  });

  const csv  = '\uFEFF' + rows.join('\r\n'); // BOM for Excel UTF-8
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href     = url;
  a.download = `MediAssist_Visits_${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`Exported ${sorted.length} visits to CSV`);
}
