// ════════════════════════════════════════
// db.js — Supabase Data Layer
// Replaces Firestore entirely.
//
// Data model (Supabase PostgreSQL tables):
//   patients  — id TEXT pk, user_id UUID, name, age, gender, phone, address, photo, createdAt
//   visits    — id TEXT pk, user_id UUID, patientId, patientName, date, time, notes,
//               services JSONB, subtotal, discount, net, createdAt
//   services  — id TEXT pk ("${uid}_${svcId}"), user_id UUID, svc_id INT, name, price
//   hist_notes— id TEXT pk, user_id UUID, patientId, date, category, title, details
//   settings  — user_id UUID pk, name, rank, businessName, tagline, phone, address, photo, logo
//
// Binary documents (base64) stay in IndexedDB (too large for DB rows).
// ════════════════════════════════════════

const SB = window.SB; // set by supabase.js (type=module, runs first)

// ── Default seed data ─────────────────────
const DEFAULT_SVC = [
  { id:1,  name:'First Aid',               price:300 },
  { id:2,  name:'Regular Checkup',         price:500 },
  { id:3,  name:'Blood Sample Collection', price:400 },
  { id:4,  name:'Injection / Drip',        price:600 },
  { id:5,  name:'Bandage Dressing',        price:350 },
  { id:6,  name:'BP / Sugar Check',        price:200 },
  { id:7,  name:'Medicine Delivery',       price:100 },
  { id:8,  name:'Wound Cleaning',          price:300 },
  { id:9,  name:'ECG',                     price:800 },
  { id:10, name:'IV Cannula',              price:700 },
];

const DEFAULT_SET = {
  name:'Medical Attendant', rank:'Home Care Professional',
  businessName:'MediAssist Pro', tagline:'Your Mobile Medical Companion',
  phone:'', address:'', photo:'', logo:'',
};

// ── In-memory cache ───────────────────────
window._cache = { patients: [], visits: [], services: [], settings: null };

// ── Real-time channel handles ─────────────
let _channels = [];

/**
 * Set up Supabase real-time subscriptions for patients + visits.
 * Called once after the user authenticates (from init.js → bootApp).
 * Requires: Supabase Dashboard → Database → Replication → enable tables.
 */
function setupListeners() {
  clearListeners();
  const uid = window._uid;

  // ── Patients channel ──
  const patCh = SB.channel('patients_' + uid)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'patients',
      filter: `user_id=eq.${uid}`,
    }, payload => {
      _applyChange(window._cache.patients, payload);
      if (document.getElementById('pg-patients')?.style.display !== 'none')
        if (typeof renderPatients === 'function') renderPatients();
    })
    .subscribe();

  // ── Visits channel ──
  const visCh = SB.channel('visits_' + uid)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'visits',
      filter: `user_id=eq.${uid}`,
    }, payload => {
      _applyChange(window._cache.visits, payload);
      if (document.getElementById('pg-dashboard')?.style.display !== 'none')
        if (typeof renderDash === 'function') renderDash();
    })
    .subscribe();

  _channels = [patCh, visCh];
}

/** Apply a real-time payload to a cache array in-place. */
function _applyChange(arr, payload) {
  if (payload.eventType === 'INSERT') {
    if (!arr.find(x => x.id === payload.new.id)) arr.push(payload.new);
  } else if (payload.eventType === 'UPDATE') {
    const i = arr.findIndex(x => x.id === payload.new.id);
    if (i > -1) arr[i] = payload.new; else arr.push(payload.new);
  } else if (payload.eventType === 'DELETE') {
    const i = arr.findIndex(x => x.id === payload.old.id);
    if (i > -1) arr.splice(i, 1);
  }
}

/**
 * Tear down all real-time subscriptions and wipe the cache.
 * Called on sign-out.
 */
function clearListeners() {
  _channels.forEach(ch => SB.removeChannel(ch));
  _channels = [];
  window._cache = { patients: [], visits: [], services: [], settings: null };
}

// ── Data accessors ────────────────────────
// Same function signatures used across the app — now backed by Supabase.

