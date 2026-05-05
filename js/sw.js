// ════════════════════════════════════════
// sw.js — Service Worker  (v3)
//
// FIX: Uses Promise.allSettled instead of
//      caches.addAll so a single CDN failure
//      does NOT abort the entire install.
//      Each file is cached independently.
//      App shell + Supabase CDN lib are
//      cached; Supabase REST API is always
//      network-only (data lives in IDB).
// ════════════════════════════════════════

const CACHE = 'mediassist-v3';

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
  // CDN libs — cached so app loads fully offline
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
];

// ── Install ────────────────────────────
// Cache each file individually with allSettled — a single
// failure (e.g. CDN slow at install time) does NOT abort
// the rest. The failed resource will be re-fetched on demand.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(async cache => {
      const results = await Promise.allSettled(
        SHELL.map(url =>
          cache.add(url).catch(err => {
            console.warn('[SW] Could not cache:', url, err.message);
          })
        )
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed) console.warn(`[SW] ${failed} resource(s) not cached at install time`);
      return self.skipWaiting();
    })
  );
});

// ── Activate ───────────────────────────
// Delete every cache that isn't the current version.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ──────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // ① Supabase REST / Auth / Realtime → always network.
  //   On failure return a valid JSON error body so the app's
  //   try/catch in db.js handles it gracefully.
  if (
    url.hostname.endsWith('.supabase.co') ||
    url.hostname.endsWith('.supabase.com')
  ) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          JSON.stringify({ data: null, error: { message: 'offline' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // ② Everything else → cache-first, with network fallback.
  //   On network success the response is added to cache so it
  //   is available offline on future visits.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request)
        .then(response => {
          if (event.request.method === 'GET' && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE).then(c => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline and not in cache — return shell for navigation requests
          if (event.request.mode === 'navigate')
            return caches.match('./index.html');
          // For other requests (fonts etc.) return empty 503
          return new Response('', { status: 503 });
        });
    })
  );
});

// ── Message ────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
