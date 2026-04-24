// ════════════════════════════════════════
// history.js — Patient History Page
// UI and structure unchanged.
// CHANGED sections marked with // CHANGED.
// • History notes CRUD  → Firestore
// • deleteVisit()       → Firestore
// • handlePatientPhoto  → Firestore
// • Documents (base64)  → still IDB
// ════════════════════════════════════════

let historyPatientId  = null;
let editingHistNoteId = null;

// ── Open history page ─────────────────────

async function openHistory(pid) {
  historyPatientId = pid;
  const p = (await gPts()).find(x => x.id === pid);
  if (!p) return;

  const vis   = (await gVis()).filter(v => v.patientId === pid)
                              .sort((a, b) => b.date.localeCompare(a.date));
  const total = vis.reduce((s, v) => s + (v.net || 0), 0);

  document.getElementById('hpName').textContent     = p.name;
  document.getElementById('hpMeta').textContent     = [p.age ? p.age + ' yrs' : '', p.gender, p.phone, p.address].filter(Boolean).join(' · ');
  document.getElementById('hpFullName').textContent = p.name;
  document.getElementById('hpDetails').textContent  = [p.age ? p.age + ' years old' : '', p.gender, p.phone].filter(Boolean).join(' · ');
  if (p.address) document.getElementById('hpDetails').textContent += ' · ' + p.address;

  const hpAv = document.getElementById('hpAv');
  if (p.photo) {
    hpAv.innerHTML = `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`;
  } else {
    hpAv.innerHTML = `
      <span style="font-size:22px;font-weight:700;color:var(--p)">${getInits(p.name)}</span>
      <div class="wpa-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s;border-radius:50%">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      </div>`;
    hpAv.onmouseenter = () => hpAv.querySelector('.wpa-overlay').style.opacity = 1;
    hpAv.onmouseleave = () => hpAv.querySelector('.wpa-overlay').style.opacity = 0;
  }

  document.getElementById('hpStats').innerHTML = `
    <div class="scard"><div class="sv" style="font-size:20px">${vis.length}</div><div class="sl">Visits</div></div>
    <div class="scard"><div class="sv" style="font-size:16px;color:var(--ok)">Rs.${total.toLocaleString()}</div><div class="sl">Total Billed</div></div>
    <div class="scard"><div class="sv" style="font-size:14px">${vis[0] ? fmtDate(vis[0].date) : '—'}</div><div class="sl">Last Visit</div></div>`;

  renderHistNotes();
  renderDocs();
  renderPatientVisits(vis);
  updateStorageBar(pid);

  let btn = document.getElementById('newVisitBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id        = 'newVisitBtn';
    btn.className = 'btn bp bsm mt12';
    document.getElementById('hpStats').after(btn);
  }
  btn.textContent = '+ New Visit for this Patient';
  btn.onclick     = () => prefillPt(pid);

  go('history', null);
}

// ── Medical History Notes ─────────────────
// CHANGED: all reads/writes now go through Firestore.

async function renderHistNotes() {
  // CHANGED: gHistNotes() now queries Firestore
  const notes = (await gHistNotes(historyPatientId))
                  .sort((a, b) => b.date.localeCompare(a.date));
  const el    = document.getElementById('histNotes');

  if (!notes.length) {
    el.innerHTML = `<div class="empty" style="padding:16px 0">
      <p style="font-size:14px">No history notes yet</p>
      <span>Add diagnoses, allergies, conditions…</span>
    </div>`;
    return;
  }

  const catColors = {
    'Diagnosis':'b-red','Allergy':'b-amber','Chronic Condition':'b-red',
    'Medication':'b-blue','Lab Result':'b-green','General Note':'b-gray','Other':'b-gray'
  };

  el.innerHTML = notes.map(n => `
    <div class="hi" style="position:relative">
      <div class="flex ic jb mb4">
        <span class="bdg ${catColors[n.category] || 'b-gray'}">${n.category}</span>
        <div class="flex ic g8">
          <span class="txs ts">${fmtDate(n.date)}</span>
          <button onclick="editHistNote('${n.id}')" class="btn bg bsm" style="padding:3px 8px;font-size:12px">Edit</button>
          <button onclick="delHistNote('${n.id}')" class="sdel">✕</button>
        </div>
      </div>
      <div class="hs">${n.title}</div>
      ${n.details ? `<div class="hn">${n.details}</div>` : ''}
    </div>`).join('');
}

function showAddHistNote() {
  editingHistNoteId = null;
  document.getElementById('histModalTitle').textContent = 'Add Medical History Note';
  document.getElementById('hnDate').value               = new Date().toISOString().slice(0, 10);
  document.getElementById('hnCat').value                = 'General Note';
  document.getElementById('hnTitle').value              = '';
  document.getElementById('hnDetails').value            = '';
  openMo('histModal');
}

