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
const SUPABASE_URL      = 'https://gkfotrghyydydbfoakaq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrZm90cmdoeXlkeWRiZm9ha2FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNzk4MzEsImV4cCI6MjA5Mjg1NTgzMX0.sXZRa4tO8AkUQ-Sn34rqjatlLCXbt7dRrdi9qcq1-Lc';

const _sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Expose client globally — all deferred scripts use window.SB
window.SB   = _sb;
window._uid = null;

// ── Boot helper — called by init.js (last defer) ──
// Module scripts execute before defer scripts, so the
// session check must be deferred to init.js where
// bootApp / showAccessDenied are defined.
window.__bootApp = async function () {
  const { data: { session } } = await _sb.auth.getSession();

  if (session?.user) {
    window._uid = session.user.id;
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
  if (event === 'TOKEN_REFRESHED' && session?.user) {
    // Token silently refreshed — nothing visible needed
    window._uid = session.user.id;
    return;
  }
  if (event === 'SIGNED_OUT') {
    window._uid = null;
    if (typeof clearListeners === 'function') clearListeners();
    if (typeof window.showAccessDenied === 'function') window.showAccessDenied();
  }
});

// ── Sign-out helper ───────────────────────
// Called from the logout button in the top/bottom nav.
// After sign-out the admin must re-generate a magic link
// or use the Supabase dashboard to restore access.
window.authSignOut = () => _sb.auth.signOut();
