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
// ════════════════════════════════════════

import { createClient }
  from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ─────────────────────────────────────────
// ⚠️  REPLACE WITH YOUR SUPABASE CREDENTIALS
// Supabase Dashboard → Project Settings → API
// ─────────────────────────────────────────
const SUPABASE_URL      = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

const _sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Expose client globally — all deferred scripts use window.SB
window.SB   = _sb;
window._uid = null;

// ── Silent session check on every page load ──
// getSession() reads the token from localStorage instantly —
// no network round-trip, no flicker.
// bootApp / showAccessDenied are defined in init.js (deferred,
// already executed by the time this async callback runs).

(async () => {
  const { data: { session } } = await _sb.auth.getSession();

  if (session?.user) {
    window._uid = session.user.id;
    await window.bootApp(session.user);
  } else {
    window._uid = null;
    window.showAccessDenied();
  }
})();

// ── Ongoing state watcher ─────────────────
// Handles token refresh (keeps long sessions alive)
// and signs out if the session is revoked from the dashboard.
_sb.auth.onAuthStateChange(async (event, session) => {
  if (event === 'TOKEN_REFRESHED' && session?.user) {
    // Token silently refreshed — nothing visible needed
    window._uid = session.user.id;
    return;
  }
  if (event === 'SIGNED_OUT') {
    window._uid = null;
    if (typeof clearListeners === 'function') clearListeners();
    window.showAccessDenied();
  }
});

// ── Sign-out helper ───────────────────────
// Called from the logout button in the top/bottom nav.
// After sign-out the admin must re-generate a magic link
// or use the Supabase dashboard to restore access.
window.authSignOut = () => _sb.auth.signOut();
