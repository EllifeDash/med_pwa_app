# Future Plans — v1

## Local-First Database Refactor

**Goal:** Transition primary state management from cloud-polls to a relational local database (Dexie.js), keeping Supabase as a transient sync layer to minimize cloud costs.

### Why
- Free tier cloud constraints (500MB DB, 2GB bandwidth)
- Eliminate `gHistNotes()` offline gap (currently returns `[]`)
- Single code path for reads/writes — no `if (navigator.onLine)` branches
- Sub-millisecond local reads vs network round-trips
- Relational integrity enforced locally

### Approach
- **Engine:** Dexie.js (~30KB) over SQLite WASM (~1.5MB + OPFS dependency)
- **Schema:** patients, visits, services, hist_notes, settings, appointments
- **Sync:** Controller fetches appointments → stores locally → clears cloud log
- **Migration:** One-time pull from Supabase into Dexie on first launch

### Files
| Action | File |
|---|---|
| New | `js/schema.js` — Dexie table definitions |
| New | `js/sync.js` — sync controller |
| Refactor | `js/db.js` — accessors → Dexie reads |
| Refactor | `js/visits.js`, `js/settings.js`, `js/history.js`, `js/patients.js`, `js/offline.js` |
| Edit | `index.html`, `sw.js` — add Dexie CDN |

### Status
**Not started** — planned for future iteration.
