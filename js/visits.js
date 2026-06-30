// ════════════════════════════════════════
// visits.js — Add Visit Page
// UI logic (tags, table, autocomplete,
// form reset, calcTotal) unchanged.
// CHANGED: saveVisit() now writes to
//          Supabase instead of Firestore.
// ════════════════════════════════════════

let selSvcs    = {};
let activePtId = null;

// ── Service tags & table ──────────────────
// No changes — reads from gSvc() cache.

async function renderSvcTags() {
  const svcs = await gSvc();
  document.getElementById('svcTags').innerHTML = svcs.map(s => `
    <div class="stag ${selSvcs[s.id] !== undefined ? 'sel' : ''}"
         onclick="togSvc(${s.id})" id="st-${s.id}">
      ${s.name} <span style="opacity:.7">Rs.${s.price}</span>
    </div>`).join('');
  renderSvcTable();
}

async function togSvc(id) {
  const svcs = await gSvc();
  const s    = svcs.find(x => x.id === id);
  if (!s) return;
  if (selSvcs[id] !== undefined) delete selSvcs[id];
  else selSvcs[id] = s.price;
  document.getElementById('st-' + id)?.classList.toggle('sel', selSvcs[id] !== undefined);
  renderSvcTable();
  calcTotal();
}

async function renderSvcTable() {
  const keys = Object.keys(selSvcs);
  const el   = document.getElementById('svcTable');
  if (!keys.length) { el.innerHTML = ''; return; }
  const svcs = await gSvc();
  el.innerHTML = `
    <table class="tbl">
      <thead><tr><th>Service</th><th>Price (Rs.)</th></tr></thead>
      <tbody>
        ${keys.map(id => {
          const s = svcs.find(x => x.id == id);
          return `<tr>
            <td>${s ? s.name : 'Service'}</td>
            <td><input type="number" value="${selSvcs[id]}" style="width:100px"
                       oninput="selSvcs[${id}]=+this.value; calcTotal()"/></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function calcTotal() {
  const sub  = Object.values(selSvcs).reduce((a, b) => a + (+b || 0), 0);
  const disc = Math.min(sub, Math.max(0, +(document.getElementById('fDisc')?.value || 0)));
  document.getElementById('vTotal').textContent = 'Rs. ' + sub.toLocaleString();
  document.getElementById('vNet').textContent   = 'Rs. ' + (sub - disc).toLocaleString();
}

// ── Patient autocomplete ──────────────────

async function suggestPt() {
  const q  = document.getElementById('fName').value.toLowerCase().trim();
  const el = document.getElementById('ptSugg');
  if (q.length < 2) { el.style.display = 'none'; return; }
  const m = (await gPts()).filter(p => p.name.toLowerCase().includes(q)).slice(0, 5);
  if (!m.length) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = m.map(p => `
    <div onclick="prefillPt('${p.id}')"
         style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--bd);font-size:14px">
      <strong>${p.name}</strong>
      <span class="ts">${p.age ? p.age + ' yrs' : ''} ${p.phone ? ' · ' + p.phone : ''}</span>
    </div>`).join('');
}

document.addEventListener('click', e => {
  if (!e.target.closest('#ptSugg') && e.target.id !== 'fName')
    document.getElementById('ptSugg').style.display = 'none';
});

async function prefillPt(id) {
  activePtId = id;
  const p    = (await gPts()).find(x => x.id === id);
  if (!p) return;
  go('addVisit', null);
  setTimeout(() => {
    document.getElementById('fName').value   = p.name;
    document.getElementById('fAge').value    = p.age    || '';
    document.getElementById('fGender').value = p.gender || '';
    document.getElementById('fPhone').value  = p.phone  || '';
    document.getElementById('fAddr').value   = p.address || '';
    const b         = document.getElementById('existingBanner');
    b.style.display = 'block';
    b.innerHTML     = `<strong>${p.name}</strong> — existing patient selected. Details pre-filled.`;
  }, 60);
}

function prefillFromPendingPatient(pt) {
  activePtId = pt.id;
  setTimeout(() => {
    document.getElementById('fName').value   = pt.name   || '';
    document.getElementById('fAge').value    = pt.age    || '';
    document.getElementById('fGender').value = pt.gender || '';
    document.getElementById('fPhone').value  = pt.phone  || '';
    document.getElementById('fAddr').value   = pt.address || '';
    const b = document.getElementById('existingBanner');
    b.style.display = 'block';
    b.innerHTML = `<strong>${pt.name}</strong> — completing staged record. Fill remaining details and save.`;
  }, 60);
}

function resetForm() {
  ['fName','fAge','fPhone','fAddr','fNotes','fDisc'].forEach(id =>
    document.getElementById(id).value = ''
  );
  document.getElementById('fGender').value = '';
  const now = new Date();
  document.getElementById('fDate').valueAsDate = now;
  document.getElementById('fTime').value       = now.toTimeString().slice(0, 5);
  selSvcs    = {};
  activePtId = null;
  document.getElementById('existingBanner').style.display = 'none';
  renderSvcTags();
  calcTotal();
}

// ── Save visit ────────────────────────────

/**
 * Writes patient + visit to Supabase.
 * CHANGED: If device is offline, the visit is saved to the
 * IndexedDB offline queue (via offline.js) and synced
 * automatically when the connection is restored.
 */
async function saveVisit() {
  const name = document.getElementById('fName').value.trim();
  if (!name)                        { toast('Patient name is required', 'danger'); return; }
  if (!Object.keys(selSvcs).length) { toast('Select at least one service', 'danger'); return; }

  try {
    const pts  = await gPts();
    const svcs = await gSvc();
    const uid  = window._uid;
    let pt;

    if (activePtId) pt = pts.find(p => p.id === activePtId);
    if (!pt)        pt = pts.find(p => p.name.toLowerCase() === name.toLowerCase());

    if (!pt) {
      pt = {
        id:        'p_' + Date.now(),
        name,
        age:       +document.getElementById('fAge').value    || null,
        gender:     document.getElementById('fGender').value,
        phone:      document.getElementById('fPhone').value.trim(),
        address:    document.getElementById('fAddr').value.trim(),
        createdAt:  new Date().toISOString(),
      };
    } else {
      pt.age     = +document.getElementById('fAge').value           || pt.age;
      pt.gender  =  document.getElementById('fGender').value        || pt.gender;
      pt.phone   =  document.getElementById('fPhone').value.trim()  || pt.phone;
      pt.address =  document.getElementById('fAddr').value.trim()   || pt.address;
    }

    const sub  = Object.values(selSvcs).reduce((a, b) => a + (+b || 0), 0);
    const disc = Math.min(sub, Math.max(0, +(document.getElementById('fDisc').value || 0)));

    const v = {
      id:          'v_' + Date.now(),
      patientId:    pt.id,
      patientName:  pt.name,
      date:         document.getElementById('fDate').value,
      time:         document.getElementById('fTime').value,
      notes:        document.getElementById('fNotes').value.trim(),
      services:     Object.keys(selSvcs).map(id => {
        const s = svcs.find(x => x.id == id);
        return { id: +id, name: s ? s.name : 'Service', price: +selSvcs[id] };
      }),
      subtotal:   sub,
      discount:   disc,
      net:        Math.max(0, sub - disc),
      createdAt:  new Date().toISOString(),
    };

    // ── OFFLINE BRANCH ────────────────────
    // If no internet, queue locally and show receipt from cache data.
    if (!navigator.onLine) {
      // If this was a staged inactive patient, flag for activation on sync
      if (pt.is_active === false) pt._pendingActivate = true;
      await addToOfflineQueue({ pt, v });
      // Add to in-memory cache so receipt preview works
      const cachedPt = window._cache.patients.find(p => p.id === pt.id);
      if (cachedPt) Object.assign(cachedPt, pt);
      else window._cache.patients.push({ ...pt, user_id: uid });
      window._cache.visits.push({ ...v, user_id: uid });
      toast('Saved offline — will sync when connected');
      previewReceipt(v.id);
      resetForm();
      return;
    }

    // ── ONLINE BRANCH ─────────────────────
    // Upsert patient — include is_active so staged records get activated
    pt.is_active = true;
    const { error: ptErr } = await SB.from('patients')
      .upsert({ ...pt, user_id: uid }, { onConflict: 'id' });
    if (ptErr) throw ptErr;

    const { error: visErr } = await SB.from('visits')
      .insert({ ...v, user_id: uid });
    if (visErr) throw visErr;

    const cachedPt = window._cache.patients.find(p => p.id === pt.id);
    if (cachedPt) Object.assign(cachedPt, pt);
    else window._cache.patients.push({ ...pt, user_id: uid });
    window._cache.visits.push({ ...v, user_id: uid });

    toast('Visit saved!');
    previewReceipt(v.id);
    resetForm();
    if (typeof renderPendingPatients === 'function') renderPendingPatients();
  } catch (err) {
    console.error('saveVisit error:', err);
    toast('Error saving visit', 'danger');
  }
}
