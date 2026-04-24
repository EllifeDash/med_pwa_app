// ════════════════════════════════════════
// visits.js — Add Visit Page
// UI logic (tags, table, autocomplete,
// form reset, calcTotal) unchanged.
// CHANGED: saveVisit() now writes to
// Firestore instead of IndexedDB arrays.
// ════════════════════════════════════════

// ── Shared state ─────────────────────────
let selSvcs    = {};   // { serviceId: price }
let activePtId = null;

// ── Service tags & table ──────────────────
// No changes below — purely UI logic.

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
  const disc = +(document.getElementById('fDisc')?.value || 0);
  document.getElementById('vTotal').textContent = 'Rs. ' + sub.toLocaleString();
  document.getElementById('vNet').textContent   = 'Rs. ' + Math.max(0, sub - disc).toLocaleString();
}

// ── Patient autocomplete ──────────────────
// No changes — reads from gPts() which uses the cache.

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
 * CHANGED: saveVisit() now persists to Firestore.
 * Patient upsert → users/{uid}/patients/{pid}
 * Visit write   → users/{uid}/visits/{vid}
 * Both use setDoc (create-or-merge).
 */
async function saveVisit() {
  const name = document.getElementById('fName').value.trim();
  if (!name)                          { toast('Patient name is required', 'danger'); return; }
  if (!Object.keys(selSvcs).length)   { toast('Select at least one service', 'danger'); return; }

  try {
    const pts  = await gPts();
    const svcs = await gSvc();
    let pt;

    if (activePtId) pt = pts.find(p => p.id === activePtId);
    if (!pt)        pt = pts.find(p => p.name.toLowerCase() === name.toLowerCase());

    if (!pt) {
      // ── New patient ──
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
      // ── Update existing patient fields ──
      pt.age     = +document.getElementById('fAge').value           || pt.age;
      pt.gender  =  document.getElementById('fGender').value        || pt.gender;
      pt.phone   =  document.getElementById('fPhone').value.trim()  || pt.phone;
      pt.address =  document.getElementById('fAddr').value.trim()   || pt.address;
    }

    // CHANGED: write patient to Firestore (merge keeps existing photo etc.)
    await FS.setDoc(userDoc('patients', pt.id), pt, { merge: true });

    const sub  = Object.values(selSvcs).reduce((a, b) => a + (+b || 0), 0);
    const disc = +(document.getElementById('fDisc').value || 0);

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

    // CHANGED: write visit to Firestore
    await FS.setDoc(userDoc('visits', v.id), v);

    // Optimistically update cache (onSnapshot will also confirm)
    const cachedPt = window._cache.patients.find(p => p.id === pt.id);
    if (cachedPt) Object.assign(cachedPt, pt);
    else window._cache.patients.push(pt);
    window._cache.visits.push(v);

    toast('Visit saved!');
    previewReceipt(v.id);
    resetForm();
  } catch (err) {
    console.error('saveVisit error:', err);
    toast('Error saving visit', 'danger');
  }
}
