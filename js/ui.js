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

/**
 * Show a confirm dialog. Returns true/false.
 * Replaces native confirm() with a styled modal.
 */
function showConfirm(msg) {
  return new Promise(resolve => {
    const el = document.getElementById('confirmModal');
    if (!el) { resolve(confirm(msg)); return; }
    el.querySelector('.cm-msg').textContent = msg;
    const yes = el.querySelector('.cm-yes');
    const no  = el.querySelector('.cm-no');
    const cleanup = () => { yes.onclick = null; no.onclick = null; };
    yes.onclick = () => { closeMo('confirmModal'); cleanup(); resolve(true); };
    no.onclick  = () => { closeMo('confirmModal'); cleanup(); resolve(false); };
    openMo('confirmModal');
  });
}
