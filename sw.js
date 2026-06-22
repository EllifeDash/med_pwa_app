// ════════════════════════════════════════
// sw.js — Service Worker
// FIX: Supabase CDN library is now cached
//      in the app shell so the app loads
//      fully offline after first visit.
//
// Strategy:
//   App shell + CDN libs → cache-first
//   Supabase REST API    → network-only
//   Navigation fallback  → index.html
// ════════════════════════════════════════

const CACHE   = 'mediassist-v3.7';
const CDN_SB  = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const CDN_H2C = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';

// Pre-cache the full app shell INCLUDING the Supabase library.
// Everything in this list is served from cache when offline.
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
  './js/pending-patients.js',
  './js/history.js',
  './js/visits.js',
  './js/receipt.js',
  './js/settings.js',
  './js/report.js',
  './js/offline.js',
  './js/init.js',
  './js/bookings.js',
  CDN_SB,   // ← critical: Supabase JS library cached here
  CDN_H2C,  // ← html2canvas for receipts offline
];

// ── Install: pre-cache shell ───────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(err => {
        // Partial failure (e.g. CDN unreachable during first install)
        // is acceptable — cache what we can and continue.
        console.warn('[SW] Pre-cache partial failure:', err);
        return self.skipWaiting();
      })
  );
});

// ── Activate: purge old caches ─────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for shell/CDN,
//           network-only for Supabase API ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always network for Supabase REST / Auth / Realtime
  // (data must be live; offline handled by IDB fallback in db.js)
  if (
    url.hostname.endsWith('.supabase.co') ||
    url.hostname.endsWith('.supabase.com')
  ) {
    e.respondWith(
      fetch(e.request).catch(() => new Response(
        JSON.stringify({ data: null, error: { message: 'Offline' } }),
        { headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // Google Fonts — network with cache fallback
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        fetch(e.request)
          .then(res => { cache.put(e.request, res.clone()); return res; })
          .catch(() => cache.match(e.request))
      )
    );
    return;
  }

  // Everything else (app shell + CDN libs): cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      // Not cached yet — fetch and cache it
      return fetch(e.request).then(res => {
        if (e.request.method === 'GET' && res.status === 200) {
          const cc = res.clone();
          caches.open(CACHE).then(c => { try { c.put(e.request, cc); } catch (_) {} }).catch(() => {});
        }
        return res;
      }).catch(() => {
        // Offline fallback for page navigations
        if (e.request.mode === 'navigate')
          return caches.match('./index.html');
      });
    })
  );
});

// ── Skip waiting on update + Notifications ─
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'new_booking') {
    self.registration.showNotification(e.data.title, {
      body: e.data.body,
      tag: e.data.tag || 'new-booking',
      icon: './manifest.json',
      badge: './manifest.json',
      data: { url: '/' },
      vibrate: [200, 100, 200],
    });
  }
});

// ── Handle notification click ──────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        const client = clientList[0];
        client.focus();
        client.postMessage({ type: 'navigate', page: 'bookings' });
      } else {
        clients.openWindow('/');
      }
    })
  );
});
