# MediAssist Pro — Offline-First Patient Management PWA

**Tier 2** of the Nankana Home Care three-tier ecosystem.

| Tier | Product | Role |
|------|---------|------|
| 1 | [Nankana Home Care Web Brochure](https://github.com/ellifedash/nankana-home-care) | Public-facing patient booking site |
| 2 | **MediAssist Pro** *(this repo)* | Offline-first patient management PWA for medical assistants |
| 3 | [NHC Admin Portal](https://github.com/ellifedash/nhc-admin-portal) | Secure admin dashboard for staff onboarding and magic-link dispatch |

---

## Overview

Mobile-first, offline-capable Progressive Web App for home care medical attendants. Records patient visits, manages bookings from the public site, generates receipts, and produces monthly reports — all while working fully offline. Data syncs to Supabase automatically when connectivity is restored.

## Features

| Module | Description |
|--------|-------------|
| **Dashboard** | KPI cards, pending bookings list, date-range filter (Today/Week/Month/Year/Custom) |
| **Patients** | Searchable list (filters out `is_active=false`), full profile, photo upload, cascade delete |
| **Pending Patients** | Staged inactive records auto-created from accepted bookings; complete or discard via the Bookings page |
| **New Visit** | Tap-to-select services, price overrides, discount, autocomplete, offline save, pre-fill from staged patients |
| **Patient History** | Categorised medical notes, document upload (PDF/images), visit timeline |
| **Receipts** | Branded receipt, save as JPEG, share on WhatsApp |
| **Bookings** | Inbound appointment requests from public site, Accept/Reject/Reschedule, WhatsApp confirmation, auto-stages inactive patient on Accept |
| **Monthly Report** | Month-picker, KPIs vs previous month, daily chart, top services, save as image |
| **Settings** | Business profile, logo, service catalogue, export all visits to CSV |
| **Offline** | Full app loads from cache, visits queued in IndexedDB, auto-sync on reconnect, pending patient activation syncs on reconnect |
| **Notifications** | Browser push on new booking via Service Worker |

## Project Structure

```
mediassist/
├── index.html              # Full app shell — all pages and modals
├── style.css               # All styles — Material Design 3 tokens
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker (cache-first, offline shell)
├── js/
│   ├── supabase.js         # [module] Auth, offline boot, session management
│   ├── db.js               # Data layer — Supabase + IndexedDB fallback
│   ├── init.js             # bootApp(), enterApp(), showAccessDenied()
│   ├── nav.js              # go() router — page navigation
│   ├── ui.js               # openMo() / closeMo() modal helpers
│   ├── utils.js            # fmtDate(), toast(), exportCSV()
│   ├── dashboard.js        # KPIs, custom date range, pending bookings
│   ├── patients.js         # Patient list (filters out is_active=false), deletePatient()
│   ├── pending-patients.js # Staged inactive patients — render, complete (→addVisit), discard
│   ├── history.js          # Notes, documents, visit timeline
│   ├── visits.js           # Visit form — online and offline save, prefillFromPendingPatient()
│   ├── receipt.js          # Receipt builder, saveImage(), shareWhatsApp()
│   ├── report.js           # Monthly summary, saveReportImage()
│   ├── bookings.js         # Appointment management, realtime, WhatsApp
│   ├── settings.js         # Profile, logo, service CRUD
│   ├── offline.js          # Queue management, sync, reconnect
│   └── books.js            # (in development)
├── AGENTS.md
└── README.md
```

## Integration Loop

1. **Patients** book appointments via the public brochure site (Tier 1) → stored in Supabase
2. **Medical assistants** view and manage bookings, record visits, generate receipts in this PWA
3. When a booking is **Accepted**, the app auto-stages an inactive patient record (`is_active=false`) with the booking reference
4. Staged patients appear under **Pending Patients** on the Bookings page — assistants complete (→Add Visit with pre-filled data) or discard them
5. Completing a staged patient flips `is_active=true` and creates the visit record
6. **Administrators** onboard new staff and send magic links via the Admin Portal (Tier 3)
7. **All tiers** share the same Supabase project — appointments are the cross-cutting data entity

## Setup

1. Replace placeholder credentials in `js/supabase.js` with your Supabase project URL and anon key
2. Run the database schema in Supabase SQL Editor (available in the original project docs)
3. Configure Auth: disable email confirmation, add redirect URLs
4. Serve locally: `python -m http.server 5500` (never via `file://`)
5. Deploy to Netlify: import GitHub repo, publish directory `.`, no build command

## Offline Behaviour

| Scenario | Behaviour |
|----------|-----------|
| App opened offline (previously visited) | Loads from service worker cache, data from IndexedDB |
| Visit recorded offline | Saved to IndexedDB queue, receipt works immediately |
| Device comes back online | Queue auto-syncs to Supabase, data refreshed |
| Session expired while offline | User stays logged in via stored UID |
| Never logged in on this device | "Access Required — Contact Admin" screen shown |

## License

Proprietary. All rights reserved.
