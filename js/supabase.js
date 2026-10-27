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
//
// FIX: Auto-restore from IndexedDB backup on cold start when localStorage is wiped
// (common on Android PWAs). Also try refreshSession() if online.
window.__bootApp = async function () {
  let session = null;

  // 1) Try normal session from localStorage
  try {
    const res = await _sb.auth.getSession();
    session = res?.data?.session || null;
  } catch (_) {
    session = null;
  }

  // 2) If no session, try to restore from backup
  if (!session?.user) {
    try {
      const backup = await _getSessionBackup();
      if (backup?.session?.refresh_token) {
        const restored = await _restoreSessionFromBackup();
        if (restored) {
          // Re-read session after writing to localStorage
          try {
            const res2 = await _sb.auth.getSession();
            session = res2?.data?.session || null;
          } catch (_) {
            session = null;
          }

          // If still no session and online, try to refresh
          if (!session?.user && typeof navigator !== 'undefined' && navigator.onLine) {
            try {
              const r = await _sb.auth.refreshSession();
              session = r?.data?.session || null;
            } catch (_) {
              session = null;
            }
          }

          if (session?.user) {
            _recovering = (typeof navigator !== 'undefined' && navigator.onLine) ? false : true;
            try { await _saveSessionBackup(session); } catch (_) {}
          } else if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            // Offline with backup but couldn't refresh - boot from backup user using cached data
            _recovering = true;
            window._uid = backup.session.user?.id || window._uid;
            if (typeof window.bootApp === 'function' && backup.session.user) {
              try {
                await window.bootApp(backup.session.user);
              } catch (e) {
                console.warn('[auth] bootApp from backup failed:', e);
              }
              return;
            }
          }
        }
      }
    } catch (_) {
      // Non-fatal, fall through to denied
    }
  }

  if (session?.user) {
    window._uid = session.user.id;
    try { await _saveSessionBackup(session); } catch (_) {}
    if (typeof window.bootApp === 'function') {
      try {
        await window.bootApp(session.user);
        return;
      } catch (e) {
        console.warn('[auth] bootApp failed:', e);
      }
    }
  }

  window._uid = null;
  if (typeof window.showAccessDenied === 'function') {
    try { window.showAccessDenied(); } catch (_) {}
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
    // valid �?" restore the backup and retry once we're back online.
    if (offline && (await _restoreSessionFromBackup())) {
      _recovering = true;
      console.warn('[auth] signed-out while offline �?" session restored from backup, will refresh on reconnect');
      // If the access-denied screen is already visible (race with __bootApp), boot from backup
      try {
        const accessDeniedEl = typeof document !== 'undefined' ? document.getElementById('accessDenied') : null;
        if (accessDeniedEl && accessDeniedEl.style.display !== 'none') {
          const backup = await _getSessionBackup();
          const user = backup?.session?.user || null;
          if (user && typeof window.bootApp === 'function') {
            window._uid = user.id;
            try { await window.bootApp(user); } catch (_) {}
            return;
          }
        }
      } catch (_) {}
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
  if (!_recovering) {
    // Even if not marked recovering, try to rescue if stuck on denied screen with backup
    try {
      const accessDeniedEl = typeof document !== 'undefined' ? document.getElementById('accessDenied') : null;
      if (accessDeniedEl && accessDeniedEl.style.display !== 'none') {
        // Check if we have a session now
        let session = null;
        try {
          const res = await _sb.auth.getSession();
          session = res?.data?.session || null;
        } catch (_) {}
        if (session?.user) {
          window._uid = session.user.id;
          try { await _saveSessionBackup(session); } catch (_) {}
          if (typeof window.bootApp === 'function') {
            try { await window.bootApp(session.user); return; } catch (_) {}
          }
        } else {
          // Try backup
          try {
            const backup = await _getSessionBackup();
            if (backup?.session?.refresh_token) {
              const restored = await _restoreSessionFromBackup();
              if (restored) {
                try {
                  const r2 = await _sb.auth.refreshSession();
                  if (r2?.data?.session?.user) {
                    window._uid = r2.data.session.user.id;
                    try { await _saveSessionBackup(r2.data.session); } catch (_) {}
                    if (typeof window.bootApp === 'function') {
                      try { await window.bootApp(r2.data.session.user); return; } catch (_) {}
                    }
                  }
                } catch (_) {}
              }
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
    return; // normal signed-in flow already auto-refreshes
  }
  _recovering = false;
  try {
    const { data: { session }, error } = await _sb.auth.refreshSession();
    if (!error && session?.user) {
      window._uid = session.user.id;
      try { await _saveSessionBackup(session); } catch (_) {}
      if (typeof window.bootApp === 'function') {
        try { await window.bootApp(session.user); return; } catch (_) {}
      }
    }
  } catch (_) {}
  // If still stuck, try one more time to boot from backup if present
  try {
    const backup = await _getSessionBackup();
    if (backup?.session?.user && typeof window.bootApp === 'function') {
      const accessDeniedEl = typeof document !== 'undefined' ? document.getElementById('accessDenied') : null;
      if (accessDeniedEl && accessDeniedEl.style.display !== 'none') {
        window._uid = backup.session.user.id;
        try { await window.bootApp(backup.session.user); return; } catch (_) {}
      }
    }
  } catch (_) {}
  if (typeof window.showAccessDenied === 'function') {
    try { window.showAccessDenied(); } catch (_) {}
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