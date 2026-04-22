// ════════════════════════════════════════
// utils.js — Shared Utility Functions
// ════════════════════════════════════════

/**
 * Format an ISO date string "YYYY-MM-DD" → "1 Jan 2024"
 */
function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${+day} ${mo[+m-1]} ${y}`;
}

/**
 * Format bytes into human-readable size: B / KB / MB
 */
function fmtFileSize(b) {
  if (b < 1024)           return b + 'B';
  if (b < 1024 * 1024)    return (b / 1024).toFixed(1) + 'KB';
  return (b / 1024 / 1024).toFixed(1) + 'MB';
}

/**
 * Show a brief toast notification at the bottom of the screen.
 * @param {string} msg   - Message text
 * @param {string} type  - 'ok' (dark) | 'danger' (red)
 */
let _toastTimer;
function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent       = msg;
  el.style.background  = type === 'danger' ? '#ef4444' : '#1a2332';
  el.style.opacity     = 1;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.style.opacity = 0, 2600);
}
