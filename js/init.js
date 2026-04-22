// ════════════════════════════════════════
// init.js — App Bootstrap & Welcome Screen
// Runs on window load: migrates data,
// seeds defaults, populates the welcome
// screen, and wires up enter/logout.
// ════════════════════════════════════════

// ── App bootstrap ─────────────────────────
window.addEventListener('load', async () => {
  await DB.migrate();

  // Seed default services on first run
  const existing = await DB.get('ma_services');
  if (!existing) await DB.set('ma_services', DEFAULT_SVC);

  const s = await gSet();

  // ── Welcome screen display fields ──
  document.getElementById('wTagline').textContent     = s.tagline || 'Your Mobile Medical Companion';
  document.getElementById('wDisplayName').textContent = s.name    || 'Your Name';
  document.getElementById('wDisplayRank').textContent = s.rank    || 'Rank / Designation';

  // Logo (upper-left)
  if (s.logo) {
    document.getElementById('wLogoWrap').innerHTML =
      `<img src="${s.logo}" style="width:100%;height:100%;object-fit:contain;padding:4px"/>`;
  }

  // Subject / profile photo (centre)
  if (s.photo) {
    document.getElementById('wSubjectWrap').innerHTML =
      `<img src="${s.photo}" class="wsubject-img"/>`;
  }

  // Keep hidden compat inputs in sync
  document.getElementById('iName').value = s.name || '';
  document.getElementById('iRank').value = s.rank || '';
  updateWelcomeInitials();

  // Pre-fill today's date & time on the Add Visit form
  const now = new Date();
  document.getElementById('fDate').valueAsDate = now;
  document.getElementById('fTime').value       = now.toTimeString().slice(0, 5);

  // Hide spinner, reveal welcome card
  document.getElementById('wsSpinner').style.display = 'none';
  document.getElementById('wsCard').classList.add('wcard-ready');
});

// ── Welcome screen helpers ─────────────────

/**
 * Return up to 2 initials from a name string.
 */
function getInits(name) {
  if (!name) return 'MA';
  return name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function updateWelcomeInitials() {
  const n  = document.getElementById('iName').value;
  const el = document.getElementById('wInitials');
  if (el && el.tagName !== 'IMG') el.textContent = getInits(n);
}

function setWelcomePhoto(b64) {
  const wrap = document.getElementById('wSubjectWrap');
  if (wrap) wrap.innerHTML = `<img src="${b64}" class="wsubject-img"/>`;
}

function handleWelcomePhoto(input) {
  const file = input.files[0];
  if (!file) return;
  const r   = new FileReader();
  r.onload  = async e => {
    const b64 = e.target.result;
    setWelcomePhoto(b64);
    const s = await gSet();
    s.photo = b64;
    await DB.set('ma_settings', s);
  };
  r.readAsDataURL(file);
}

// ── Auth / navigation ──────────────────────

async function saveProfile() {
  const s = await gSet();
  s.name  = document.getElementById('iName').value.trim() || s.name;
  s.rank  = document.getElementById('iRank').value.trim() || s.rank;
  await DB.set('ma_settings', s);
  toast('Profile saved!');
}

async function enterApp() {
  await saveProfile();
  document.getElementById('ws').style.display = 'none';
  document.getElementById('app').classList.add('active');
  go('dashboard', null);
}

function logout() {
  document.getElementById('app').classList.remove('active');
  document.getElementById('ws').style.display = '';
  document.getElementById('ws').classList.add('active');
}
