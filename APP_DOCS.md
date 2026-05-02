# MediAssist Pro — Technical Documentation

Internal reference for architecture, data layer, auth, UI conventions, and how to extend or maintain the app.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Folder Structure & Load Order](#2-folder-structure--load-order)
3. [JavaScript Modules](#3-javascript-modules)
4. [Authentication System](#4-authentication-system)
5. [Database Schema](#5-database-schema)
6. [Data Layer — db.js](#6-data-layer--dbjs)
7. [Real-Time Sync](#7-real-time-sync)
8. [Pages & Routing](#8-pages--routing)
9. [Dashboard](#9-dashboard)
10. [Patient Management](#10-patient-management)
11. [Visit Recording](#11-visit-recording)
12. [Patient History](#12-patient-history)
13. [Receipt System](#13-receipt-system)
14. [Settings](#14-settings)
15. [CSS Design System](#15-css-design-system)
16. [Micro-Interactions & Gestures](#16-micro-interactions--gestures)
17. [PWA — Service Worker & Manifest](#17-pwa--service-worker--manifest)
18. [Local Document Storage (IndexedDB)](#18-local-document-storage-indexeddb)
19. [Error Handling](#19-error-handling)
20. [Adding a New Feature](#20-adding-a-new-feature)
21. [Known Limitations](#21-known-limitations)

---

## 1. Project Overview

| Property | Value |
|---|---|
| Type | Single-Page App (SPA) / PWA |
| Frontend | HTML5 + CSS3 + Vanilla JS (ES2022) |
| Backend | Supabase (PostgreSQL + Auth + Realtime) |
| Auth model | Admin-controlled, no public signup |
| Mobile target | Android / iOS (Material Design 3) |
| Offline | App shell via Service Worker |
| Build tools | None — pure static files |

---

## 2. Folder Structure & Load Order

```
mediassist/
├── index.html        # Single HTML file — all pages, modals, navigation
├── style.css         # Complete stylesheet
├── manifest.json     # PWA manifest
├── sw.js             # Service worker
└── js/
    ├── supabase.js   # type="module" — runs FIRST
    ├── db.js         # defer
    ├── utils.js      # defer
    ├── ui.js         # defer
    ├── nav.js        # defer
    ├── dashboard.js  # defer
    ├── patients.js   # defer
    ├── history.js    # defer
    ├── visits.js     # defer
    ├── receipt.js    # defer
    ├── settings.js   # defer
    ├── init.js       # defer — LAST app script
    └── html2canvas   # defer — third-party
```

**Why this order matters:** `supabase.js` is `type="module"`. Per the HTML spec, ES modules execute before `defer` scripts. This guarantees that `window.SB`, `window._uid`, and the auth callbacks are set up before any deferred script runs. By the time `onAuthStateChange` calls `window.bootApp()`, that function is already defined by `init.js`.

---

## 3. JavaScript Modules

### `supabase.js`
- Initialises Supabase with project URL + anon key
- Sets `window.SB` (the client) and `window._uid = null`
- Runs `getSession()` silently — reads from `localStorage`, no network call
- If session found → `await window.bootApp(user)`
- If no session → `window.showAccessDenied()`
- Watches `onAuthStateChange` for `SIGNED_OUT` (shows access denied) and `TOKEN_REFRESHED` (keeps `_uid` current)
- Exposes `window.authSignOut()`

### `db.js`
- `window._cache` — in-memory store `{ patients, visits, services, settings }`
- `setupListeners()` — opens two Supabase realtime channels (`patients_${uid}`, `visits_${uid}`)
- `clearListeners()` — removes channels, wipes cache (called on sign-out)
- `_applyChange(arr, payload)` — handles INSERT/UPDATE/DELETE on cache arrays
- Accessors: `gSet()`, `gPts()`, `gVis()`, `gSvc()`, `gHistNotes(pid)`, `gDocs(pid)`
- `IDB` — minimal IndexedDB wrapper (`get`, `set`) for binary documents only

### `init.js`
- `bootApp(user)` — calls `setupListeners()`, loads settings, populates welcome screen
- `showAccessDenied()` — shows `#accessDenied`, hides `#ws` and `#app`
- `enterApp()` — hides welcome screen, shows `#app`, calls `go('dashboard', null)`
- `logout()` → `authSignOut()` → `onAuthStateChange` → `showAccessDenied()`
- `getInits(name)` — returns 1–2 initials from a name string
- `setWelcomePhoto(b64)` — updates the subject image on the welcome card

### `nav.js`
- `go(pg, btn)` — sets `display` on page divs, updates `.on` class on nav buttons, calls the page's render function
- Pages: `dashboard` · `patients` · `addVisit` · `history` · `settings`

### `ui.js`
- `openMo(id)` — adds `.open` to modal, locks `document.body.style.overflow`
- `closeMo(id)` — removes `.open`, unlocks scroll

### `utils.js`
- `fmtDate(iso)` — `"2024-01-15"` → `"15 Jan 2024"`
- `fmtFileSize(bytes)` — `1048576` → `"1.0MB"`
- `toast(msg, type)` — queues a bottom toast; type `'danger'` = red background

---

## 4. Authentication System

### Model
Closed system. No signup UI exists. Users are created in the Supabase Dashboard and onboarded via a magic link.

### Session Lifecycle

```
First login:
  Admin creates user → sends magic link
  User clicks → Supabase stores JWT in localStorage
  App loads → getSession() reads token → bootApp()

Every subsequent visit:
  getSession() reads from localStorage (no network)
  Token valid → bootApp() immediately
  Token expired → onAuthStateChange: SIGNED_OUT → showAccessDenied()
  Background: Supabase client auto-refreshes the access token
```

### Token Lifetimes (Supabase defaults)
- Access token: **1 hour** (silently auto-refreshed while app is open)
- Refresh token: **7 days inactivity** (resets on every use)

### `window._uid`
Set immediately after `getSession()` confirms a user. Used as a `.eq('user_id', window._uid)` filter in every Supabase query. Never mutated except in `supabase.js`.

---

## 5. Database Schema

### `settings` — one row per user
| Column | Type | Notes |
|---|---|---|
| `user_id` | UUID PK | References `auth.users.id` ON DELETE CASCADE |
| `name` | TEXT | |
| `rank` | TEXT | Designation |
| `businessName` | TEXT | Quoted to preserve case |
| `tagline` | TEXT | |
| `phone` | TEXT | |
| `address` | TEXT | |
| `photo` | TEXT | Base64 profile photo |
| `logo` | TEXT | Base64 clinic logo |

### `patients`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | App-generated: `"p_" + Date.now()` |
| `user_id` | UUID | FK, cascade delete |
| `name` | TEXT NOT NULL | |
| `age` | INTEGER | |
| `gender` | TEXT | |
| `phone` | TEXT | |
| `address` | TEXT | |
| `photo` | TEXT | Base64 |
| `createdAt` | TEXT | ISO string (app-set) |
| `created_at` | TIMESTAMPTZ | Server timestamp |

### `visits`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `"v_" + Date.now()` |
| `user_id` | UUID | FK, cascade delete |
| `patientId` | TEXT | |
| `patientName` | TEXT | Denormalised |
| `date` | TEXT | `"YYYY-MM-DD"` |
| `time` | TEXT | `"HH:MM"` |
| `notes` | TEXT | |
| `services` | JSONB | Array of `{id, name, price}` |
| `subtotal` | NUMERIC | |
| `discount` | NUMERIC | |
| `net` | NUMERIC | subtotal − discount |
| `createdAt` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

### `services`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `"${uid}_${svcId}"` composite |
| `user_id` | UUID | |
| `svc_id` | INTEGER | Numeric ID used by app logic |
| `name` | TEXT | |
| `price` | NUMERIC | |

### `hist_notes`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `"hn_" + Date.now()` |
| `user_id` | UUID | |
| `patientId` | TEXT | |
| `date` | TEXT | |
| `category` | TEXT | Diagnosis / Allergy / Medication / … |
| `title` | TEXT | |
| `details` | TEXT | |

### RLS Pattern (identical on all 5 tables)
```sql
CREATE POLICY "Users own their [table]"
  ON [table] FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Auto `user_id` Trigger
`set_user_id()` function + `BEFORE INSERT` trigger on `patients`, `visits`, `services`, `hist_notes`. If `user_id IS NULL`, sets it to `auth.uid()`. Safety net — the frontend always passes `user_id` explicitly.

---

## 6. Data Layer — `db.js`

### In-Memory Cache
```js
window._cache = {
  patients: [],   // realtime + gPts()
  visits:   [],   // realtime + gVis()
  services: [],   // gSvc() only (no realtime)
  settings: null  // gSet() only
}
```

All accessors check the cache first; a network call only happens when the cache is empty. Cache is wiped by `clearListeners()` on sign-out.

### Optimistic Updates
After any write, the cache is mutated immediately so the UI updates before Supabase confirms via the realtime channel:

```js
// In saveVisit():
window._cache.visits.push({ ...v, user_id: uid }); // optimistic
// realtime channel later confirms with the exact row from DB
```

### `IDB` — IndexedDB for documents
Key format: `ma_docs_{patientId}`  
Value: JSON array of `{ id, name, type, size, data (base64), uploadedAt }`  
Reason for IDB: Supabase rows have a ~1 MB limit. A single base64-encoded JPEG can exceed this.

---

## 7. Real-Time Sync

Two channels set up in `setupListeners()`:

```js
SB.channel('patients_' + uid)
  .on('postgres_changes', { event: '*', table: 'patients', filter: `user_id=eq.${uid}` }, payload => {
    _applyChange(window._cache.patients, payload);
    // re-renders patients page if visible
  }).subscribe();

SB.channel('visits_' + uid)
  .on('postgres_changes', { event: '*', table: 'visits', filter: `user_id=eq.${uid}` }, payload => {
    _applyChange(window._cache.visits, payload);
    // re-renders dashboard if visible
  }).subscribe();
```

`_applyChange` handles:
- `INSERT` → pushes to array if ID not already present
- `UPDATE` → replaces matching item by `id`
- `DELETE` → removes matching item by `id`

**Realtime must be enabled** in Supabase Dashboard → Database → Replication for `patients` and `visits` tables.

---

## 8. Pages & Routing

Pages are `div` elements: `#pg-dashboard`, `#pg-patients`, `#pg-addVisit`, `#pg-history`, `#pg-settings`. One is visible at a time via `display` style.

```js
// nav.js
function go(pg, btn) {
  pages.forEach(p => document.getElementById('pg-'+p).style.display = p===pg ? '' : 'none');
  // update .on on nav buttons
  // call page render function
}
```

Page render functions called by `go()`:
- `renderDash()` — dashboard.js
- `renderPatients()` — patients.js
- `renderSvcTags()` — visits.js
- `renderSettings()` — settings.js

`openHistory(pid)` — history.js — is called directly (not via `go()`), then calls `go('history', null)` internally.

---

## 9. Dashboard

**`dashboard.js`** — `renderDash()` called by `go('dashboard')` and by the visits realtime channel.

### Time Filter
`dashRange` global: `'today'|'week'|'month'|'year'|'all'`. `setDashRange(r, btn)` updates pills and re-renders.

### KPI Calculations (from filtered visits)
- **Visits**: `vis.length`
- **Revenue**: `Σ v.net`
- **Avg/Visit**: `revenue / vis.length`
- **New Patients**: patients whose earliest visit falls in the date range
- **Discount**: `Σ v.discount`

### SVG Bar Chart
`buildSvgBarChart(buildChartData(vis, range))` — pure SVG, no library.
- Today → 24 hourly buckets
- Week → 7 daily buckets (Mon–Sun)
- Month → N daily buckets
- Year → 12 monthly buckets
- All time → one bucket per year-month

---

## 10. Patient Management

**`patients.js`**

`renderPatients()` reads `window._cache.patients` and `window._cache.visits`. Search is client-side, filtering by `name`, `phone`, `address`.

`deletePatient(id)`:
1. `SB.from('hist_notes').delete().eq('patientId', id)`
2. `SB.from('visits').delete().eq('patientId', id)`
3. `SB.from('patients').delete().eq('id', id)`
4. `IDB.set('ma_docs_' + id, [])`
5. Optimistic cache update

---

## 11. Visit Recording

**`visits.js`**

`selSvcs` — `{ serviceId: price }` object for currently selected services.

`saveVisit()`:
1. Validate name + ≥1 service
2. Look up existing patient in cache by `activePtId` or name match
3. Create new patient object if not found
4. `SB.from('patients').upsert({ ...pt, user_id: uid }, { onConflict: 'id' })`
5. Build visit object with `services` as a JSONB array
6. `SB.from('visits').insert({ ...v, user_id: uid })`
7. Optimistically push to both cache arrays
8. `previewReceipt(v.id)` → open receipt modal
9. `resetForm()`

---

## 12. Patient History

**`history.js`** — `openHistory(pid)` is the entry point.

| Section | Source | Storage |
|---|---|---|
| Patient stats | `_cache.visits` filtered | Supabase |
| Medical notes | `gHistNotes(pid)` | Supabase `hist_notes` |
| Documents | `gDocs(pid)` | IndexedDB |
| Visit timeline | `_cache.visits` filtered | Supabase |

`saveHistNote()` → `SB.from('hist_notes').upsert(...)` with `onConflict: 'id'`  
`delHistNote(id)` → `SB.from('hist_notes').delete().eq('id', id)`  
`deleteVisit(id)` → `SB.from('visits').delete().eq('id', id)` + cache update  
`handlePatientPhoto(input)` → base64 via FileReader → `SB.from('patients').update({ photo })...`

---

## 13. Receipt System

**`receipt.js`**

`buildReceipt(vid)` — assembles an HTML string from visit + patient + settings. Includes clinic logo, patient details, itemised service table, discount, and net total.

`previewReceipt(vid)` — injects HTML into `#rcptContent`, opens `#rcptModal`.

`saveImage()` — `html2canvas` at 2× DPR → JPEG blob → file download. Receipt number = last 6 chars of the visit `id`.

---

## 14. Settings

**`settings.js`**

`saveSettings()` → `SB.from('settings').upsert({ ...updated, user_id: uid }, { onConflict: 'user_id' })` → updates `window._cache.settings` → syncs welcome screen display text.

`handleSettingsPhoto` / `handleSettingsLogo` → `FileReader` → base64 → `settings` upsert.

### Service CRUD
- `updSvc(svcId, field, value)` → `SB.from('services').update({ [field]: value }).eq('svc_id', svcId)` — fires on every `oninput`
- `delSvc(svcId)` → delete + cache remove
- `addSvc()` → insert with composite `id = "${uid}_${newId}"`

---

## 15. CSS Design System

All values use CSS custom properties defined in `:root`.

### Tokens

```css
/* Motion */
--dur:  220ms
--ease: cubic-bezier(.4, 0, .2, 1)   /* Material standard easing */

/* Elevation */
--sh:   0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(15,76,117,.08)   /* resting */
--shm:  0 2px 8px rgba(0,0,0,.07), 0 8px 24px rgba(15,76,117,.10)   /* hover */
--shl:  0 4px 16px rgba(0,0,0,.08), 0 16px 48px rgba(15,76,117,.14) /* popovers */

/* Radius */
--rs:   10px   /* inputs, small chips */
--r:    12px   /* standard cards */
--rl:   20px   /* large cards */
--rxl:  28px   /* modals, welcome card */
```

### Key Components
| Class | Description |
|---|---|
| `.card` | Surface container with shadow and 20px radius |
| `.btn .bp/.ba/.bg/.bs/.bd` | Button variants with ripple support |
| `.pc` | Patient card — tap feedback, hover elevation |
| `.av` | Avatar circle with gradient backgrounds |
| `.stag` | Service selection chip with `.sel` state |
| `.hi` | Left-bordered history item |
| `.mo / .mb` | Modal backdrop / bottom sheet |
| `.kpi-card` | Dashboard KPI card with colour-coded top border |
| `.dpill` | Time-range filter pill |
| `.skeleton` | Shimmer loading placeholder |
| `#swipe-indicator` | Thin left-edge bar shown during swipe-back |

---

## 16. Micro-Interactions & Gestures

All in the inline `<script>` at the bottom of `index.html`.

### Ripple
On `pointerdown` on `.btn`, `.stag`, `.dpill`, `.nbtn`, `.bb`:
1. Create `<span class="ripple">` at exact touch coordinates
2. Size = `2 × max(width, height)`
3. CSS `@keyframes rippleAnim` — `scale(0→4)` + `opacity(1→0)` in 500ms
4. Self-removes after `animationend`

### Toast
Patches `window.toast` to use `.show` CSS class (adds `opacity:1` + `translateY(0)` slide). Reflow forced with `void el.offsetWidth` so re-triggering works correctly.

### Swipe-to-Go-Back

Implemented as a self-contained IIFE that:

1. Patches `window.go()` to maintain `_pageStack[]`
2. On `touchstart`: records `_tx`, `_ty`; sets `_active = true` only if `clientX ≤ 30px`
3. On `touchmove`: if `_active` and swipe is rightward and vertical drift `< 60px`, shows `#swipe-indicator`
4. On `touchend`: if `dx ≥ 80px` and `dy ≤ 60px`, calls `goBack()`
5. `goBack()` pops `_pageStack` or falls back to `_backMap[currentPage]`

```js
const _backMap = {
  history:  'patients',
  addVisit: 'dashboard',
  patients: 'dashboard',
  settings: 'dashboard',
};
```

`#swipe-indicator` is a 4px-wide translucent bar on the left edge — appears only during an active left-edge drag.

---

## 17. PWA — Service Worker & Manifest

**`manifest.json`** — defines app name, start URL, display mode (`standalone`), theme colour, icons. Controls home screen appearance after "Add to Home Screen".

**`sw.js`** — caches the app shell on install (cache-first strategy for static files). Supabase API calls are **never** cached — only HTML, CSS, and JS files. A `SKIP_WAITING` message handler applies updates immediately when triggered.

---

## 18. Local Document Storage (IndexedDB)

Database: `mediassist_docs`  
Store: `kv` (key-value)  
Keys: `ma_docs_{patientId}`  
Values: JSON arrays of document objects  

Documents are device-local. They do **not** sync across devices. This is intentional — base64-encoded files easily exceed Supabase's ~1 MB per-row limit. If cross-device document sync is needed, use Supabase Storage buckets with a separate URL column in the `patients` or `hist_notes` table.

---

## 19. Error Handling

Every async Supabase operation follows this pattern:

```js
try {
  const { error } = await SB.from('...').insert({ ... });
  if (error) throw error;
  toast('Saved!');
} catch (err) {
  console.error('context label:', err);
  toast('Error saving', 'danger');
}
```

No global error boundary. Feature-level try/catch in every async write function. Network errors are surfaced by the Supabase JS client as `error` objects in the destructured response.

---

## 20. Adding a New Feature

Checklist for adding a new page, data type, or interaction:

1. **HTML** — add page `div` or modal to `index.html`
2. **CSS** — use existing design tokens (`--p`, `--sh`, `--dur`, etc.) in `style.css`
3. **JS** — create or update the relevant module in `js/`
4. **Data** — add accessor in `db.js` if a new table query is needed
5. **SQL** — add `CREATE TABLE`, RLS policy, and optional trigger in Supabase SQL Editor
6. **Routing** — wire into `nav.js → go()` if it's a new top-level page
7. **Back gesture** — add to `_backMap` in the micro-script if it needs a specific back destination
8. **RLS test** — verify with two browser sessions (different users) that data is fully isolated

---

## 21. Known Limitations

| Limitation | Reason | Possible fix |
|---|---|---|
| Documents don't sync across devices | Base64 exceeds Supabase row limits | Use Supabase Storage + URL column |
| Service name edits fire on every keystroke | No debounce on `updSvc` | Wrap in `setTimeout` debounce or use `blur` event |
| Receipt is a JPEG screenshot | html2canvas limitation | Server-side PDF via Supabase Edge Functions |
| Profile photo requires logout to appear on welcome screen | Photo loaded from `gSet()` only during `bootApp()` | Patch `setWelcomePhoto()` directly after photo save |
| No offline data writes | Supabase requires network | Service worker background sync queue |
| Supabase free tier pauses after 7 days | Spark plan limit | Log in weekly, or upgrade to Pro ($25/mo) |
| Swipe-back does not animate the outgoing page | Pure JS gesture, no CSS transition hooked | Add a `slideOut` animation class on `goBack()` |
