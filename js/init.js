// ════════════════════════════════════════
// init.js — App Bootstrap & Welcome Screen
// CHANGED: login/signup handlers removed.
// • bootApp()        — unchanged
// • enterApp()       — unchanged
// • logout()         — unchanged
// • showAccessDenied() — replaces showLoginScreen()
//   Shows a minimal "contact admin" screen,
//   no form, no inputs, no auth UI.
// ════════════════════════════════════════

/**
 * Called by __bootApp() (supabase.js) after a valid session is confirmed.
 * Loads profile from Supabase and populates the welcome screen.
 */
async function bootApp(user) {
  setupListeners();       // start real-time subscriptions (db.js)

  if (typeof renderBookings === 'function') renderBookings();

  const s = await gSet(); // load settings from Supabase
  await gSvc();           // seed default services if first login

  // ── Populate welcome screen with Supabase profile data ──
  document.getElementById('wDisplayName').textContent = s.name    || 'Your Name';
  document.getElementById('wDisplayRank').textContent = s.rank    || 'Rank / Designation';
  document.getElementById('wTagline').textContent     = s.tagline || 'Your Mobile Medical Companion';

  if (s.logo) {
    document.getElementById('wLogoWrap').innerHTML =
      `<img src="${s.logo}" style="width:100%;height:100%;object-fit:contain;padding:4px"/>`;
  }
  if (s.photo) {
    document.getElementById('wSubjectWrap').innerHTML =
      `<img src="${s.photo}" class="wsubject-img"/>`;
  }

  // Keep hidden inputs in sync (used by settings page)
  document.getElementById('iName').value = s.name || '';
  document.getElementById('iRank').value = s.rank || '';

  // Pre-fill today's date/time on the Add Visit form
  const now = new Date();
  document.getElementById('fDate').valueAsDate = now;
  document.getElementById('fTime').value       = now.toTimeString().slice(0, 5);

  // Hide access-denied fallback, show welcome screen
  document.getElementById('accessDenied').style.display = 'none';
  document.getElementById('ws').classList.add('active');
  document.getElementById('wsSpinner').style.display    = 'none';
  document.getElementById('wsCard').classList.add('wcard-ready');
}

/**
 * CHANGED: Called when no valid session exists.
 * Shows a minimal locked-screen — no login form, no inputs.
 * Users must contact admin to get access.
 */
function showAccessDenied() {
  document.getElementById('accessDenied').style.display = 'flex';
  document.getElementById('ws').classList.remove('active');
  document.getElementById('app').classList.remove('active');
}

// Expose to window so supabase.js (module) can call them
window.bootApp          = bootApp;
window.showAccessDenied = showAccessDenied;
// Keep old name as alias — defensive, in case anything references it
window.showLoginScreen  = showAccessDenied;

// ── Welcome screen helpers ─────────────────

function getInits(name) {
  if (!name) return 'MA';
  return name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function setWelcomePhoto(b64) {
  const wrap = document.getElementById('wSubjectWrap');
  if (wrap) wrap.innerHTML = `<img src="${b64}" class="wsubject-img"/>`;
}

// ── App entry ──────────────────────────────

/**
 * "Enter App" button on the welcome screen.
 * Navigates to the main app — no auth needed here,
 * session was already confirmed by bootApp().
 */
function enterApp() {
  document.getElementById('ws').style.display = 'none';
  document.getElementById('app').classList.add('active');
  go('dashboard', null);
  // Request notification permission for booking alerts
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  // Listen for navigation requests from service worker (notification clicks)
  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'navigate' && typeof go === 'function') {
      go(event.data.page, null);
    }
  });
}

/**
 * Logout — signs out via Supabase, triggers showAccessDenied().
 * Admin must restore access manually from the Supabase dashboard.
 */
function logout() {
  authSignOut(); // defined in supabase.js
}

// ── Boot: session check — runs after all deferred scripts have loaded ──
// init.js is the last defer script, so bootApp / showAccessDenied are
// guaranteed to be on window by this point.
if (typeof window.__bootApp === 'function') {
  window.__bootApp();
}
