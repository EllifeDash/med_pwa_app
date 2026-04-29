<div align="center">

# 🏥 MediAssist Pro

**A secure, offline-capable Patient Management PWA for home care & medical attendants**

[![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?style=flat-square&logo=pwa)](https://web.dev/progressive-web-apps/)
[![Supabase](https://img.shields.io/badge/Backend-Supabase-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com)
[![Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla%20JS-F7DF1E?style=flat-square&logo=javascript&logoColor=000)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Material Design](https://img.shields.io/badge/UI-Material%20Design%203-757575?style=flat-square&logo=materialdesign)](https://m3.material.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

[Features](#-features) · [Tech Stack](#-tech-stack) · [Structure](#-project-structure) · [Setup](#-setup) · [Architecture](#-architecture) · [Security](#-security) · [Deploy](#-deployment)

</div>

---

## 📋 Overview

MediAssist Pro is a full-featured, admin-controlled patient management system built as a Progressive Web App. It is designed for individual medical attendants and small home-care practices who need a fast, mobile-first tool that works like a native Android app — without installing anything from an app store.

All data is stored securely in **Supabase** (PostgreSQL) with per-user Row Level Security. The app has **no public login screen** — users are created manually by the admin and access the system via magic links. Once authenticated, sessions persist automatically so the app opens instantly on every visit.

---

## ✨ Features

### 📊 Dashboard
- 5 real-time KPI cards: Visits, Revenue, Avg/Visit, New Patients, Discounts
- SVG revenue bar chart with time filters — Today · Week · Month · Year · All Time
- Top services breakdown with animated progress bars
- Top patients ranked by revenue with gold/silver/bronze ranks
- Recent visits feed — tap any entry to open full patient history

### 👥 Patient Management
- Searchable patient list with avatar, last visit, and visit count
- Full patient profiles with inline photo upload
- One-tap delete with full cascade (visits + history notes)
- Real-time list updates via Supabase realtime channels

### 🏥 Visit Recording
- Tap-to-select service tags with live price table
- Per-visit price overrides
- Discount with automatic net calculation
- Date/time picker, chief complaint notes
- Patient autocomplete from existing records

### 🧾 Receipt Generation
- Branded receipt with clinic logo, patient info, itemised services
- Subtotal, discount, net payable
- Save to device as JPEG image

### 📋 Patient History
- Categorised medical notes: Diagnosis · Allergy · Medication · Lab Result · General Note
- Document upload — images and PDFs stored locally (IndexedDB)
- Full visit timeline with per-visit receipt access and delete
- Patient photo upload, storage usage indicator

### ⚙️ Settings
- Business profile: name, designation, clinic name, tagline, phone, address
- Profile photo and clinic logo (stored as base64 in Supabase)
- Full service catalogue management: add · rename · reprice · delete

### 🔐 Authentication & Access
- **No public login UI** — admin creates users manually in Supabase Dashboard
- Silent `getSession()` check on every app load
- Magic link onboarding for new users
- Persistent sessions — auto-refreshes for up to 7 days of inactivity
- Minimal "Access Required — Contact Admin" fallback when no session exists

### 📱 PWA & Mobile UX
- Installable on Android and iOS (Add to Home Screen)
- Service worker for offline app shell
- Material Design 3 — card elevation, smooth transitions, page animations
- Android swipe-to-go-back gesture (left-edge swipe)
- Ripple effects on all interactive elements
- Safe area insets for notched devices

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (ES2022) |
| **UI System** | Material Design 3, custom CSS design tokens |
| **Backend / DB** | [Supabase](https://supabase.com) (PostgreSQL + Auth + Realtime) |
| **Auth** | Supabase Auth — Email / Magic Link, admin-only |
| **Local Storage** | IndexedDB (binary documents / base64 blobs) |
| **PWA** | Web App Manifest + Service Worker |
| **Receipt Export** | [html2canvas](https://html2canvas.hertzen.com/) |
| **Fonts** | Plus Jakarta Sans, Playfair Display (Google Fonts) |
| **Build tools** | None — pure static files |

---

## 📁 Project Structure

```
mediassist/
├── index.html              # App shell — all pages and modals in one file
├── style.css               # Complete stylesheet (Material Design 3 tokens)
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker (offline shell caching)
│
└── js/
    ├── supabase.js         # Supabase client, silent auth, sign-out  [module]
    ├── db.js               # Data layer: Firestore accessors, realtime, IDB
    ├── init.js             # Bootstrap: bootApp(), enterApp(), showAccessDenied()
    ├── nav.js              # Page router: go()
    ├── ui.js               # Modal helpers: openMo(), closeMo()
    ├── utils.js            # fmtDate(), fmtFileSize(), toast()
    ├── dashboard.js        # KPI cards, SVG chart, top services/patients
    ├── patients.js         # Patient list, deletePatient()
    ├── history.js          # History notes, documents, visit list, photo
    ├── visits.js           # Visit form, service tags, saveVisit()
    ├── receipt.js          # Receipt HTML builder, preview, saveImage()
    └── settings.js         # Profile, logo, service CRUD
```

### Script Load Order

```
supabase.js  (type="module")  ← runs first; sets window.SB, drives auth
db.js        (defer)          ← data layer; uses window.SB
utils.js     (defer)
ui.js        (defer)
nav.js       (defer)
dashboard.js (defer)
patients.js  (defer)
history.js   (defer)
visits.js    (defer)
receipt.js   (defer)
settings.js  (defer)
init.js      (defer)          ← last; exposes bootApp/showAccessDenied to window.*
html2canvas  (defer)          ← third-party, receipt only
micro-script (inline)         ← ripple, toast, swipe-back — runs after all defer
```

---

## 🚀 Setup

### Prerequisites
- A [Supabase](https://supabase.com) account (free tier works)
- A local HTTP server to run the app (not a file:// URL)
- No npm, no build step required

### 1 — Clone

```bash
git clone https://github.com/YOUR_USERNAME/mediassist-pro.git
cd mediassist-pro
```

### 2 — Create Supabase Project

1. [supabase.com](https://supabase.com) → **New project**
2. Name: `MediAssist-Pro` · Region: `South Asia (Mumbai)` or nearest
3. Wait ~2 minutes for provisioning

### 3 — Run the Database Schema

**SQL Editor → New query** — paste and run the full schema SQL from `ADMIN_GUIDE.html` (Step 1). Creates all 5 tables, indexes, RLS policies, `user_id` auto-fill trigger, and realtime replication in one shot.

### 4 — Add Your Credentials

Open `js/supabase.js` and replace:

```js
const SUPABASE_URL      = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY';
```

Find these at: **Project Settings → API** — use the `anon / public` key only.

### 5 — Configure Auth

**Authentication → Providers → Email** → turn **OFF** "Confirm email" → Save  
**Authentication → URL Configuration** → add `http://localhost:5500` to Redirect URLs

### 6 — Run Locally

```bash
# Python
python -m http.server 5500

# Node.js
npx serve .

# VS Code — right-click index.html → Open with Live Server
```

> ⚠️ Never open via `file://` — Supabase Auth requires HTTP.

### 7 — Create Your First User

**Authentication → Users → Add user** → enter email → Create user  
Click the user row → **Send magic link** → click the link → session stored → app opens

Go to **Settings** to fill in your name, clinic details, photo, and logo.

---

## 🏗 Architecture

### Authentication Flow

```
App loads
  │
  ▼
supabase.getSession()
  ├─ session found ──▶ bootApp(user)
  │                       │
  │                       ├── setupListeners()   (realtime channels)
  │                       ├── gSet()             (load profile)
  │                       ├── gSvc()             (seed services if new)
  │                       └── Welcome Screen shown
  │
  └─ no session ──▶ showAccessDenied()
                       (lock screen, no form)
```

### Data Flow

```
saveVisit()
  └─▶ SB.from('visits').insert({ ...v, user_id: window._uid })
          │
          ▼  (RLS check: auth.uid() = user_id ✓)
      Supabase PostgreSQL
          │
          ▼  (realtime channel fires)
      _cache.visits updated
          │
          ▼
      renderDash() refreshes
```

### Database Structure

```
PostgreSQL (Supabase)
├── settings    — 1 row per user: name, rank, branding, photo, logo
├── patients    — id TEXT pk, user_id UUID, name, age, gender, phone, photo …
├── visits      — id TEXT pk, user_id UUID, patientId, services JSONB, net …
├── services    — id TEXT pk, user_id UUID, svc_id INT, name, price
└── hist_notes  — id TEXT pk, user_id UUID, patientId, category, title …

IndexedDB (local, this device only)
└── ma_docs_{patientId}  — base64 images/PDFs (too large for DB rows)
```

---

## 🔐 Security

### Row Level Security

Every table has RLS enabled with a `FOR ALL` policy:

```sql
USING      (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id)
```

- ✅ Each user reads/writes only their own rows
- ✅ User A cannot see User B's patients or visits — even knowing their IDs
- ❌ Unauthenticated requests return empty results
- ❌ No global or shared collections

### Auto `user_id` Trigger

A `BEFORE INSERT` trigger on all 4 data tables sets `user_id = auth.uid()` if omitted. Defence-in-depth — the frontend always passes `user_id` explicitly, but this ensures no orphaned rows can ever be created.

### Admin Controls

| Task | Location |
|---|---|
| Create user | Authentication → Users → Add user → Send magic link |
| Revoke access | Click user → Ban user |
| Delete user + all data | Click user → Delete user (cascades via FK) |
| View any user's data | Table Editor → filter by `user_id` |

---

## 🌐 Deployment

### Netlify — drag & drop (no CLI)
1. [netlify.com](https://netlify.com) → **Add new site → Deploy manually**
2. Drag the `mediassist/` folder into the browser
3. Add the live URL to Supabase **Authentication → URL Configuration → Redirect URLs**

### Netlify CLI
```bash
npm install -g netlify-cli
netlify deploy --prod --dir .
```

### Vercel
```bash
npm install -g vercel
vercel --prod
```

---

## 📦 Supabase Free Tier

| Resource | Limit | Notes |
|---|---|---|
| Database | 500 MB | Thousands of patient records |
| Auth users | 50,000 | No concern |
| API requests | 500,000 / month | ~1,000 actions/day |
| Realtime connections | 200 concurrent | More than enough |
| Project pause | After 7 days inactivity | Log in weekly, or upgrade ($25/mo) |

---

## 🗺 Roadmap

- [ ] Shared clinic mode (multi-staff, shared patient pool)
- [ ] PDF receipt generation (server-side via Edge Functions)
- [ ] Appointment scheduling
- [ ] CSV / Excel export
- [ ] Dark mode
- [ ] Urdu language support

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

## 🙏 Acknowledgements

[Supabase](https://supabase.com) · [html2canvas](https://html2canvas.hertzen.com/) · [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) · [Playfair Display](https://fonts.google.com/specimen/Playfair+Display) · [Material Design 3](https://m3.material.io/)

---

<div align="center"><sub>Built for better home healthcare 🏥</sub></div>
