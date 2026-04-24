// ════════════════════════════════════════
// settings.js — Settings Page
// UI unchanged.
// CHANGED: all DB.set() calls replaced with
// Firestore setDoc/deleteDoc writes.
// ════════════════════════════════════════

async function renderSettings() {
  const s = await gSet();
  document.getElementById('sName').value = s.name         || '';
  document.getElementById('sRank').value = s.rank         || '';
  document.getElementById('sBiz').value  = s.businessName || '';
  document.getElementById('sTag').value  = s.tagline      || '';
  document.getElementById('sPh').value   = s.phone        || '';
  document.getElementById('sAdr').value  = s.address      || '';

  const sAv = document.getElementById('settingsAvatar');
  if (s.photo) {
    sAv.innerHTML = `<img src="${s.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`;
  } else {
    sAv.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
      <span class="pu-hint">Tap to upload photo</span>`;
  }

  const sLogo = document.getElementById('settingsLogo');
  if (s.logo) {
    sLogo.innerHTML = `<img src="${s.logo}" style="width:100%;height:100%;object-fit:contain;border-radius:10px;padding:4px"/>`;
  } else {
    sLogo.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px">
        <rect x="3" y="3" width="18" height="18" rx="3"/>
        <polyline points="3 9 7 5 11 9 15 5 19 9"/>
        <circle cx="8.5" cy="14.5" r="1.5"/>
      </svg>
      <span class="pu-hint">Tap to upload logo</span>`;
  }

  renderSvcSettings();
}

// ── Photo / Logo upload ───────────────────

function handleSettingsPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  const r  = new FileReader();
  r.onload = async e => {
    try {
      const s = await gSet();
      s.photo = e.target.result;
      // CHANGED: write to Firestore
      await FS.setDoc(userDoc('settings', 'profile'), s);
      window._cache.settings = s;
      document.getElementById('settingsAvatar').innerHTML =
        `<img src="${s.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`;
      setWelcomePhoto(s.photo);
      toast('Photo saved!');
    } catch (err) {
      console.error('handleSettingsPhoto error:', err);
      toast('Error saving photo', 'danger');
    }
  };
  r.readAsDataURL(file);
}

function handleSettingsLogo(input) {
  const file = input.files[0];
  if (!file) return;
  const r  = new FileReader();
  r.onload = async e => {
    try {
      const s = await gSet();
      s.logo  = e.target.result;
      // CHANGED: write to Firestore
      await FS.setDoc(userDoc('settings', 'profile'), s);
      window._cache.settings = s;
      document.getElementById('settingsLogo').innerHTML =
        `<img src="${s.logo}" style="width:100%;height:100%;object-fit:contain;border-radius:10px;padding:4px"/>`;
      document.getElementById('wLogoWrap').innerHTML =
        `<img src="${s.logo}" style="width:100%;height:100%;object-fit:contain;padding:4px"/>`;
      toast('Logo saved!');
    } catch (err) {
      console.error('handleSettingsLogo error:', err);
      toast('Error saving logo', 'danger');
    }
  };
  r.readAsDataURL(file);
}

// ── Save profile settings ─────────────────

async function saveSettings() {
  try {
    const cur     = await gSet();
    const updated = {
      name:         document.getElementById('sName').value.trim(),
      rank:         document.getElementById('sRank').value.trim(),
      businessName: document.getElementById('sBiz').value.trim(),
      tagline:      document.getElementById('sTag').value.trim(),
      phone:        document.getElementById('sPh').value.trim(),
      address:      document.getElementById('sAdr').value.trim(),
      photo:        cur.photo || '',
      logo:         cur.logo  || '',
    };

    // CHANGED: write to Firestore, invalidate cache
    await FS.setDoc(userDoc('settings', 'profile'), updated);
    window._cache.settings = updated;

    document.getElementById('wDisplayName').textContent = updated.name    || 'Your Name';
    document.getElementById('wDisplayRank').textContent = updated.rank    || 'Rank / Designation';
    document.getElementById('wTagline').textContent     = updated.tagline || 'Your Mobile Medical Companion';
    document.getElementById('iName').value = updated.name || '';
    document.getElementById('iRank').value = updated.rank || '';
    toast('Settings saved!');
  } catch (err) {
    console.error('saveSettings error:', err);
    toast('Error saving settings', 'danger');
  }
}

// ── Service pricing CRUD ──────────────────

async function renderSvcSettings() {
  const svcs = (await gSvc()).sort((a, b) => a.name.localeCompare(b.name));
  document.getElementById('svcCnt').textContent   = svcs.length;
  document.getElementById('svcTblBody').innerHTML = svcs.map((s, i) => `
    <tr>
      <td class="ts">${i + 1}</td>
      <td>
        <input value="${s.name}"
               oninput="updSvc(${s.id},'name',this.value)"
               style="border:none;background:transparent;width:100%;font-weight:600;padding:0;font-size:14px"/>
      </td>
      <td>
        <input type="number" value="${s.price}"
               oninput="updSvc(${s.id},'price',+this.value)"
               style="border:1px solid var(--bd);border-radius:6px;width:90px;padding:5px 8px;font-size:14px"/>
      </td>
      <td><button class="sdel" onclick="delSvc(${s.id})">✕</button></td>
    </tr>`).join('');
}

async function updSvc(id, field, value) {
  try {
    const svcs = await gSvc();
    const s    = svcs.find(x => x.id === id);
    if (!s) return;
    s[field] = value;
    // CHANGED: write individual service doc to Firestore
    await FS.setDoc(userDoc('services', String(id)), s);
    // Update cache in-place (no need to reload full list)
    const cached = window._cache.services.find(x => x.id === id);
    if (cached) cached[field] = value;
  } catch (err) {
    console.error('updSvc error:', err);
  }
}

async function delSvc(id) {
  if (!confirm('Remove this service?')) return;
  try {
    // CHANGED: delete from Firestore
    await FS.deleteDoc(userDoc('services', String(id)));
    window._cache.services = window._cache.services.filter(s => s.id !== id);
    renderSvcSettings();
    toast('Removed');
  } catch (err) {
    console.error('delSvc error:', err);
    toast('Error removing service', 'danger');
  }
}

async function addSvc() {
  const n = document.getElementById('nSvcName').value.trim();
  if (!n) { toast('Enter a name', 'danger'); return; }
  try {
    const svcs = await gSvc();
    const nid  = Math.max(...svcs.map(s => s.id), 0) + 1;
    const svc  = { id: nid, name: n, price: +(document.getElementById('nSvcPrice').value) || 0 };
    // CHANGED: write to Firestore
    await FS.setDoc(userDoc('services', String(nid)), svc);
    window._cache.services.push(svc);
    document.getElementById('nSvcName').value  = '';
    document.getElementById('nSvcPrice').value = '';
    renderSvcSettings();
    toast('Service added!');
  } catch (err) {
    console.error('addSvc error:', err);
    toast('Error adding service', 'danger');
  }
}