/** Fetch user settings. Falls back to defaults for new users. */
async function gSet() {
  if (window._cache.settings) return window._cache.settings;
  const { data } = await SB.from('settings')
    .select('*')
    .eq('user_id', window._uid)
    .maybeSingle();
  window._cache.settings = data ? _stripMeta(data) : { ...DEFAULT_SET };
  return window._cache.settings;
}

/** Fetch all patients for the current user. */
async function gPts() {
  if (window._cache.patients.length) return window._cache.patients;
  const { data, error } = await SB.from('patients')
    .select('*')
    .eq('user_id', window._uid);
  if (error) { console.error('gPts:', error); return []; }
  window._cache.patients = data || [];
  return window._cache.patients;
}

/** Fetch all visits for the current user. */
async function gVis() {
  if (window._cache.visits.length) return window._cache.visits;
  const { data, error } = await SB.from('visits')
    .select('*')
    .eq('user_id', window._uid);
  if (error) { console.error('gVis:', error); return []; }
  window._cache.visits = data || [];
  return window._cache.visits;
}

/**
 * Fetch services. Seeds DEFAULT_SVC for new users.
 * Services use a composite string pk: "${uid}_${numericId}"
 * to handle multiple users sharing the same numeric ids.
 * On return, rows are mapped to { id: numericId, name, price }
 * so all existing app logic (s.id) remains unchanged.
 */
async function gSvc() {
  if (window._cache.services.length) return window._cache.services;
  const { data, error } = await SB.from('services')
    .select('*')
    .eq('user_id', window._uid);
  if (error) { console.error('gSvc:', error); return []; }

  if (!data || data.length === 0) {
    // First login — seed default services
    const rows = DEFAULT_SVC.map(s => ({
      id:      `${window._uid}_${s.id}`,
      user_id: window._uid,
      svc_id:  s.id,
      name:    s.name,
      price:   s.price,
    }));
    const { error: seedErr } = await SB.from('services').insert(rows);
    if (seedErr) console.error('gSvc seed:', seedErr);
    window._cache.services = [...DEFAULT_SVC]; // already in { id, name, price } format
  } else {
    // Map DB rows → app format: replace composite id with numeric svc_id
    window._cache.services = data.map(s => ({ id: s.svc_id, name: s.name, price: s.price }));
  }
  return window._cache.services;
}

/** Fetch history notes for a specific patient. */
async function gHistNotes(pid) {
  const { data, error } = await SB.from('hist_notes')
    .select('*')
    .eq('user_id', window._uid)
    .eq('patientId', pid);
  if (error) { console.error('gHistNotes:', error); return []; }
  return data || [];
}

/** Fetch documents for a patient — stored locally in IndexedDB (base64 safe). */
async function gDocs(pid) {
  return (await IDB.get('ma_docs_' + pid)) || [];
}

/** Remove Supabase-internal fields (user_id, svc_id) before returning to app. */
function _stripMeta(obj) {
  const { user_id, svc_id, ...rest } = obj;
  return rest;
}

// ════════════════════════════════════════
// IDB — Minimal IndexedDB wrapper
// Used ONLY for binary/base64 documents.
// (Supabase rows should stay under 1MB;
//  base64 images easily exceed that.)
// ════════════════════════════════════════
const IDB = (() => {
  const NAME = 'mediassist_docs', VER = 1, STORE = 'kv';
  let _idb = null;

  function open() {
    if (_idb) return Promise.resolve(_idb);
    return new Promise((res, rej) => {
      const req = indexedDB.open(NAME, VER);
      req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
      req.onsuccess       = e => { _idb = e.target.result; res(_idb); };
      req.onerror         = e => rej(e.target.error);
    });
  }

  async function get(k) {
    const idb = await open();
    return new Promise((res, rej) => {
      const req = idb.transaction(STORE, 'readonly').objectStore(STORE).get(k);
      req.onsuccess = () => res(req.result ?? null);
      req.onerror   = e => rej(e.target.error);
    });
  }

  async function set(k, v) {
    const idb = await open();
    return new Promise((res, rej) => {
      const tx = idb.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(v, k);
      tx.oncomplete = () => res(true);
      tx.onerror    = e => rej(e.target.error);
    });
  }

  return { get, set };
})();
