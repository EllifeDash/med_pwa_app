# MediAssist Pro — Copilot Instructions

This is a **Vanilla JavaScript PWA** (Progressive Web App) with **no build step**, **no package.json**, and **no framework**. All code is ES2022+ running directly in the browser; there is no bundler or build-time env injection.

---

## Quick Facts

- **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES2022)
- **Backend:** Supabase (PostgreSQL + Auth + Realtime)
- **Storage:** IndexedDB (offline queue + data cache)
- **Offline:** Service Worker (cache-first) + Realtime sync on reconnect
- **Design:** Material Design 3 with custom CSS tokens
- **Deploy:** GitHub → Netlify (auto-deploy on push)

No linting, build, or test commands — development is direct file editing.

---

## Architecture Overview

### Modular Script Loading

Scripts load in strict order (see `index.html`):

1. `supabase.js` — ES6 **module** (runs first, loads Supabase client from CDN)
2. All others — `defer` (execute after HTML parse, in file order)
3. `init.js` — **last defer** (exposes `bootApp()`, `showAccessDenied()` to window)

**Key:** Modules execute before defer scripts. Use this ordering to control initialization.

### Three-Layer Data Pattern

Every data accessor (e.g., `gPts()`, `gVis()`, `gSet()`, `gSvc()`) follows this cascade:

```
1. window._cache (in-memory)  ← fastest, checked first
   ↓ (if empty)
2. Supabase fetch              ← writes result to IDB, returns data
   ↓ (if network fails or offline)
3. IndexedDB fallback          ← returns cached data or empty array
```

This ensures the app **works fully offline** and degrades gracefully.

If IndexedDB is blocked or throws an error (e.g., in strict private/incognito modes), catch the exception, fall back to in-memory `window._cache`, and optionally display a toast warning that offline mode is unavailable.

### Service Worker (sw.js)

**Cache version:** `mediassist-v3` (update if cache invalidation needed)

**Strategies:**
- **App shell + JS + CDN libs:** cache-first (app loads fully offline after first visit)
- **Supabase API (`*.supabase.co`, `*.supabase.com`):** network-only (data must be live; offline handled by IDB in `db.js`)
- **Navigation (page load):** cache-first → fallback to `index.html`

**Note:** Supabase CDN library (`@supabase/supabase-js@2`) is **pre-cached** in the app shell, so offline-first data loading works from boot.

### Global State

```javascript
window.SB         // Supabase client
window._uid       // Logged-in user ID (saved to localStorage for offline boot)
window._cache     // { patients: [], visits: [], services: [], settings: null }
window._backMap   // Navigation back destinations (defined in inline micro-script, e.g., _backMap['pg-history'] = 'pg-patients')
```

---

## Key Conventions

### Naming

- **Getter functions:** `g`-prefix — `gPts()`, `gVis()`, `gSet()`, `gSvc()`
- **Render functions:** `render`-prefix — `renderDash()`, `renderPatients()`, `renderSettings()`
- **Modal open/close:** `openMo()`, `closeMo()` (defined in `ui.js`)
- **IDB keys:** `ma_cache_*` or `ma_offline_*` — e.g., `ma_cache_patients`, `ma_offline_queue`
- **Page divs:** `pg-{name}` — e.g., `pg-dashboard`, `pg-patients`, `pg-history`
- **Service IDs:** Composite key — `"${uid}_${svcId}"` (from Supabase `services` table)

### CSS Tokens (Material Design 3)

All colors and motion defined as CSS variables. Use these instead of hardcoding:

```css
/* Primary & Accents */
--p:   #0f4c75   /* Primary */
--pl:  #1b6ca8   /* Primary light (hover states) */
--pd:  #093a5c   /* Primary dark */
--ac:  #00b4d8   /* Accent */
--ac2: #90e0ef   /* Accent light */

/* Semantic */
--ok:  #10b981   /* Success / approved */
--err: #ef4444   /* Error / reject */
--warn:#f59e0b   /* Warning */

/* Surfaces & Text */
--bg:  #eef2f7   /* Page background */
--sur: #ffffff   /* Surface (cards, modals) */
--sur2:#f8fafc   /* Surface secondary */
--tx:  #1a2332   /* Text primary */
--tx2: #4a5568   /* Text secondary */
--tx3: #94a3b8   /* Text tertiary (hints) */

/* Radius (M3 scale) */
--rs:  10px      /* Small */
--r:   12px      /* Standard */
--rl:  20px      /* Large */
--rxl: 28px      /* Extra large */

/* Shadows (M3 elevation) */
--sh:  0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(15,76,117,.08)
--shm: 0 2px 8px rgba(0,0,0,.07), 0 8px 24px rgba(15,76,117,.10)
--shl: 0 4px 16px rgba(0,0,0,.08), 0 16px 48px rgba(15,76,117,.14)

/* Motion */
--dur: 220ms
--ease:cubic-bezier(.4, 0, .2, 1)
```

