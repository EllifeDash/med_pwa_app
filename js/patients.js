// ════════════════════════════════════════
// patients.js — Patients Page
// Renders the searchable patient list and
// handles patient deletion (with cascade).
// ════════════════════════════════════════

/**
 * Render (or re-render) the patient list, applying the search query.
 */
async function renderPatients() {
  const q   = (document.getElementById('pSearch')?.value || '').toLowerCase();
  let pts   = await gPts();
  if (q) pts = pts.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.phone   || '').includes(q) ||
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
 * Delete a patient and cascade-remove all related visits, history notes, and documents.
 * @param {string} id - Patient ID
 */
async function deletePatient(id) {
  if (!confirm('Delete this patient and ALL their visits, history notes, and documents? This cannot be undone.')) return;

  const pts = (await gPts()).filter(p => p.id !== id);
  await DB.set('ma_patients', pts);

  const vis = (await gVis()).filter(v => v.patientId !== id);
  await DB.set('ma_visits', vis);

  // Clear per-patient buckets (history notes & documents)
  await DB.set('ma_hist_' + id, []);
  await DB.set('ma_docs_' + id, []);

  toast('Patient deleted');
  renderPatients();
}
