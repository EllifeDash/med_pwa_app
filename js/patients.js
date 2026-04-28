// ════════════════════════════════════════
// patients.js — Patients Page
// Rendering logic unchanged.
// CHANGED: deletePatient() now uses
//          Supabase deletes instead of
//          Firestore batch operations.
// ════════════════════════════════════════

async function renderPatients() {
  const q   = (document.getElementById('pSearch')?.value || '').toLowerCase();
  let pts   = await gPts();
  if (q) pts = pts.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.phone   || '').includes(q)    ||
    (p.address || '').toLowerCase().includes(q)
  );

  const vis = await gVis();
  const el  = document.getElementById('patientsList');

  if (!pts.length) {
    el.innerHTML = `
      <div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
        </svg>
        <p>${q ? 'No patients found' : 'No patients yet'}</p>
        <span>${q ? 'Try a different search' : 'Add a new visit to create a patient record'}</span>
      </div>`;
    return;
  }

  el.innerHTML = pts.map(p => {
    const pvs  = vis.filter(v => v.patientId === p.id);
    const last = pvs.sort((a, b) => b.date.localeCompare(a.date))[0];
    const av   = p.photo
      ? `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`
      : getInits(p.name);

    return `<div class="pc" onclick="openHistory('${p.id}')">
      <div class="av ${p.gender === 'Female' ? 'f' : p.age < 18 ? 'c' : ''}">${av}</div>
      <div class="pi">
        <div class="pn">${p.name}</div>
        <div class="pm">
          ${p.age ? p.age + ' yrs' : ''}
          ${p.age && p.gender ? ' · ' : ''}
          ${p.gender || ''}
          ${p.phone ? ' · ' + p.phone : ''}
        </div>
        ${last ? `<div class="txs ts mt4">Last visit: ${fmtDate(last.date)}</div>` : ''}
      </div>
      <div class="pst" style="display:flex;align-items:center;gap:10px">
        <div>
          <div class="vc">${pvs.length}</div>
          <div class="vl">visit${pvs.length !== 1 ? 's' : ''}</div>
        </div>
        <button class="trash-btn" title="Delete Patient"
                onclick="event.stopPropagation(); deletePatient('${p.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

/**
 * CHANGED: Delete patient + cascade using Supabase.
 * Removes: patient row, all visit rows, all hist_note rows.
 * Documents (base64) are cleared from IndexedDB separately.
 */
async function deletePatient(id) {
  if (!confirm('Delete this patient and ALL their visits, history notes, and documents? This cannot be undone.')) return;

  try {
    // Delete all hist_notes for this patient
    const { error: notesErr } = await SB.from('hist_notes')
      .delete()
      .eq('user_id', window._uid)
      .eq('patientId', id);
    if (notesErr) throw notesErr;

    // Delete all visits for this patient
    const { error: visErr } = await SB.from('visits')
      .delete()
      .eq('user_id', window._uid)
      .eq('patientId', id);
    if (visErr) throw visErr;

    // Delete the patient row
    const { error: ptErr } = await SB.from('patients')
      .delete()
      .eq('user_id', window._uid)
      .eq('id', id);
    if (ptErr) throw ptErr;

    // Clear documents from IDB
    await IDB.set('ma_docs_' + id, []);

    // Optimistically update cache (real-time channel will also confirm)
    window._cache.patients = window._cache.patients.filter(p => p.id !== id);
    window._cache.visits   = window._cache.visits.filter(v => v.patientId !== id);

    toast('Patient deleted');
    renderPatients();
  } catch (err) {
    console.error('deletePatient error:', err);
    toast('Error deleting patient', 'danger');
  }
}
