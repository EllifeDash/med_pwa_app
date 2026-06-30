// ════════════════════════════════════════
// db.js — Data Layer
//
// Offline-first pattern:
//   Every accessor tries Supabase first.
//   On success → saves to IDB for offline.
//   On failure / offline → reads from IDB.
//   In-memory cache avoids redundant reads.
//
// FIX: _teardownChannels() is now separate
//      from clearListeners() so setupListeners()
//      does NOT wipe window._cache.
// FIX: IDB stays on 'mediassist_docs' (v2)
//      for backward compatibility with docs.
// ════════════════════════════════════════

const SB = window.SB;

// ── IDB cache keys ────────────────────────
const IDB_SETTINGS = 'ma_cache_settings';
const IDB_PATIENTS = 'ma_cache_patients';
const IDB_VISITS   = 'ma_cache_visits';
const IDB_SERVICES = 'ma_cache_services';

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
window._cache = { patients: [], visits: [], services: [], settings: null, appointments: [] };

// ── Realtime channel handles ──────────────
let _channels = [];

// ── FIX: separated from clearListeners() ──
// Only removes WebSocket subscriptions.
// Does NOT touch window._cache.
function _teardownChannels() {
  try { _channels.forEach(ch => SB && SB.removeChannel && SB.removeChannel(ch)); } catch (_) {}
  _channels = [];
  try {
    if (window._apptChannel && SB && SB.removeChannel) {
      SB.removeChannel(window._apptChannel);
      window._apptChannel = null;
    }
  } catch (_) {}
}

// Called ONLY on sign-out. Wipes subscriptions AND cache.
function clearListeners() {
  _teardownChannels();
  window._cache = { patients: [], visits: [], services: [], settings: null, appointments: [] };
}

// Called on app boot and on reconnect.
// FIX: uses _teardownChannels() — does NOT wipe window._cache.
function setupListeners() {
  _teardownChannels(); // tear down old channels, preserve cache

  if (!navigator.onLine || !window._uid) return;

  const uid = window._uid;
  try {
    const patCh = SB.channel('patients_' + uid)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'patients',
        filter: `user_id=eq.${uid}`,
      }, payload => {
        _applyChange(window._cache.patients, payload);
        IDB.set(IDB_PATIENTS, window._cache.patients); // keep IDB in sync
        if (document.getElementById('pg-patients')?.style.display !== 'none')
          if (typeof renderPatients === 'function') renderPatients();
      })
      .subscribe();

    const visCh = SB.channel('visits_' + uid)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'visits',
        filter: `user_id=eq.${uid}`,
      }, payload => {
        _applyChange(window._cache.visits, payload);
        IDB.set(IDB_VISITS, window._cache.visits);
        if (document.getElementById('pg-dashboard')?.style.display !== 'none')
          if (typeof renderDash === 'function') renderDash();
      })
      .subscribe();

    _channels = [patCh, visCh];
  } catch (err) {
    console.warn('[db] setupListeners: realtime skipped —', err.message);
  }
}

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

// ── Data accessors ────────────────────────
// Pattern: memory cache → Supabase (save to IDB) → IDB fallback → safe default

async function gSet() {
  if (window._cache.settings) return window._cache.settings;

  if (navigator.onLine) {
    try {
      const { data } = await SB.from('settings')
        .select('*').eq('user_id', window._uid).maybeSingle();
      const result = data ? _stripMeta(data) : { ...DEFAULT_SET };
      window._cache.settings = result;
      IDB.set(IDB_SETTINGS, result); // non-blocking persist
      return result;
    } catch (err) {
      console.warn('[db] gSet network fail, trying IDB:', err.message);
    }
  }

  const cached = await IDB.get(IDB_SETTINGS);
  window._cache.settings = cached || { ...DEFAULT_SET };
  return window._cache.settings;
}

async function gPts() {
  if (window._cache.patients.length) return window._cache.patients;

  if (navigator.onLine) {
    try {
      const { data, error } = await SB.from('patients')
        .select('*').eq('user_id', window._uid);
      if (!error) {
        window._cache.patients = data || [];
        IDB.set(IDB_PATIENTS, window._cache.patients);
        return window._cache.patients;
      }
    } catch (err) {
      console.warn('[db] gPts network fail, trying IDB:', err.message);
    }
  }

  const cached = await IDB.get(IDB_PATIENTS);
  window._cache.patients = cached || [];
  return window._cache.patients;
}