async function editHistNote(id) {
  // CHANGED: read single note from Firestore via gHistNotes (query by patientId)
  const notes = await gHistNotes(historyPatientId);
  const n     = notes.find(x => x.id === id);
  if (!n) return;
  editingHistNoteId = id;
  document.getElementById('histModalTitle').textContent = 'Edit History Note';
  document.getElementById('hnDate').value               = n.date;
  document.getElementById('hnCat').value                = n.category;
  document.getElementById('hnTitle').value              = n.title;
  document.getElementById('hnDetails').value            = n.details || '';
  openMo('histModal');
}

async function saveHistNote() {
  const title = document.getElementById('hnTitle').value.trim();
  if (!title) { toast('Enter a title', 'danger'); return; }

  const note = {
    id:         editingHistNoteId || 'hn_' + Date.now(),
    patientId:  historyPatientId,   // CHANGED: required for Firestore query
    date:       document.getElementById('hnDate').value,
    category:   document.getElementById('hnCat').value,
    title,
    details:    document.getElementById('hnDetails').value.trim(),
  };

  try {
    // CHANGED: setDoc to users/{uid}/histNotes/{note.id}
    await FS.setDoc(userDoc('histNotes', note.id), note);
    closeMo('histModal');
    renderHistNotes();
    toast('Note saved!');
  } catch (err) {
    console.error('saveHistNote error:', err);
    toast('Error saving note', 'danger');
  }
}

async function delHistNote(id) {
  if (!confirm('Delete this note?')) return;
  try {
    // CHANGED: deleteDoc from Firestore
    await FS.deleteDoc(userDoc('histNotes', id));
    renderHistNotes();
    toast('Note deleted');
  } catch (err) {
    console.error('delHistNote error:', err);
    toast('Error deleting note', 'danger');
  }
}

// ── Documents ─────────────────────────────
// UNCHANGED — base64 blobs stay in IDB
// (Firestore 1 MB doc limit prevents storing them there).

async function handleDocUpload(input) {
  const files = Array.from(input.files);
  if (!files.length) return;

  let done = 0;
  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) {
      toast('File too large (max 10MB): ' + file.name, 'danger');
      done++;
      continue;
    }
    await new Promise(resolve => {
      const r    = new FileReader();
      r.onload   = async e => {
        const currentDocs = await gDocs(historyPatientId);
        await IDB.set('ma_docs_' + historyPatientId, [...currentDocs, {
          id:         'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2),
          name:       file.name,
          type:       file.type,
          size:       file.size,
          data:       e.target.result,
          uploadedAt: new Date().toISOString(),
        }]);
        done++;
        resolve();
      };
      r.onerror = () => { done++; toast('Failed to read ' + file.name, 'danger'); resolve(); };
      r.readAsDataURL(file);
    });
  }

  renderDocs();
  updateStorageBar(historyPatientId);
  input.value = '';
  toast(done > 1 ? done + ' documents uploaded!' : 'Document uploaded!');
}

async function renderDocs() {
  const docs = await gDocs(historyPatientId);
  const el   = document.getElementById('docsList');

  if (!docs.length) {
    el.innerHTML = `<div class="empty" style="padding:12px 0">
      <p style="font-size:14px">No documents yet</p>
      <span>Upload medical reports, images, prescriptions…</span>
    </div>`;
    return;
  }

  el.innerHTML = docs.map(d => {
    const isImg = d.type.startsWith('image/');
    const icon  = isImg
      ? `<img src="${d.data}" class="doc-thumb" alt="${d.name}"/>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0369a1" stroke-width="2">
           <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
           <polyline points="14 2 14 8 20 8"/>
         </svg>`;
    return `<div class="doc-card mb8">
      <div class="doc-icon">${icon}</div>
      <div class="doc-info">
        <div class="doc-name">${d.name}</div>
        <div class="doc-meta">${fmtFileSize(d.size)} · ${fmtDate(d.uploadedAt?.slice(0, 10) || '')}</div>
      </div>
      <button class="btn bg bsm" style="flex-shrink:0;padding:5px 10px;font-size:12px"
              onclick="previewDoc('${d.id}')">View</button>
      <button class="doc-del" onclick="delDoc('${d.id}')">✕</button>
    </div>`;
  }).join('');
}

async function delDoc(id) {
  if (!confirm('Delete this document?')) return;
  const docs = (await gDocs(historyPatientId)).filter(d => d.id !== id);
  await IDB.set('ma_docs_' + historyPatientId, docs);
  renderDocs();
  updateStorageBar(historyPatientId);
  toast('Deleted');
}

