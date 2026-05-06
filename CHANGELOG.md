# Changelog

All notable changes to MediAssist Pro are documented here.
Format: `[version] — date · summary`

---

## [1.4.0] — Offline-First Fixes

**Problem solved:** App would hang on the loading screen when device was offline. Data was also lost when toggling between online/offline.

**Root causes fixed:**
- `sw.js` used `caches.addAll()` (atomic) — one CDN failure aborted the entire install, leaving nothing cached
- `setupListeners()` called `clearListeners()` which wiped `window._cache`, erasing all data on every channel restart
- IDB database name was changed from `mediassist_docs` to `mediassist_store`, breaking existing document storage
- `SIGNED_OUT` auth event fired when offline (failed token refresh), locking users out

**Changes:**
- `sw.js` — `Promise.allSettled()` install, bumped to `mediassist-v3`, Supabase API returns safe offline response
- `db.js` — `_teardownChannels()` separated from `clearListeners()`; IDB name restored to `mediassist_docs`; all accessors persist to IDB on success and read from IDB when offline
- `supabase.js` — offline boot using stored UID from localStorage; `SIGNED_OUT` only triggers `showAccessDenied()` when `navigator.onLine`
- `offline.js` — `refreshAllData()` uses `Promise.allSettled()`; `setupListeners()` called after data is fetched; duplicate key check fixed (`code !== '23505'`)

---

## [1.3.0] — New Features

- **Receipt → Share on WhatsApp** — `shareWhatsApp()` in `receipt.js` opens `wa.me` with a formatted text receipt
- **Bulk CSV Export** — `exportCSV()` in `utils.js`; Export Data card added to Settings
- **Monthly Summary Report** — new page (`report.js`) with month-picker, KPIs vs previous month (▲▼%), daily chart, top services and top patients
- **Offline Visit Recording** — `offline.js` queue; `visits.js` offline branch; offline banner; auto-sync on reconnect
- `sw.js` created — service worker caching app shell and Supabase CDN library

---

## [1.2.0] — Dashboard Improvements

- Removed **Avg/Visit** KPI card (not meaningful for clinical use)
- Added **Custom date range picker** — slides down below the 5 filter pills; buckets by day (≤31 days) or month (longer ranges); chart title updates to show the selected range

---

## [1.1.0] — UI Polish (Material Design 3)

- Upgraded `style.css` to Material Design 3 — elevated cards, unified motion tokens (`--dur`, `--ease`), page fade-in transitions
- Removed FAB and nav pill animations (looked artificial on mobile)
- Added **swipe-to-go-back** gesture — left-edge swipe (≤30px) navigating ≥80px triggers `goBack()`; thin `#swipe-indicator` bar gives visual feedback
- Ripple effect on all interactive elements via inline micro-script
- Toast upgraded to CSS `.show` class animation (slide-up)

---

## [1.0.0] — Initial Release

- Single HTML + modular JS architecture (12 files)
- Supabase backend — PostgreSQL, Auth, Realtime
- Admin-controlled access — no public login UI; magic link onboarding
- Silent session restore — app opens directly to Welcome Screen
- Offline-first intent: IndexedDB for documents, in-memory cache for data
- Pages: Dashboard · Patients · New Visit · Patient History · Settings
- Receipt generation with html2canvas JPEG export
- PWA manifest + service worker stub
- RLS on all 5 tables; `BEFORE INSERT` auto `user_id` trigger
- Deployed via GitHub → Netlify auto-deploy
