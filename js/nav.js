// ════════════════════════════════════════
// nav.js — Page Navigation / Routing
// ════════════════════════════════════════

const pages = ['dashboard', 'patients', 'bookings', 'addVisit', 'history', 'settings', 'report'];

/**
 * Switch to a named page. Updates nav button active states
 * and triggers the appropriate render function.
 * @param {string} pg  - Page name (must exist in `pages` array)
 * @param {Element|null} btn - The nav button that was clicked (for .on class)
 */
function go(pg, btn) {
  pages.forEach(p => {
    const el = document.getElementById('pg-' + p);
    if (el) el.style.display = p === pg ? '' : 'none';
  });

  document.querySelectorAll('.nbtn[data-pg],.bb[data-pg]').forEach(b =>
    b.classList.toggle('on', b.dataset.pg === pg)
  );

  if (pg === 'dashboard') renderDash();
  if (pg === 'patients')  renderPatients();
  if (pg === 'bookings')  renderBookings();
  if (pg === 'addVisit')  renderSvcTags();
  if (pg === 'settings')  renderSettings();
  if (pg === 'report')    initReport();
}
