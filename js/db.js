// ════════════════════════════════════════
// db.js — Firestore Data Layer
// Replaces the old IndexedDB-based DB object.
// • All structured data → Firestore
// • Binary documents (base64) → IndexedDB
//   (Firestore 1MB doc limit makes base64
//    files unsuitable for direct storage)
// ════════════════════════════════════════

// ── Destructure window globals set by firebase.js ─
// (firebase.js is type="module" and runs before
//  this deferred script per HTML spec order)
const { collection, doc, getDoc, getDocs, setDoc,
        deleteDoc, query, where, onSnapshot, writeBatch } = window.FS;
const db = window.db;

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
// Populated by onSnapshot listeners and one-shot reads.
// Direct mutations allowed for immediate (optimistic) UI
// updates before the server round-trip confirms.
window._cache = { patients: [], visits: [], services: [], settings: null };

// ── Real-time listener handles ────────────
let _listeners = [];

/**
 * Set up onSnapshot listeners for patients + visits.
 * Called once after the user authenticates.
 */
function setupListeners() {
  clearListeners(); // tear down any previous session's listeners

  // ── Patients listener ──
  _listeners.push(
    onSnapshot(userCol('patients'), snap => {
      window._cache.patients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (document.getElementById('pg-patients')?.style.display !== 'none')
        if (typeof renderPatients === 'function') renderPatients();
    }, err => console.error('patients snapshot error:', err))
  );

  // ── Visits listener ──
  _listeners.push(
    onSnapshot(userCol('visits'), snap => {
      window._cache.visits = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (document.getElementById('pg-dashboard')?.style.display !== 'none')
        if (typeof renderDash === 'function') renderDash();
    }, err => console.error('visits snapshot error:', err))
  );
}

/**
 * Tear down all real-time listeners and wipe the cache.
 * Called on sign-out.
 */
function clearListeners() {
  _listeners.forEach(unsub => unsub());
  _listeners = [];
  window._cache = { patients: [], visits: [], services: [], settings: null };
}

// ── Data accessors ────────────────────────
// Same function signatures as before — now backed by Firestore.

async function gSet() {
  if (window._cache.settings) return window._cache.settings;
  const snap = await getDoc(userDoc('settings', 'profile'));
  window._cache.settings = snap.exists() ? snap.data() : { ...DEFAULT_SET };
  return window._cache.settings;
}

async function gPts() {
  if (window._cache.patients.length) return window._cache.patients;
  const snap = await getDocs(userCol('patients'));
  window._cache.patients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return window._cache.patients;
}

async function gVis() {
  if (window._cache.visits.length) return window._cache.visits;
  const snap = await getDocs(userCol('visits'));
  window._cache.visits = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return window._cache.visits;
}

async function gSvc() {
  if (window._cache.services.length) return window._cache.services;
  const snap = await getDocs(userCol('services'));
  if (snap.empty) {
    // First-time user: seed default services in a single batch write
    const batch = writeBatch(db);
    DEFAULT_SVC.forEach(s => batch.set(userDoc('services', String(s.id)), s));
    await batch.commit();
    window._cache.services = [...DEFAULT_SVC];
  } else {
    window._cache.services = snap.docs.map(d => d.data());
  }
  return window._cache.services;
}

async function gHistNotes(pid) {
  const snap = await getDocs(
    query(userCol('histNotes'), where('patientId', '==', pid))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Documents stay in IndexedDB — base64 blobs can exceed Firestore's 1MB limit.
async function gDocs(pid) {
  return (await IDB.get('ma_docs_' + pid)) || [];
}

// ════════════════════════════════════════
// IDB — Minimal IndexedDB wrapper
// Used ONLY for binary/base64 documents.
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
