# MediAssist Pro — AGENTS.md

Part of the Nankana Home Care 3-tier ecosystem. This is **Tier 2** (offline-first PWA for medical assistants).

No build step, no package.json, no npm, no framework. Direct file editing — refresh browser.

## No lint / typecheck / test commands exist

Edit files, reload browser, done. Zero tooling.

## Supabase credentials go in `js/supabase.js`

Lines 20-21. Already has real credentials committed (gitignored `.env` — but creds are hardcoded here since there's no build step). Use the anon/public key only — never the service_role key.

## No login UI

Admin creates users in Supabase Dashboard → Authentication → Users → Add user. Email + magic link only. No sign-up form in the app. Session checked silently via `getSession()` on load. `bootApp()` on success, `showAccessDenied()` on failure.

## Script load order (enforced by `index.html`)

1. `supabase.js` — ES module (runs first per browser spec). Exposes `window.SB`, `window._uid`, `window.__bootApp()`.
2. `db.js`, `utils.js`, `ui.js`, `nav.js`, `dashboard.js`, `patients.js`, `pending-patients.js`, `history.js`, `visits.js`, `receipt.js`, `report.js`, `offline.js`, `settings.js`, `bookings.js`, `init.js` — all `defer` in this exact order
3. `html2canvas` CDN (defer) — for receipt image export
4. Inline micro-script — ripple, toast, swipe-back gesture

`init.js` must be the LAST defer — it exposes `bootApp()` / `showAccessDenied()` to `window.*` and calls `window.__bootApp()` at module bottom (line 117). `bootApp()` calls `setupListeners()` then fetches data — this is the startup order. Reconnect order (offline.js) is reversed: data fetch → `setupListeners()`.

## Adding a new JS file

1. Add to `SHELL` array in `sw.js` (includes CDN URLs `CDN_SB`, `CDN_H2C` which are cache-first)
2. Add `<script defer src="js/yourfile.js">` **before** `init.js` in `index.html`
3. Bump cache version in `sw.js` (currently `mediassist-v3.5`)

## Adding a new page

1. `div#pg-{name}` in `index.html`
2. Add `'{name}'` to `pages[]` in `nav.js`
3. Add `case pg === '{name}': renderFn()` in `go()` in `nav.js`
4. Add `'{name}': 'backDestination'` to `_backMap` in the inline micro-script
5. (optional) Add nav buttons with `data-pg="{name}"`

## Module architecture details

- **`supabase.js`** (module) — creates Supabase client (`createClient` from CDN ESM), checks session via `getSession()`, drives `onAuthStateChange` (handles `TOKEN_REFRESHED` and `SIGNED_OUT`). Calls `clearListeners()` on sign-out.
- **`db.js`** — data layer. Three-level read: `window._cache` → Supabase (saves to IDB) → IDB fallback. Getters: `gSet()`, `gPts()`, `gVis()`, `gSvc()`, `gHistNotes()`, `gDocs(pid)`. IDB database name: `mediassist_docs` (backward compat — do not rename). Stores: `kv` (versions 1→2 unified store). `setupListeners()` creates Realtime subscriptions on `patients` and `visits` tables filtered by `user_id`.
- **`patients.js`** — patient list filters out `is_active === false`. `deletePatient()` cascade-deletes associated visits and docs.
- **`offline.js`** — queue + sync. `addToOfflineQueue()`, `syncOfflineQueue()`, `refreshAllData()`. `online` event → `syncOfflineQueue()` → `refreshAllData()` → `renderBookings(true)`. `offline` event calls `_teardownChannels()`. Visit IDB key: `ma_offline_queue`.
- **`bookings.js`** — appointments with concurrency-safe `updateAppointment()` ("First Responder Wins" via `.eq('status','pending')` — if `count===0` another assistant claimed it). WhatsApp URL builder (`buildWhatsAppURL()`). `handleAccept()` stages an inactive patient row (`is_active: false`) with the booking ref via `patients` upsert. Realtime channel on `appointments` table (global, no user_id filter — all assistants see all bookings). Push notifications via Service Worker `postMessage({type:'new_booking',...})`.
- **`pending-patients.js`** — renders staged inactive patients in `#pendingPatientsSection` (inside `#pg-dashboard`, NOT on the Bookings page). Provides `openPendingPatient()` (→ Add Visit pre-fill) and `discardPendingPatient()` (delete from DB + cache). Also called from `renderBookings()` (line 302).
- **`visits.js`** — `saveVisit()` flips `is_active: true` on staged patients after successful save. Offline branch adds `_pendingActivate` flag. `prefillFromPendingPatient()` fills the form from a staged record.
- **`history.js`** — handles patient profile photos (`handlePatientPhoto` stores base64 in IDB), documents (PDF/images stored locally in IDB keyed `ma_docs_{pid}`), medical history notes (`hist_notes` table — not cached offline).
- **`init.js`** — `bootApp()` populates welcome screen from settings, pre-fills today's date/time on visit form. `showAccessDenied()` shows locked screen + hides app. `enterApp()` requests notification permission, listens for SW navigation messages.

## Critical: `_teardownChannels()` ≠ `clearListeners()`

- `_teardownChannels()` — removes Realtime WebSocket subscriptions, **preserves** `window._cache`
- `clearListeners()` — tears down channels **and wipes** `window._cache`. Called only on sign-out (`supabase.js` → `SIGNED_OUT` event)
- `setupListeners()` uses `_teardownChannels()` — safe to call repeatedly without losing cached data

## Reconnect order (offline.js)

`online` event → `syncOfflineQueue()` → `refreshAllData()` (wipes cache slots, fetches fresh, calls `setupListeners()` AFTER data fetch) → `renderBookings(true)`.

## Service Worker

- Cache version: `mediassist-v3.5` in `sw.js` — bump on any file change to force re-cache
- `caches.open(CACHE).then(c => c.addAll(SHELL))` (NOT `Promise.allSettled()` as documented before — install failure `catch` handles partial failure)
- `SHELL` array includes `'./'`, `'./index.html'`, `'./style.css'`, `'./manifest.json'`, all `./js/*.js`, `CDN_SB` (Supabase ESM), `CDN_H2C` (html2canvas)
- Supabase API (`*.supabase.co`, `*.supabase.com`) — network-only; offline returns `{data:null, error:{message:'Offline'}}`
- App shell / JS / CDN libs — cache-first
- Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) — network-first with cache fallback
- Navigation fallback — `caches.match('./index.html')`
- `message` event handles `SKIP_WAITING` and `new_booking` push notification

