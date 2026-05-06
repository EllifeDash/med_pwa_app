<div align="center">

# 🏥 MediAssist Pro

**Offline-first Patient Management PWA for home care & medical attendants**

[![PWA](https://img.shields.io/badge/PWA-Offline--First-5A0FC8?style=flat-square&logo=pwa)](https://web.dev/progressive-web-apps/)
[![Supabase](https://img.shields.io/badge/Backend-Supabase-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com)
[![Netlify](https://img.shields.io/badge/Deploy-Netlify-00C7B7?style=flat-square&logo=netlify)](https://netlify.com)
[![Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla%20JS-F7DF1E?style=flat-square&logo=javascript&logoColor=000)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License: Proprietary](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

</div>

---

## Overview

MediAssist Pro is a mobile-first patient management system built as a PWA. It works **fully offline** — visit data is recorded locally and syncs to Supabase automatically when internet is restored. No login screen is shown to users; access is admin-controlled via Supabase Dashboard.

---

## Features

| Module | What it does |
|---|---|
| **Dashboard** | 4 KPI cards (Visits, Revenue, New Patients, Discounts) · SVG revenue chart with Today/Week/Month/Year/Custom date filter · Top services & top patients |
| **Patients** | Searchable list · full profiles · photo upload · cascade delete |
| **New Visit** | Tap-to-select services · price overrides · discount · autocomplete · works offline |
| **Patient History** | Categorised medical notes · document upload (PDF/images) · visit timeline |
| **Receipts** | Branded receipt · Save as JPEG · **Share on WhatsApp** |
| **Monthly Report** | Month-picker · KPIs vs previous month (▲▼%) · daily chart · top services & patients |
| **Settings** | Business profile · logo · service catalogue · **Export all visits to CSV** |
| **Offline** | Full app loads from cache · visits queued in IDB · auto-syncs on reconnect |

---

## Tech Stack

| | |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JS (ES2022) — no framework, no build step |
| UI | Material Design 3 — custom CSS tokens, ripple effects, swipe-back gesture |
| Backend | [Supabase](https://supabase.com) — PostgreSQL + Auth + Realtime |
| Auth | Admin-only magic link · silent session restore · offline-safe boot |
| Offline | Service Worker (cache-first) · IndexedDB (data + queue + documents) |
| Deploy | GitHub → Netlify (auto-deploy on push) |

---

## Project Structure

```
mediassist/
├── index.html          # Full app shell — all pages & modals
├── style.css           # All styles — Material Design 3 tokens
├── manifest.json       # PWA manifest
├── sw.js               # Service worker — cache-first, offline shell
└── js/
    ├── supabase.js     # [module] Auth, offline boot, session management
    ├── db.js           # Data layer — Supabase + IDB fallback for all reads
    ├── init.js         # bootApp(), enterApp(), showAccessDenied()
    ├── nav.js          # go() router — 6 pages
    ├── ui.js           # openMo() / closeMo()
    ├── utils.js        # fmtDate(), toast(), exportCSV()
    ├── dashboard.js    # KPIs, SVG chart, custom date range
    ├── patients.js     # Patient list & deletePatient()
    ├── history.js      # Notes, documents, visit timeline
    ├── visits.js       # Visit form — online & offline save paths
    ├── receipt.js      # Receipt builder, saveImage(), shareWhatsApp()
    ├── report.js       # Monthly summary report
    ├── settings.js     # Profile, logo, service CRUD
    └── offline.js      # Queue management, sync, reconnect refresh
```

---

## Setup

### Prerequisites
- Supabase account (free tier is sufficient)
- Local HTTP server — **never open via `file://`**

### 1 — Clone & configure

```bash
git clone https://github.com/YOUR_USERNAME/mediassist-pro.git
cd mediassist-pro
```

Open `js/supabase.js` and replace:
```js
const SUPABASE_URL      = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY';
```
Get these from **Supabase → Project Settings → API** (use the `anon/public` key).

### 2 — Run database schema

In **Supabase → SQL Editor**, run the full SQL from `ADMIN_GUIDE.html`. This creates all 5 tables, RLS policies, `user_id` trigger, and realtime replication in one shot.

### 3 — Configure Auth

- **Authentication → Providers → Email** → disable "Confirm email"
- **Authentication → URL Configuration** → add your local URL (e.g. `http://localhost:5500`) and your Netlify URL to Redirect URLs

### 4 — Run locally

```bash
python -m http.server 5500
# or
npx serve .
# or VS Code → right-click index.html → Open with Live Server
```

### 5 — Create first user

**Supabase → Authentication → Users → Add user** → enter email → Send magic link → user clicks link → session stored → app opens.

---

## Deployment (GitHub → Netlify)

This project uses **GitHub as source** with Netlify auto-deploying on every push.

### First-time setup

1. Push repo to GitHub
2. [netlify.com](https://netlify.com) → **Add new site → Import from Git** → select your repo
3. Build settings: **Build command** = *(leave empty)* · **Publish directory** = `.`
4. Click **Deploy site**

### After each update

```bash
git add .
git commit -m "describe your change"
git push
```
Netlify detects the push and auto-deploys within ~30 seconds. No CLI needed.

### Add live URL to Supabase

Once deployed, add `https://your-site.netlify.app` to **Supabase → Authentication → URL Configuration → Redirect URLs**.

---

## Offline Behaviour

| Scenario | What happens |
|---|---|
| App opened offline (previously visited) | Loads from service worker cache, data from IDB |
| Visit recorded offline | Saved to IDB queue, receipt works immediately |
| Device comes back online | Queue auto-syncs to Supabase, data refreshed, realtime resumes |
| Session expired while offline | User stays logged in — stored UID used for offline boot |
| Never logged in on this device | "Access Required — Contact Admin" screen shown |

---

## Security

All 5 Supabase tables have RLS enabled with:
```sql
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
```
User A cannot access User B's data. Unauthenticated requests return empty. A `BEFORE INSERT` trigger auto-fills `user_id` from `auth.uid()` as a safety net.

**Admin controls** — all via Supabase Dashboard:

| Task | Where |
|---|---|
| Create user + send magic link | Authentication → Users → Add user |
| Revoke access immediately | Click user → Ban user |
| Delete user + all their data | Click user → Delete user (cascades) |

---

## Supabase Free Tier Limits

| Resource | Limit | Notes |
|---|---|---|
| Database | 500 MB | Thousands of records |
| Auth users | 50,000 | No concern |
| API requests | 500,000 / month | ~1,000 actions/day |
| Project inactivity pause | 7 days | Log in weekly, or upgrade ($25/mo) |

---

## Roadmap

- [ ] Shared clinic mode (multi-staff, shared patients)
- [ ] Appointment scheduling
- [ ] Dark mode
- [ ] Urdu language support

---

## License

This project is licensed under a Proprietary License.  
All rights reserved. See the LICENSE file for details. — see [LICENSE]

---

<div align="center"><sub>Built for better home healthcare 🏥</sub></div>
