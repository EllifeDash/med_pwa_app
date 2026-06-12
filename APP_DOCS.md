# MediAssist Pro — Technical Reference

Internal developer reference. Assumes you have read the README.

---

## Contents

1. [Architecture](#1-architecture)
2. [File Map & Load Order](#2-file-map--load-order)
3. [Auth & Offline Boot](#3-auth--offline-boot)
4. [Data Layer (db.js)](#4-data-layer-dbjs)
5. [Offline Queue (offline.js)](#5-offline-queue-offlinejs)
6. [Service Worker (sw.js)](#6-service-worker-swjs)
7. [Database Schema](#7-database-schema)
8. [Pages & Routing](#8-pages--routing)
9. [Key Functions Reference](#9-key-functions-reference)
10. [CSS Tokens](#10-css-tokens)
11. [Adding a Feature](#11-adding-a-feature)
12. [Known Limitations](#12-known-limitations)

---

## 1. Architecture

```
Browser
  ├── Service Worker (sw.js)
  │     ├── App shell → cache-first (HTML, CSS, JS, CDN libs)
  │     ├── Supabase API → network, fail-safe offline response
  │     └── Notifications → receives `new_booking` message from main thread,
  │                         shows browser notification, click → focus + navigate
  │
  ├── supabase.js [module]
  │     ├── Reads JWT from localStorage (getSession — no network)
  │     ├── Online:  session found → bootApp()
  │     ├── Offline: stored UID found → bootApp() from IDB
  │     └── Neither: showAccessDenied()
  │
  ├── db.js [defer]
  │     ├── window._cache  — in-memory (fastest read)
  │     ├── Supabase fetch — writes result to IDB
  │     └── IDB fallback   — used when offline
  │
  ├── bookings.js [defer]
  │     ├── Supabase Realtime channel (`appointments_feed`) for live INSERT/UPDATE/DELETE
  │     ├── In-memory cache (`window._cache.appointments`)
  │     ├── On INSERT: toast + postMessage to Service Worker
  │     └── Accept → update DB + open WhatsApp confirmation via wa.me
  │
  └── offline.js [defer]
        ├── Queues visits in IDB when offline (navigator.onLine)
        ├── Auto-syncs queue on window 'online' event
        └── Calls refreshAllData() to pull fresh data from Supabase
```

**Key design decisions:**
- `setupListeners()` calls `_teardownChannels()` (not `clearListeners()`) so Supabase realtime channels restart without wiping the in-memory cache.
- `clearListeners()` is only called on explicit sign-out.
- `SIGNED_OUT` auth event is ignored when offline — prevents a failed token refresh from locking out an offline user.
- IDB database name stays `mediassist_docs` (v2) for backward compatibility with existing document blobs.

---

## 2. File Map & Load Order

```
supabase.js      [module]  — runs FIRST per HTML spec (modules before defer)
db.js            [defer]
utils.js         [defer]
ui.js            [defer]
nav.js           [defer]
dashboard.js     [defer]
patients.js      [defer]
pending-patients.js [defer]  — Pending patient staging, rendering, discard
history.js       [defer]
visits.js        [defer]    — prefillFromPendingPatient() + is_active flip
receipt.js       [defer]
report.js        [defer]
bookings.js      [defer]    — handleAccept() now stages inactive patient
settings.js      [defer]
offline.js       [defer]
init.js          [defer]    — LAST; exposes bootApp/showAccessDenied to window.*
html2canvas      [defer]    — CDN, receipt image export
micro-script     [inline]   — ripple, toast, swipe-back gesture
```

---

## 3. Auth & Offline Boot

### Boot sequence
Deferred scripts (including `init.js`) execute **before** any `DOMContentLoaded` callback. The session check is triggered by `init.js` (the last defer) via `window.__bootApp()` defined in `supabase.js`.

### Online boot
```
init.js → __bootApp() → getSession() → session.user exists
  → window._uid = user.id
  → saveUid(uid)      ← persists to localStorage for offline use
  → bootApp(user)
```

### Offline boot
```
init.js → __bootApp() → getSession() → no session (or throws)
  → navigator.onLine === false
  → loadUid() from localStorage → uid found
  → window._uid = storedUid
  → bootApp({ id: storedUid })  ← data loaded from IDB
```

### `bootApp(user)` sequence
1. `_teardownChannels()` + `setupListeners()` (skipped silently if offline)
2. `gSet()` → settings from Supabase or IDB
3. `gSvc()` → services from Supabase or IDB default
4. Populate welcome screen with name, rank, photo, logo
5. Hide `#accessDenied`, show `#ws`

### Token lifetimes
- Access token: 1 hour (auto-refreshed by Supabase client)
- Refresh token: 7 days inactivity

---

## 4. Data Layer (db.js)

### Read pattern — every accessor

```
gPts() {
  1. window._cache.patients.length > 0  → return cache (fastest)
  2. navigator.onLine                   → SB.from('patients').select()
                                           → IDB.set(IDB_PATIENTS, data)  ← persist
                                           → return data
  3. offline fallback                   → IDB.get(IDB_PATIENTS)
                                           → return cached || []
}
```

Same pattern for `gSet()`, `gVis()`, `gSvc()`.

### IDB keys

| Key | Contents |
|---|---|
| `ma_cache_settings` | Settings object |
| `ma_cache_patients` | Patients array |
| `ma_cache_visits` | Visits array |
| `ma_cache_services` | Services array |
| `ma_offline_queue` | Queued offline visits |
| `ma_docs_{patientId}` | Base64 document blobs |

### Channel management

| Function | What it does |
|---|---|
| `_teardownChannels()` | Removes WebSocket subscriptions. **Does NOT wipe cache.** |
| `clearListeners()` | Calls `_teardownChannels()` + wipes `window._cache`. Called on sign-out only. |
| `setupListeners()` | Calls `_teardownChannels()`, then starts fresh channels if online. |

---

## 5. Offline Queue (offline.js)

### Visit save (visits.js)
```
saveVisit()
  │
  ├─ navigator.onLine ──▶ SB upsert patient + insert visit
  │                        → update window._cache optimistically
  │
  └─ offline          ──▶ addToOfflineQueue({ pt, v })
                           → window._cache updated (receipt preview works)
                           → toast "Saved offline"
```

### Sync on reconnect (window 'online' event)
```
1. syncOfflineQueue()    — iterates queue, upserts to Supabase, removes synced items
2. refreshAllData()      — clears _cache slots, re-fetches from Supabase,
                           calls setupListeners() AFTER data is in memory
```

### refreshAllData() order
The cache slots are cleared one at a time before each fetch, **not** all at once before any fetch. This means a partial network failure leaves the old cached values intact rather than leaving the app with empty data.

---

## 6. Service Worker (sw.js)

**Cache version:** `mediassist-v3`

**Install strategy:** `Promise.allSettled()` over individual `cache.add()` calls. A single CDN failure does not abort the install — other files are still cached.

**Fetch strategies:**

| Request | Strategy |
|---|---|
| `*.supabase.co` / `*.supabase.com` | Network-only. On failure returns `{data:null, error:{message:'offline'}}` |
| App shell, JS files, CDN libs | Cache-first. On network success, response is added to cache. |
| Navigation (page load) | Cache-first → fall back to `index.html` |
| Google Fonts | Network-first with cache fallback |

**CDN libs cached at install:**
- `cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`
- `cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js`

### Push Notifications

The SW handles `message` events of type `new_booking` sent from the main thread's Supabase Realtime handler. On receipt it calls `showNotification()` with the patient name and service. 

The `notificationclick` handler focuses the existing app window and posts a `navigate: 'bookings'` message back, which `init.js` catches and routes to the Bookings page.

Notifications require `Notification.requestPermission()` — called once in `enterApp()`.

---

## 7. Database Schema

### Tables overview

| Table | PK | Purpose |
|---|---|---|
| `settings` | `user_id` UUID | One row per user — profile, branding |
| `patients` | `id` TEXT | Patient records — has `is_active` (bool) and `booking_ref` (text) columns |
| `visits` | `id` TEXT | Visit records — `services` is JSONB |
| `services` | `id` TEXT | Per-user service catalogue (`"${uid}_${svcId}"`) |
| `hist_notes` | `id` TEXT | Medical history notes per patient |
| `appointments` | `id` UUID | Public booking requests — INSERT allowed by anon RLS |

All tables except `appointments`: `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`

`appointments` columns: `id`, `created_at`, `patient_name`, `patient_phone`, `patient_age`, `patient_gender`, `patient_address`, `requested_service`, `preferred_date`, `preferred_time`, `notes`, `status` (default `'pending'`), `admin_comment`, `handled_by`, `handled_at`.

### Patients table extra columns

| Column | Type | Default | Purpose |
|---|---|---|---|
| `is_active` | `BOOLEAN` | `true` | Soft-active flag. `false` = staged from booking, not yet completed. Filtered out of the main Patients page; shown under Pending Patients on the Bookings page. |
| `booking_ref` | `TEXT` | `NULL` | The `appointments.id` from which this patient was staged. Set only for inactive/staged records. |

### RLS policy (on all 5 internal tables)
```sql
FOR ALL
USING      (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id)
```

### Appointments RLS (public INSERT only)
```sql
CREATE POLICY "Public can insert appointments"
ON public.appointments FOR INSERT
TO anon WITH CHECK (true);
```

### Auto user_id trigger
```sql
CREATE FUNCTION set_user_id() ... NEW.user_id := auth.uid() ...
BEFORE INSERT ON patients, visits, services, hist_notes
```

---

## 8. Pages & Routing

Pages are `div#pg-{name}` elements. Only one visible at a time.

```js
go(pg, btn)  // nav.js — shows page, updates nav .on class, calls render fn
```

| Page | Render function | Back destination |
|---|---|---|
| `dashboard` | `renderDash()` (KPIs + `renderDashBookings()`) | — |
| `patients` | `renderPatients()` — filters out `is_active === false` | dashboard |
| `bookings` | `renderBookings()` (full filter + expand/collapse) + `renderPendingPatients()` below | dashboard |
| `addVisit` | `renderSvcTags()` + optional `prefillFromPendingPatient()` | dashboard |
| `history` | `openHistory(pid)` | patients |
| `report` | `initReport()` | dashboard |
| `settings` | `renderSettings()` | dashboard |

Swipe-back gesture reads `_backMap` in the micro-script inline block.

---

## 9. Key Functions Reference

| Function | File | Notes |
|---|---|---|
| `bootApp(user)` | init.js | Entry point after auth confirmed |
| `showAccessDenied()` | init.js | Lock screen — no form |
| `enterApp()` | init.js | Welcome → Dashboard + `Notification.requestPermission()` |
| `setupListeners()` | db.js | Start realtime channels; safe to call multiple times |
| `clearListeners()` | db.js | Sign-out only — wipes cache |
| `syncOfflineQueue()` | offline.js | Flush IDB queue to Supabase |
| `refreshAllData()` | offline.js | Re-fetch all data on reconnect |
| `saveVisit()` | visits.js | Online or offline save |
| `addToOfflineQueue(item)` | offline.js | Queue `{pt, v}` in IDB |
| `exportCSV()` | utils.js | Download all visits as CSV |
| `shareWhatsApp()` | receipt.js | Open `wa.me` with text receipt |
| `renderReport()` | report.js | Monthly summary — re-runs on month-picker change |
| `saveReportImage()` | report.js | html2canvas capture of `#reportContent` → JPEG download |
| `setDashRange(r, btn)` | dashboard.js | Update filter pill + re-render dashboard |
| `applyCustomRange()` | dashboard.js | Validate & apply custom date range |
| `renderDashBookings()` | dashboard.js | Render pending bookings list below dashboard KPIs |
| `renderBookings(force)` | bookings.js | Full bookings page — filters, expand/collapse, accept/reject |
| `handleAccept(id)` | bookings.js | Accept booking → stage inactive patient row → update DB → open WhatsApp confirmation |
| `updateAppointment(id, action)` | bookings.js | Concurrency-safe status update (pending → accepted/rejected/rescheduled) |
| `listenToAppointments(cb)` | bookings.js | Supabase Realtime channel for appointments table |
| `buildWhatsAppURL(appt, name)` | bookings.js | Build wa.me link with confirmation message |
| **`renderPendingPatients()`** | pending-patients.js | Render staged inactive patients below the bookings list |
| **`openPendingPatient(id)`** | pending-patients.js | Navigate to Add Visit with pre-filled data from a staged patient |
| **`discardPendingPatient(id)`** | pending-patients.js | Delete a staged patient from DB + cache |
| **`getPendingPatients()`** | pending-patients.js | Filter `_cache.patients` for `is_active === false` |
| **`prefillFromPendingPatient(pt)`** | visits.js | Fill Add Visit form fields from a staged patient object, show banner |

---

## 10. CSS Tokens

```css
/* Colour */
--p:   #0f4c75   /* Primary */
--pl:  #1b6ca8   /* Primary light */
--ac:  #00b4d8   /* Accent */
--ok:  #10b981   /* Success */
--err: #ef4444   /* Error */
--warn:#f59e0b   /* Warning */
--bg:  #eef2f7   /* Page background */
--sur: #ffffff   /* Surface */

/* Motion */
--dur:  220ms
--ease: cubic-bezier(.4, 0, .2, 1)

/* Elevation */
--sh:  0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(15,76,117,.08)
--shm: (medium — cards on hover)
--shl: (large — modals)

/* Radius */
--rs: 10px  --r: 12px  --rl: 20px  --rxl: 28px
```

---

## 11. Adding a Feature

1. **HTML** — add page `div#pg-{name}` or modal to `index.html`
2. **CSS** — use existing tokens; no new colour vars unless necessary
3. **JS** — new file in `js/` or extend existing module
4. **Routing** — add to `pages[]` in `nav.js`, wire `go()` to render fn
5. **Swipe-back** — add to `_backMap` in inline micro-script
6. **Service worker** — add new JS file to `SHELL` array in `sw.js`
7. **Supabase** — new table = new SQL (CREATE + RLS policy + trigger)
8. **Test offline** — Dev Tools → Network → Offline, confirm feature degrades gracefully

---

## 12. Known Limitations

| Limitation | Reason | Potential fix |
|---|---|---|
| Documents don't sync across devices | Base64 blobs exceed Supabase row limits | Supabase Storage bucket + URL column |
| History notes not available offline | Not cached to IDB | Add `ma_cache_hist_{pid}` IDB key |
| Receipt is JPEG screenshot | html2canvas limitation | Server-side PDF via Edge Functions |
| Service edits fire on every keystroke | No debounce in `updSvc` | Add 500ms debounce |
| Supabase free tier pauses after 7 days | Spark plan | Log in weekly or upgrade ($25/mo) |
