// ════════════════════════════════════════
// ui.js — Modal & Generic UI Helpers
// ════════════════════════════════════════

/**
 * Open a bottom-sheet modal by ID.
 */
function openMo(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

/**
 * Close a bottom-sheet modal by ID.
 */
function closeMo(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

// Close any modal when clicking the backdrop
document.querySelectorAll('.mo').forEach(m =>
  m.addEventListener('click', e => { if (e.target === m) closeMo(m.id); })
);
