// ════════════════════════════════════════
// supabase.js — Supabase Client Setup
// CHANGED: No login/signup UI.
// • App opens directly — session is checked
//   silently via getSession() on load.
// • If session exists  → bootApp()
// • If no session      → showAccessDenied()
//   (minimal fallback, no form, no inputs)
// • Users are created manually by admin
//   in the Supabase Dashboard only.
//
// FIX (auto-logout resilience):
// • supabase-js version PINNED to 2.47.10
//   (floating "@2" froze an old build inside
//   the service-worker cache — unpredictable
//   auth behavior across devices).
// • Session is backed up to IndexedDB. If
//   SIGNED_OUT fires while OFFLINE (a failed
//   token refresh in a dead-signal area kills
//   the session in supabase-js), the backup
//   is restored and the app keeps working
//   offline. On reconnect the refresh is
//   retried — server-side tokens stay valid.
// • authSignOut() clears the backup first so
//   an intentional logout can never resurrect.
// ════════════════════════════════════════

import { createClient }
  from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.47.10/+esm';

// ─────────────────────────────────────────
// ⚠️  REPLACE WITH YOUR SUPABASE CREDENTIALS
// Supabase Dashboard → Project Settings → API
// ─────────────────────────────────────────
const SUPABASE_URL      = 'https://gkfotrghyydydbfoakaq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrZm90cmdoeXlkeWRiZm9ha2FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNzk4MzEsImV4cCI6MjA5Mjg1NTgzMX0.sXZRa4tO8AkUQ-Sn34rqjatlLCXbt7dRrdi9qcq1-Lc';

const _sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Expose client globally — all deferred scripts use window.SB
window.SB   = _sb;
window._uid = null;

// Set to true when a session was restored after an offline sign-out.
// On the next 'online' event the token refresh is retried explicitly —
// supabase-js stops its auto-refresh timer after SIGNED_OUT, so the
// retry must not be skipped just because window._uid is truthy.
let _recovering = false;

// ── Session backup (IndexedDB) ────────────
// supabase-js stores the session in localStorage
// under `sb-<project-ref>-auth-token` and REMOVES it
// whenever a token refresh fails — even for a plain
// network error. Field workers lose the app this way.
// We keep a copy in IDB to restore after offline blips.
const AUTH_BACKUP_KEY = 'ma_auth_backup';

function _sbTokenKey() {
  try {
    const ref = SUPABASE_URL.split('//')[1].split('.')[0];
    return 'sb-' + ref + '-auth-token';
  } catch (_) {
    return 'sb-gkfotrghyydydbfoakaq-auth-token';
  }
}
window.__sbTokenKey = _sbTokenKey;

async function _saveSessionBackup(session) {
  if (!session || !session.refresh_token) return;
  try {
    if (typeof IDB !== 'undefined' && IDB && IDB.set) {
      await IDB.set(AUTH_BACKUP_KEY, { session, savedAt: new Date().toISOString() });
    }
  } catch (e) { /* non-fatal */ }
}

async function _getSessionBackup() {
  try {
    if (typeof IDB !== 'undefined' && IDB && IDB.get) {
      return await IDB.get(AUTH_BACKUP_KEY);
    }
  } catch (e) { /* non-fatal */ }
  return null;
}

async function _clearSessionBackup() {
  try {
    if (typeof IDB !== 'undefined' && IDB && IDB.set) {
      await IDB.set(AUTH_BACKUP_KEY, null);
    }
  } catch (e) { /* non-fatal */ }
}

async function _restoreSessionFromBackup() {
  const backup = await _getSessionBackup();
  if (!backup || !backup.session || !backup.session.refresh_token) return false;
  try {
    localStorage.setItem(_sbTokenKey(), JSON.stringify(backup.session));
    window._uid = backup.session.user && backup.session.user.id
      ? backup.session.user.id
      : null;
    return true;
  } catch (e) {
    return false;
  }
}

// ── Boot helper — called by init.js (last defer) ──
// Module scripts execute before defer scripts, so the
// session check must be deferred to init.js where
// bootApp / showAccessDenied are defined.
window.__bootApp = async function () {
  const { data: { session } } = await _sb.auth.getSession();

  if (session?.user) {
    window._uid = session.user.id;
    _saveSessionBackup(session);
    if (typeof window.bootApp === 'function') await window.bootApp(session.user);
  } else {
    window._uid = null;
    if (typeof window.showAccessDenied === 'function') window.showAccessDenied();
  }
};

// ── Ongoing state watcher ─────────────────
// Handles token refresh (keeps long sessions alive)
// and signs out if the session is revoked from the dashboard.
_sb.auth.onAuthStateChange(async (event, session) => {
  // Any event that carries a live session — keep the backup fresh
  if (session?.user &&
      (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' ||
       event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
    window._uid = session.user.id;
    _saveSessionBackup(session);
    return;
  }

  if (event === 'SIGNED_OUT') {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

    // Offline sign-out = almost certainly a refresh that failed
    // because there is no signal (supabase-js destroys the session
    // on ANY refresh error). The server-side refresh token is still
    // valid — restore the backup and retry once we're back online.
    if (offline && (await _restoreSessionFromBackup())) {
      _recovering = true;
      console.warn('[auth] signed-out while offline — session restored from backup, will refresh on reconnect');
      return; // keep the app usable offline; do NOT wipe cache or show denied
    }

    window._uid = null;
    if (typeof clearListeners === 'function') clearListeners();
    if (typeof window.showAccessDenied === 'function') window.showAccessDenied();
  }
});

// ── Reconnect recovery ────────────────────
// If a session was restored from backup after an offline
// sign-out, retry the token refresh now that we're online.
// refreshSession() reads the (restored) session from storage
// and exchanges the refresh token server-side.
window.addEventListener('online', async () => {
  if (!_recovering) return; // normal signed-in flow already auto-refreshes
  _recovering = false;
  try {
    const { data: { session }, error } = await _sb.auth.refreshSession();
    if (!error && session?.user) {
      window._uid = session.user.id;
      if (typeof window.bootApp === 'function') await window.bootApp(session.user);
    } else if (typeof window.showAccessDenied === 'function') {
      window.showAccessDenied();
    }
  } catch (_) {
    if (typeof window.showAccessDenied === 'function') window.showAccessDenied();
  }
});

// ── Sign-out helper ───────────────────────
// Called from the logout button in the top/bottom nav.
// Clears the session backup FIRST so an intentional
// logout can never be resurrected by the offline-recovery path.
// After sign-out the admin must re-generate a magic link
// or use the Supabase dashboard to restore access.
window.authSignOut = async () => {
  await _clearSessionBackup();
  return _sb.auth.signOut();
};