### IndexedDB Keys

| Key | Contents | Module |
|---|---|---|
| `ma_cache_settings` | User settings object | `db.js` |
| `ma_cache_patients` | Patients array | `db.js` |
| `ma_cache_visits` | Visits array | `db.js` |
| `ma_cache_services` | Services array | `db.js` |
| `ma_offline_queue` | Queued offline visits | `offline.js` |
| `ma_docs_{patientId}` | Base64 document blobs | `history.js` |

**Backward compatibility:** IDB database name stays `mediassist_docs` (v2) for existing document blobs.

---

## File Map & Responsibilities

| File | Responsibility |
|---|---|
| `supabase.js` | Supabase client, session check, offline boot, auth state watcher |
| `db.js` | Data layer — getters (`g*`), Realtime subscriptions, channel management |
| `init.js` | `bootApp()`, `showAccessDenied()`, entry points |
| `nav.js` | `go(page, btn)` router — page navigation & render function dispatch |
| `ui.js` | `openMo()`, `closeMo()` modal helpers |
| `utils.js` | `fmtDate()`, `toast()`, `exportCSV()`, helpers |
| `dashboard.js` | KPI cards, SVG revenue chart, date range filters, `renderDash()` |
| `patients.js` | Patient list, delete, cascade, `renderPatients()` |
| `history.js` | Medical notes, document upload, visit timeline, `openHistory(pid)` |
| `visits.js` | Visit form (online/offline save paths), `saveVisit()` |
| `receipt.js` | Receipt builder, `saveImage()`, `shareWhatsApp()` |
| `report.js` | Monthly summary, KPI deltas, `initReport()`, `renderReport()` |
| `settings.js` | Business profile, logo, service CRUD, `renderSettings()` |
| `offline.js` | Queue manager — `addToOfflineQueue()`, `syncOfflineQueue()`, `refreshAllData()` |
| `sw.js` | Service worker — cache-first for app shell, network-only for Supabase API |

---

## Offline-First Data Flow

### Recording a visit offline

```javascript
saveVisit()
  ├─ navigator.onLine ──→ upsert patient + insert visit to Supabase
  │                        → update window._cache optimistically
  │
  └─ offline ──────────→ addToOfflineQueue({ pt, v })
                         → update window._cache (receipt preview works)
                         → toast "Saved offline"
```

### On reconnect (window 'online' event)

```javascript
1. syncOfflineQueue()     ← iterate queue, upsert to Supabase, remove synced items
2. refreshAllData()       ← clear _cache slots one at a time, re-fetch from Supabase
                            (partial failures leave old cached values intact)
3. setupListeners()       ← re-start Realtime subscriptions AFTER data loaded
```

**Design decision:** `setupListeners()` calls `_teardownChannels()` (NOT `clearListeners()`), so Realtime channels restart **without wiping the in-memory cache**. This is critical for reconnect performance.

---

## Supabase Integration

### Tables (all with user_id + RLS)

| Table | PK | Notes |
|---|---|---|
| `settings` | `user_id` | One row per user — profile, branding |
| `patients` | `id` TEXT | Patient records |
| `visits` | `id` TEXT | Visit records — `services` is JSONB array |
| `services` | `id` TEXT | Per-user service catalogue |
| `hist_notes` | `id` TEXT | Medical history notes per patient |

### RLS Policy (identical on all tables)

```sql
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id)
```

User A cannot access User B's data. Unauthenticated requests return empty.

### Auto user_id Trigger

```sql
BEFORE INSERT ON patients, visits, services, hist_notes
  NEW.user_id := auth.uid()
```

Safety net: even if client sends a user_id, it's overwritten by the trigger.

