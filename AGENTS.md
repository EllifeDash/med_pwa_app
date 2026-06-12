# MediAssist Pro — AGENTS.md

Part of the Nankana Home Care 3-tier ecosystem. This is **Tier 2** (offline-first PWA for medical assistants).

No build step, no package.json, no npm, no framework. Direct file editing — refresh browser.

## No lint / typecheck / test commands exist

Edit files, reload browser, done. Zero tooling.

## Supabase credentials go in `js/supabase.js`

Lines 20-21. Placeholder tokens (`YOUR_SUPABASE_URL`, `YOUR_SUPABASE_ANON_KEY`). Not `.env` (no build process). Use the anon/public key only — never the service_role key.

## No login UI

Admin creates users in Supabase Dashboard → Authentication → Users → Add user. Email + magic link only. No sign-up form in the app.

## Script load order (enforced by `index.html`)

1. `supabase.js` — ES module (runs first per browser spec)
2. `db.js`, `utils.js`, `ui.js`, `nav.js`, `dashboard.js`, `patients.js`, `pending-patients.js`, `history.js`, `visits.js`, `receipt.js`, `report.js`, `settings.js`, `offline.js`, `bookings.js`, `init.js` — all `defer` in this exact order
3. Inline micro-script — swipe-back, ripple, toast

`init.js` must be the LAST defer — it exposes `bootApp()` / `showAccessDenied()` to `window.*`.

## Adding a new JS file

1. Add to `SHELL` array in `sw.js` (cache-first requires it)
2. Add `<script defer src="js/yourfile.js">` **before** `init.js` in `index.html`
3. Bump cache version in `sw.js` (currently `mediassist-v3.3`)

## Adding a new page

1. `div#pg-{name}` in `index.html`
2. Add `'{name}'` to `pages[]` in `nav.js`
3. Add `case pg === '{name}': renderFn()` in `go()` in `nav.js`
4. Add `'{name}': 'backDestination'` to `_backMap` in the inline micro-script
5. (optional) Add nav buttons with `data-pg="{name}"`

## Module architecture details

- **`supabase.js`** (module) — creates Supabase client, checks session, calls `bootApp()` or `showAccessDenied()`
- **`db.js`** — data layer. Three-level read: `window._cache` → Supabase (saves to IDB) → IDB fallback. Getters: `gSet()`, `gPts()`, `gVis()`, `gSvc()`, `gHistNotes()`
- **`offline.js`** — queue + sync. `addToOfflineQueue()`, `syncOfflineQueue()`, `refreshAllData()`
- **`bookings.js`** — appointments with concurrency-safe `updateAppointment()` ("First Responder Wins" via `.eq('status','pending')`), WhatsApp URL builder. `handleAccept()` now stages an inactive patient row (`is_active: false`) with the booking ref.
- **`pending-patients.js`** — renders staged inactive patients below the Bookings page list. Provides `openPendingPatient()` (→ Add Visit pre-fill) and `discardPendingPatient()` (delete from DB + cache).
- **`visits.js`** — `saveVisit()` flips `is_active: true` on staged patients after successful save. `prefillFromPendingPatient()` fills the form from a staged record.

## Critical: `_teardownChannels()` ≠ `clearListeners()`

- `_teardownChannels()` — removes Realtime WebSocket subscriptions, **preserves** `window._cache`
- `clearListeners()` — tears down channels **and wipes** `window._cache`. Called only on sign-out
- `setupListeners()` uses `_teardownChannels()` — safe to call repeatedly without losing cached data

## Reconnect order (offline.js)

`online` event → `syncOfflineQueue()` → `refreshAllData()` → `setupListeners()` AFTER data fetch

## Service Worker

- Cache version: `mediassist-v3.3` in `sw.js` — bump on any file change to force re-cache
- `Promise.allSettled()` install (one CDN failure doesn't abort)
- Supabase API (`*.supabase.co`, `*.supabase.com`) — network-only; offline returns `{data:null, error:{message:'Offline'}}`
- App shell / JS / CDN libs — cache-first
- Google Fonts — network-first with cache fallback

## Running locally

```
python -m http.server 5500
# or npx serve .  or VS Code Live Server
```

Never via `file://` (breaks modules, service worker).

## Deployment

GitHub → Netlify. No build command. Publish directory = `.`. Auto-deploys on push.

## Supabase tables

`settings` (1 row/user), `patients` (has `is_active BOOLEAN DEFAULT true`, `booking_ref TEXT`), `visits` (services as JSONB), `services`, `hist_notes`, `appointments`. All have RLS `WHERE auth.uid() = user_id`. Auto `user_id` INSERT trigger.

## VS Code setting

`.vscode/settings.json` enables Deno extension (`deno.enable: true`). This is intentional — do not disable it.

## Default service seeds (10 items)

Hardcoded in `db.js` as `DEFAULT_SVC`. Auto-seeded on first login if the services table is empty.

## Offline IDB keys (unchanged from v2)

`ma_cache_settings`, `ma_cache_patients`, `ma_cache_visits`, `ma_cache_services`, `ma_offline_queue`, `ma_docs_{patientId}`. DB name: `mediassist_docs` (backward compat — do not rename).
