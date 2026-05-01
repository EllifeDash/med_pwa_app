// ════════════════════════════════════════
// offline.js — Offline Visit Queue
// When the device has no internet:
//   • Visits are saved to IndexedDB queue
//   • A banner shows queued count
//   • On reconnection, queue auto-syncs
//     to Supabase and banner clears
// ════════════════════════════════════════

const QUEUE_KEY = 'ma_offline_queue';

// ── Queue helpers (uses IDB from db.js) ──

async function getOfflineQueue() {
  return (await IDB.get(QUEUE_KEY)) || [];
}

async function addToOfflineQueue(item) {
  const q = await getOfflineQueue();
  q.push({ ...item, _queuedAt: new Date().toISOString() });
  await IDB.set(QUEUE_KEY, q);
  updateOfflineBanner();
}

async function clearOfflineQueue() {
  await IDB.set(QUEUE_KEY, []);
  updateOfflineBanner();
}

// ── Banner ─────────────────────────────

async function updateOfflineBanner() {
  const banner  = document.getElementById('offlineBanner');
  const counter = document.getElementById('offlineCount');
  if (!banner) return;

  const online = navigator.onLine;
  const q      = await getOfflineQueue();

  if (!online) {
    banner.className = 'offline-banner offline-banner--offline';
    banner.style.display = 'flex';
    if (counter) counter.textContent =
      q.length ? `Offline — ${q.length} visit${q.length > 1 ? 's' : ''} queued` : 'You are offline';
  } else if (q.length > 0) {
    banner.className = 'offline-banner offline-banner--syncing';
    banner.style.display = 'flex';
    if (counter) counter.textContent = `Syncing ${q.length} queued visit${q.length > 1 ? 's' : ''}…`;
  } else {
    banner.style.display = 'none';
  }
}

// ── Sync queued visits to Supabase ─────

async function syncOfflineQueue() {
  const q = await getOfflineQueue();
  if (!q.length) { updateOfflineBanner(); return; }

  updateOfflineBanner(); // show "syncing" state

  let synced = 0;
  const failed = [];

  for (const item of q) {
    try {
      const { _queuedAt, ...cleanItem } = item;

      // Upsert patient (may already exist from a previous partial sync)
      const { error: ptErr } = await SB.from('patients')
        .upsert({ ...cleanItem.pt, user_id: window._uid }, { onConflict: 'id' });
      if (ptErr) throw ptErr;

      // Insert visit
      const { error: visErr } = await SB.from('visits')
        .insert({ ...cleanItem.v, user_id: window._uid });
      // Ignore duplicate key — visit may have been inserted in a previous partial sync
      if (visErr && !visErr.message?.includes('duplicate') && !visErr.code === '23505') throw visErr;

      // Update in-memory cache
      const cachedPt = window._cache.patients.find(p => p.id === cleanItem.pt.id);
      if (cachedPt) Object.assign(cachedPt, cleanItem.pt);
      else window._cache.patients.push({ ...cleanItem.pt, user_id: window._uid });

      if (!window._cache.visits.find(v => v.id === cleanItem.v.id))
        window._cache.visits.push({ ...cleanItem.v, user_id: window._uid });

      synced++;
    } catch (err) {
      console.error('Offline sync failed for item:', item, err);
      failed.push(item);
    }
  }

  // Keep only failed items in queue
  await IDB.set(QUEUE_KEY, failed);
  updateOfflineBanner();

  if (synced > 0) {
    toast(`${synced} offline visit${synced > 1 ? 's' : ''} synced!`);
    // Refresh visible page if it's patients or dashboard
    if (typeof renderDash     === 'function') renderDash();
    if (typeof renderPatients === 'function' &&
        document.getElementById('pg-patients')?.style.display !== 'none') renderPatients();
  }

  if (failed.length > 0) {
    toast(`${failed.length} visit${failed.length > 1 ? 's' : ''} failed to sync`, 'danger');
  }
}

// ── Event listeners ───────────────────

window.addEventListener('online',  () => { updateOfflineBanner(); syncOfflineQueue(); });
window.addEventListener('offline', () => updateOfflineBanner());

// Run once on load to restore banner state
window.addEventListener('load', () => {
  updateOfflineBanner();
  // If we're online and there's a queue, sync immediately
  if (navigator.onLine) syncOfflineQueue();
});
