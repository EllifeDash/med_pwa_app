// ════════════════════════════════════════
// js/pending-patients.js — Pending Patients
//
// Manages inactive patient records staged
// from accepted bookings. Renders on the
// Dashboard page. Supports complete (→addVisit)
// or discard (delete) flow.
// ════════════════════════════════════════

function getPendingPatients() {
  const pts = window._cache?.patients || [];
  return pts.filter(p => p.is_active === false);
}

function renderPendingPatients() {
  const section = document.getElementById('pendingPatientsSection');
  const listEl  = document.getElementById('pendingPatientsList');
  if (!section || !listEl) return;

  const pts = getPendingPatients();

  if (!pts.length) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  listEl.innerHTML = pts.map(p => {
    const waDigits = (p.phone || '').replace(/\D/g, '');
    const waNumber = waDigits.startsWith('92')
      ? waDigits
      : waDigits.startsWith('0')
        ? '92' + waDigits.slice(1)
        : '92' + waDigits;

    const ageGender = [p.age ? p.age + ' yrs' : '', p.gender || ''].filter(Boolean).join(' · ');

    return `
      <div class="card bk-card pp-card bk-open">
        <div class="bk-top">
          <div class="bk-top-info">
            <div class="bk-name">${p.name}</div>
            ${ageGender ? `<div class="bk-meta">${ageGender}</div>` : ''}
            ${p.phone ? `
            <div class="bk-phone-row">
              <span class="bk-phone-val">${p.phone}</span>
              <a href="https://wa.me/${waNumber}" target="_blank" class="bk-wa-badge" title="Chat on WhatsApp">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
              </a>
            </div>` : ''}
            ${p.address ? `<div class="bk-meta ts">${p.address}</div>` : ''}
          </div>
          <div class="bk-top-right">
            <span class="bdg b-amber">Staged</span>
          </div>
        </div>
        <div class="bk-expand" style="display:block">
          ${p.booking_ref ? `<div class="bk-detail-line"><span class="bk-detail-label">Booking Ref</span><span class="bk-detail-value txs">${p.booking_ref}</span></div>` : ''}
          <hr class="divider"/>
          <div class="bk-actions">
            <button class="btn bs bsm" onclick="openPendingPatient('${p.id}')">Complete →</button>
            <button class="btn bd bsm" onclick="discardPendingPatient('${p.id}')">Discard</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

async function openPendingPatient(id) {
  const pts = await gPts();
  const pt  = pts.find(p => p.id === id);
  if (!pt) { toast('Patient not found', 'danger'); return; }

  go('addVisit', null);
  prefillFromPendingPatient(pt);
}

async function discardPendingPatient(id) {
  if (!confirm('Discard this staged patient record? This cannot be undone.')) return;

  try {
    const { error } = await SB.from('patients')
      .delete()
      .eq('id', id)
      .eq('user_id', window._uid);
    if (error) throw error;

    window._cache.patients = window._cache.patients.filter(p => p.id !== id);

    toast('Staged patient discarded');
    renderPendingPatients();
    if (typeof renderPatients === 'function') renderPatients();
  } catch (err) {
    console.error('discardPendingPatient error:', err);
    toast('Error discarding patient', 'danger');
  }
}

window.getPendingPatients    = getPendingPatients;
window.renderPendingPatients = renderPendingPatients;
window.openPendingPatient    = openPendingPatient;
window.discardPendingPatient = discardPendingPatient;
