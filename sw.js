// ════════════════════════════════════════
// sw.js — Service Worker
// Cache-first for app shell (HTML/CSS/JS).
// Network-only for Supabase API calls.
// Enables offline app loading.
// ════════════════════════════════════════

const CACHE = 'mediassist-v5.5';

const SHELL = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/supabase.js',
  './js/db.js',
  './js/utils.js',
  './js/ui.js',
  './js/nav.js',
  './js/dashboard.js',
  './js/patients.js',
  './js/history.js',
  './js/visits.js',
  './js/receipt.js',
  './js/settings.js',
  './js/report.js',
  './js/offline.js',
  './js/init.js',
];

// ── Install: pre-cache app shell ───────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: remove old caches ────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch strategy ─────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always go network for Supabase API, auth, CDN scripts
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabase.com') ||
    url.hostname.includes('cdn.jsdelivr.net') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('gstatic.com')
  ) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Cache-first for everything else (app shell)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Cache successful GET responses
        if (e.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (e.request.mode === 'navigate')
          return caches.match('./index.html');
      });
    })
  );
});

// ── Skip waiting on message ────────────
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