### Realtime Subscriptions (db.js)

```javascript
setupListeners()
  ├─ channel('patients_' + uid)        ← listen for patient changes
  │    → if patient page open, re-render
  │
  ├─ channel('visits_' + uid)          ← listen for visit changes
  │    → if dashboard open, re-render (updates KPIs & chart)
  │
  └─ (on signout) clearListeners()     ← unsubscribe + wipe cache
```

**Note:** Auth state `SIGNED_OUT` is ignored when offline — prevents failed token refresh from locking out offline users.

---

## Adding a Feature

1. **HTML** — add page `div#pg-{name}` or modal to `index.html`
2. **CSS** — use existing tokens; no new color vars unless necessary
3. **JS** — new file in `js/` or extend existing module
4. **Routing** — add the page string to `const pages = ['dashboard', 'patients']` in `nav.js`, and add a `case 'newPage':` block inside `go(page)` that calls your render function
5. **Swipe-back** — add to `_backMap` in inline micro-script (footer of `index.html`)
6. **Service Worker** — add new JS file to `SHELL` array in `sw.js`
7. **Supabase** — new table = new SQL (CREATE + RLS policy + trigger)
8. **Test offline** — Dev Tools → Network → Offline, confirm feature degrades gracefully

---

## Known Limitations & Workarounds

| Limitation | Reason | Workaround |
|---|---|---|
| Documents don't sync across devices | Base64 blobs exceed Supabase row limits | Supabase Storage bucket + URL column |
| History notes unavailable offline | Not cached to IDB | Add `ma_cache_hist_{pid}` IDB key |
| Receipt is JPEG screenshot | html2canvas limitation | Server-side PDF via Supabase Edge Functions |
| Service edits fire on every keystroke | No debounce in update handler | Add 500ms debounce in `settings.js` |
| Supabase free tier pauses after 7 days | Spark plan inactivity | Log in weekly or upgrade ($25/mo) |

---

## Debugging Tips

### Check session offline

```javascript
// In browser console:
window._uid
// Should show UID if session stored locally
localStorage.getItem('user_id')
// Should exist if offline boot succeeded
```

### View IDB data

```javascript
// Chrome DevTools → Application → IndexedDB → mediassist_docs
// Keys: ma_cache_patients, ma_cache_visits, ma_offline_queue, etc.
```

### Inspect Realtime subscriptions

```javascript
// In console:
window._cache
// Should show loaded data
// Check Network tab for `*.supabase.co` — should be network-only
```

### Simulate offline

Chrome DevTools → Network tab → set throttling to "Offline", or disable network adapter.

---

## Environment Variables

Only one file needs Supabase credentials:

**`js/supabase.js`** (lines 20–21)

```javascript
const SUPABASE_URL      = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY';
```

Get these from **Supabase Dashboard → Project Settings → API** (use the `anon/public` key).

**Never commit credentials to the repo.** Because there is no build step, use placeholders in `js/supabase.js` during development and replace them at deploy time (e.g., Netlify snippet injection or a `sed`-style replacement in the deploy command).

---

## Running Locally

No build step required. Just serve the directory over HTTP (HTTPS for production):

```bash
# Python
python -m http.server 5500

# Node (serve package)
npx serve .

# VS Code Live Server
# Right-click index.html → Open with Live Server
```

Visit `http://localhost:5500` in your browser.

---

## Deployment

**GitHub → Netlify (automatic)**

1. Push code to GitHub
2. Netlify detects push → auto-deploys within ~30 seconds
3. No build command needed — publish directory is `.`

After deploying, add live URL to **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**.

---

## Summary of Key Behaviors

- **No login screen.** Users created manually in Supabase Dashboard. Magic link is sent, user clicks, session stored.
- **Fully offline.** App shell loads from Service Worker cache. Data from IDB. Queue auto-syncs on reconnect.
- **Realtime updates.** When online, Supabase Realtime subscriptions push live updates to dashboard, patient list, etc.
- **No framework.** Pure vanilla JS, no build step, no npm. Lower complexity, instant page loads.
- **Material Design 3.** Custom CSS tokens, ripple effects, swipe-back gesture, smooth transitions.
- **Admin-controlled access.** All user management (create, revoke, delete) via Supabase Dashboard. No self-signup.