async function gVis() {
  if (window._cache.visits.length) return window._cache.visits;

  if (navigator.onLine) {
    try {
      const { data, error } = await SB.from('visits')
        .select('*').eq('user_id', window._uid);
      if (!error) {
        window._cache.visits = data || [];
        IDB.set(IDB_VISITS, window._cache.visits);
        return window._cache.visits;
      }
    } catch (err) {
      console.warn('[db] gVis network fail, trying IDB:', err.message);
    }
  }

  const cached = await IDB.get(IDB_VISITS);
  window._cache.visits = cached || [];
  return window._cache.visits;
}

async function gSvc() {
  if (window._cache.services.length) return window._cache.services;

  if (navigator.onLine) {
    try {
      const { data, error } = await SB.from('services')
        .select('*').eq('user_id', window._uid);
      if (!error) {
        if (!data || !data.length) {
          // First login — seed defaults
          const rows = DEFAULT_SVC.map(s => ({
            id: `${window._uid}_${s.id}`, user_id: window._uid,
            svc_id: s.id, name: s.name, price: s.price,
          }));
          await SB.from('services').insert(rows).catch(e => console.warn('[db] seed svc:', e.message));
          window._cache.services = [...DEFAULT_SVC];
        } else {
          window._cache.services = data.map(s => ({ id: s.svc_id, name: s.name, price: s.price }));
        }
        IDB.set(IDB_SERVICES, window._cache.services);
        return window._cache.services;
      }
    } catch (err) {
      console.warn('[db] gSvc network fail, trying IDB:', err.message);
    }
  }

  const cached = await IDB.get(IDB_SERVICES);
  window._cache.services = (cached && cached.length) ? cached : [...DEFAULT_SVC];
  return window._cache.services;
}

async function gHistNotes(pid) {
  const cacheKey = 'ma_hist_notes_' + pid;

  if (navigator.onLine) {
    try {
      const { data, error } = await SB.from('hist_notes')
        .select('*').eq('user_id', window._uid).eq('patientId', pid);
      if (!error) {
        const notes = data || [];
        IDB.set(cacheKey, notes); // non-blocking persist
        return notes;
      }
    } catch (err) {
      console.warn('[db] gHistNotes network fail, trying IDB:', err.message);
    }
  }

  const cached = await IDB.get(cacheKey);
  return cached || [];
}

async function gDocs(pid) {
  return (await IDB.get('ma_docs_' + pid)) || [];
}

function _stripMeta(obj) {
  const { user_id, svc_id, ...rest } = obj;
  return rest;
}

// ════════════════════════════════════════
// IDB — unified key-value store
// FIX: stays on 'mediassist_docs' database
//      so old document blobs are preserved.
//      Version bumped to 2 to ensure the
//      'kv' store exists in all browsers.
// ════════════════════════════════════════
const IDB = (() => {
  const NAME = 'mediassist_docs'; // unchanged — backward compat with existing docs
  const VER  = 2;
  const STORE = 'kv';
  let _idb = null;

  function open() {
    if (_idb) return Promise.resolve(_idb);
    return new Promise((res, rej) => {
      const req = indexedDB.open(NAME, VER);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        // Creates 'kv' store on fresh install or v1→v2 upgrade.
        // Existing object stores are untouched.
        if (!db.objectStoreNames.contains(STORE))
          db.createObjectStore(STORE);
      };
      req.onsuccess = e => { _idb = e.target.result; res(_idb); };
      req.onerror   = e => {
        console.error('[IDB] open error:', e.target.error);
        rej(e.target.error);
      };
    });
  }

  async function get(k) {
    try {
      const idb = await open();
      return new Promise((res, rej) => {
        const req = idb.transaction(STORE, 'readonly').objectStore(STORE).get(k);
        req.onsuccess = () => res(req.result ?? null);
        req.onerror   = e => rej(e.target.error);
      });
    } catch (err) {
      console.warn('[IDB] get("' + k + '") error:', err);
      return null;
    }
  }

  async function set(k, v) {
    try {
      const idb = await open();
      return new Promise((res, rej) => {
        const tx = idb.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(v, k);
        tx.oncomplete = () => res(true);
        tx.onerror    = e => rej(e.target.error);
      });
    } catch (err) {
      console.warn('[IDB] set("' + k + '") error:', err);
      return false;
    }
  }

  return { get, set };
})();
