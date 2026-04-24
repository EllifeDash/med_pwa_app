// ════════════════════════════════════════
// init.js — App Bootstrap & Welcome Screen
// Auth state is now driven by firebase.js.
// This file provides: bootApp(), showLoginScreen(),
// welcome-screen helpers, and auth actions.
// ════════════════════════════════════════

// ── Called by firebase.js onAuthStateChanged ─
/**
 * Runs once after Firebase confirms the user is signed in.
 * Loads settings, seeds services, populates the welcome screen.
 * @param {firebase.User} user
 */
async function bootApp(user) {
  // Set up Firestore real-time listeners for this user's data
  setupListeners();

  // Load settings (falls back to defaults for new users)
  const s = await gSet();

  // Ensure services exist (gSvc seeds defaults if first login)
  await gSvc();

  // ── Populate welcome screen ──
  document.getElementById('wTagline').textContent     = s.tagline || 'Your Mobile Medical Companion';
  document.getElementById('wDisplayName').textContent = s.name    || user.displayName || 'Your Name';
  document.getElementById('wDisplayRank').textContent = s.rank    || 'Rank / Designation';

  if (s.logo) {
    document.getElementById('wLogoWrap').innerHTML =
      `<img src="${s.logo}" style="width:100%;height:100%;object-fit:contain;padding:4px"/>`;
  }
  if (s.photo) {
    document.getElementById('wSubjectWrap').innerHTML =
      `<img src="${s.photo}" class="wsubject-img"/>`;
  }

  document.getElementById('iName').value = s.name || user.displayName || '';
  document.getElementById('iRank').value = s.rank || '';
  updateWelcomeInitials();

  // Pre-fill today's date/time on the Add Visit form
  const now = new Date();
  document.getElementById('fDate').valueAsDate = now;
  document.getElementById('fTime').value       = now.toTimeString().slice(0, 5);

  // Hide login screen, reveal welcome screen
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('ws').classList.add('active');
  document.getElementById('wsSpinner').style.display = 'none';
  document.getElementById('wsCard').classList.add('wcard-ready');
}

/**
 * Called by firebase.js when the user is not authenticated.
 */
function showLoginScreen() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('ws').classList.remove('active');
  document.getElementById('app').classList.remove('active');
}

// Expose to window so firebase.js (module) can call them
window.bootApp       = bootApp;
window.showLoginScreen = showLoginScreen;

// ── Welcome screen helpers ─────────────────

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
  const r  = new FileReader();
  r.onload = async e => {
    const b64 = e.target.result;
    setWelcomePhoto(b64);
    // CHANGED: persist to Firestore instead of IndexedDB
    const s = await gSet();
    s.photo = b64;
    await FS.setDoc(userDoc('settings', 'profile'), s);
    window._cache.settings = s;
  };
  r.readAsDataURL(file);
}

// ── Auth actions ───────────────────────────

/**
 * Persist the profile name/rank from the welcome screen inputs.
 * CHANGED: writes to Firestore instead of IndexedDB.
 */
async function saveProfile() {
  const s    = await gSet();
  s.name     = document.getElementById('iName').value.trim() || s.name;
  s.rank     = document.getElementById('iRank').value.trim() || s.rank;
  await FS.setDoc(userDoc('settings', 'profile'), s);
  window._cache.settings = s;
  toast('Profile saved!');
}

/** Enter the main app (called by "Enter App" button on welcome screen). */
async function enterApp() {
  await saveProfile();
  document.getElementById('ws').style.display = 'none';
  document.getElementById('app').classList.add('active');
  go('dashboard', null);
}

/**
 * Sign the user out via Firebase Auth.
 * CHANGED: now calls authSignOut() (Firebase signOut) instead of just hiding screens.
 */
function logout() {
  authSignOut(); // defined in firebase.js → triggers onAuthStateChanged → showLoginScreen()
}