async function previewDoc(id) {
  const d = (await gDocs(historyPatientId)).find(x => x.id === id);
  if (!d) return;
  document.getElementById('docModalName').textContent = d.name;
  const isImg = d.type.startsWith('image/');
  document.getElementById('docModalContent').innerHTML = isImg
    ? `<img src="${d.data}" style="max-width:100%;border-radius:var(--rs)"/>`
    : `<p class="ts tsm mb12">PDF preview not available inline.</p>
       <a href="${d.data}" download="${d.name}" class="btn bp">Download PDF</a>`;
  openMo('docModal');
}

// ── Storage Bar ───────────────────────────
// Unchanged — reports on browser quota (covers IDB docs).

async function updateStorageBar(pid) {
  const el = document.getElementById('storageBar');
  el.style.display = 'block';

  if (navigator.storage && navigator.storage.estimate) {
    const { usage, quota } = await navigator.storage.estimate();
    const pct     = Math.min(100, Math.round((usage || 0) / (quota || 1) * 100));
    const usedMB  = ((usage || 0) / 1024 / 1024).toFixed(1);
    const quotaMB = Math.round((quota || 0) / 1024 / 1024);
    document.getElementById('storPct').textContent = `${usedMB}MB of ~${quotaMB}MB used (${pct}%)`;
    const fill       = document.getElementById('storFill');
    fill.style.width = pct + '%';
    fill.className   = 'stor-fill' + (pct > 85 ? ' danger' : pct > 65 ? ' warn' : '');
  } else {
    document.getElementById('storPct').textContent  = 'Firestore (cloud) + local docs cache';
    document.getElementById('storFill').style.width = '2%';
    document.getElementById('storFill').className   = 'stor-fill';
  }
}

// ── Visit list ────────────────────────────

function renderPatientVisits(vis) {
  const el = document.getElementById('hpVisits');
  if (!vis.length) {
    el.innerHTML = `<div class="empty" style="padding:16px 0">
      <p style="font-size:14px">No visits yet</p>
    </div>`;
    return;
  }

  el.innerHTML = vis.map(v => `
    <div class="hi">
      <div class="flex ic jb">
        <div class="hd">${fmtDate(v.date)} ${v.time || ''}</div>
        <div class="flex ic g8">
          <button class="btn bg bsm" style="padding:4px 10px;font-size:12px"
                  onclick="previewReceipt('${v.id}')">Receipt</button>
          <button class="trash-btn" title="Delete Visit" onclick="deleteVisit('${v.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="hs">${v.services.map(s => s.name).join(', ')}</div>
      ${v.notes ? `<div class="hn">${v.notes}</div>` : ''}
      <div class="ha">Rs. ${(v.net || 0).toLocaleString()}</div>
    </div>`).join('');
}

async function deleteVisit(id) {
  if (!confirm('Delete this visit record?')) return;
  try {
    // CHANGED: delete the visit document from Firestore
    await FS.deleteDoc(userDoc('visits', id));

    // Optimistically update cache (onSnapshot will also confirm)
    window._cache.visits = window._cache.visits.filter(v => v.id !== id);

    const updatedVis = window._cache.visits
      .filter(v => v.patientId === historyPatientId)
      .sort((a, b) => b.date.localeCompare(a.date));

    renderPatientVisits(updatedVis);

    const total = updatedVis.reduce((s, v) => s + (v.net || 0), 0);
    document.getElementById('hpStats').innerHTML = `
      <div class="scard"><div class="sv" style="font-size:20px">${updatedVis.length}</div><div class="sl">Visits</div></div>
      <div class="scard"><div class="sv" style="font-size:16px;color:var(--ok)">Rs.${total.toLocaleString()}</div><div class="sl">Total Billed</div></div>
      <div class="scard"><div class="sv" style="font-size:14px">${updatedVis[0] ? fmtDate(updatedVis[0].date) : '—'}</div><div class="sl">Last Visit</div></div>`;
    toast('Visit deleted');
  } catch (err) {
    console.error('deleteVisit error:', err);
    toast('Error deleting visit', 'danger');
  }
}

// ── Patient photo upload ───────────────────

function handlePatientPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  const r   = new FileReader();
  r.onload  = async e => {
    try {
      // CHANGED: merge photo into Firestore patient document
      await FS.setDoc(userDoc('patients', historyPatientId), { photo: e.target.result }, { merge: true });

      // Update cache
      const pt = window._cache.patients.find(x => x.id === historyPatientId);
      if (pt) pt.photo = e.target.result;

      document.getElementById('hpAv').innerHTML =
        `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`;
      input.value = '';
      toast('Photo updated!');
    } catch (err) {
      console.error('handlePatientPhoto error:', err);
      toast('Error saving photo', 'danger');
    }
  };
  r.readAsDataURL(file);
}
