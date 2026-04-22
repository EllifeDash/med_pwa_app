// ════════════════════════════════════════
// db.js — Data Layer (IndexedDB)
// Provides async get/set with automatic
// migration from legacy localStorage data.
// ════════════════════════════════════════

const DB = (() => {
  const DB_NAME = 'mediassist', DB_VER = 1, STORE = 'kv';
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        e.target.result.createObjectStore(STORE);
      };
      req.onsuccess = e => { _db = e.target.result; res(_db); };
      req.onerror  = e => rej(e.target.error);
    });
  }

  async function get(k) {
    const db = await open();
    return new Promise((res, rej) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(k);
      req.onsuccess = () => res(req.result ?? null);
      req.onerror   = e => rej(e.target.error);
    });
  }

  async function set(k, v) {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(v, k);
      tx.oncomplete = () => res(true);
      tx.onerror    = e => rej(e.target.error);
    });
  }

  // One-time migration from localStorage → IndexedDB
  async function migrate() {
    const KEYS = ['ma_settings', 'ma_patients', 'ma_visits', 'ma_services'];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('ma_hist_') || k.startsWith('ma_docs_'))) KEYS.push(k);
    }
    const migrated = await get('__migrated__');
    if (migrated) return;
    for (const k of KEYS) {
      try {
        const raw = localStorage.getItem(k);
        if (raw) { await set(k, JSON.parse(raw)); localStorage.removeItem(k); }
      } catch(e) {}
    }
    await set('__migrated__', true);
  }

  return { get, set, migrate };
})();

// ── Default seed data ─────────────────────
const DEFAULT_SVC = [
  {id:1,  name:'First Aid',               price:300},
  {id:2,  name:'Regular Checkup',          price:500},
  {id:3,  name:'Blood Sample Collection',  price:400},
  {id:4,  name:'Injection / Drip',         price:600},
  {id:5,  name:'Bandage Dressing',         price:350},
  {id:6,  name:'BP / Sugar Check',         price:200},
  {id:7,  name:'Medicine Delivery',        price:100},
  {id:8,  name:'Wound Cleaning',           price:300},
  {id:9,  name:'ECG',                      price:800},
  {id:10, name:'IV Cannula',               price:700},
];

const DEFAULT_SET = {
  name:'Medical Attendant',
  rank:'Home Care Professional',
  businessName:'MediAssist Pro',
  tagline:'Your Mobile Medical Companion',
  phone:'', address:'', photo:'', logo:''
};

// ── Data accessors ────────────────────────
async function gSet()            { return (await DB.get('ma_settings'))  || DEFAULT_SET; }
async function gPts()            { return (await DB.get('ma_patients'))  || []; }
async function gVis()            { return (await DB.get('ma_visits'))    || []; }
async function gSvc()            { return (await DB.get('ma_services'))  || DEFAULT_SVC; }
async function gHistNotes(pid)   { return (await DB.get('ma_hist_'+pid)) || []; }
async function gDocs(pid)        { return (await DB.get('ma_docs_'+pid)) || []; }