## Running locally

```
python -m http.server 5500
# or npx serve .  or VS Code Live Server
```

Never via `file://` (breaks modules, service worker).

## Deployment

GitHub → Netlify. No build command. Publish directory = `.`. Auto-deploys on push.

## Supabase tables

`settings` (1 row/user, auto-defaults), `patients` (has `is_active BOOLEAN DEFAULT true`, `booking_ref TEXT`), `visits` (services as JSONB), `services` (auto-seeded from `DEFAULT_SVC` on first login), `hist_notes`, `appointments`. All have RLS `WHERE auth.uid() = user_id`. Auto `user_id` INSERT trigger. `appointments` has NO user_id filter — global to all assistants.

## VS Code setting

`.vscode/settings.json` enables Deno extension (`deno.enable: true`). This is intentional — do not disable it (improves JS intellisense).

## Default service seeds (10 items)

Hardcoded in `db.js` as `DEFAULT_SVC`. Auto-seeded on first login if the services table returns empty.

## Offline IDB keys

`ma_cache_settings`, `ma_cache_patients`, `ma_cache_visits`, `ma_cache_services`, `ma_offline_queue`, `ma_docs_{patientId}`. DB name: `mediassist_docs` (backward compat — do not rename). IndexedDB version: 2 (single `kv` store).

## Settings row defaults

`DEFAULT_SET` in `db.js` — `name:'Medical Attendant'`, `rank:'Home Care Professional'`, `businessName:'MediAssist Pro'`, `tagline:'Your Mobile Medical Companion'`, `phone`, `address` empty, `photo`, `logo` empty string.

## Profile photos & logos

Stored as base64 strings in the `settings` row (`photo`, `logo` fields). Not in Supabase storage — saved directly to the `settings` table text column. Documents (PDFs/images) stored in IDB `ma_docs_{pid}`.

## Booking concurrency

`updateAppointment()` uses `.eq('status', 'pending')` in the update filter. If another assistant already actioned it, `count === 0` and a "claimed by another assistant" toast is shown. Only pending bookings show Accept/Reject/Reschedule buttons.

## Stale file reference

`README.md` mentions `js/books.js` as "(in development)" — this file does not exist and was never created.
