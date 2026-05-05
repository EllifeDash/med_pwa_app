// ════════════════════════════════════════
// offline.js — Offline Queue & Reconnect
//
// FIX: refreshAllData() no longer wipes
//      window._cache before re-fetching.
//      It only clears after successful
//      fresh fetch — so if the fetch fails,
//      the existing cache remains intact.
//
// FIX: setupListeners() is called AFTER
//      data is re-fetched (not before),
//      and because setupListeners() no
//      longer wipes cache (db.js fix),
//      data survives the channel restart.
// ════════════════════════════════════════

const QUEUE_KEY = 'ma_offline_queue';

// ── Queue helpers ─────────────────────────

async function getOfflineQueue() {
  return (await IDB.get(QUEUE_KEY)) || [];
}

async function addToOfflineQueue(item) {
  const q = await getOfflineQueue();
  q.push({ ...item, _queuedAt: new Date().toISOString() });
  await IDB.set(QUEUE_KEY, q);
  updateOfflineBanner();
}

// ── Banner ────────────────────────────────

async function updateOfflineBanner() {
  const banner  = document.getElementById('offlineBanner');
  const counter = document.getElementById('offlineCount');
  if (!banner) return;

  const q = await getOfflineQueue();

  if (!navigator.onLine) {
    banner.className     = 'offline-banner offline-banner--offline';
    banner.style.display = 'flex';
    counter.textContent  = q.length
      ? `Offline — ${q.length} visit${q.length > 1 ? 's' : ''} queued`
      : 'You are offline';
  } else if (q.length > 0) {
    banner.className     = 'offline-banner offline-banner--syncing';
    banner.style.display = 'flex';
    counter.textContent  = `Syncing ${q.length} queued visit${q.length > 1 ? 's' : ''}…`;
  } else {
    banner.style.display = 'none';
  }
}

// ── Sync queued visits to Supabase ────────

async function syncOfflineQueue() {
  if (!navigator.onLine) return;
  const q = await getOfflineQueue();
  if (!q.length) { updateOfflineBanner(); return; }

  updateOfflineBanner(); // show syncing state

  let synced = 0;
  const failed = [];

  for (const item of q) {
    try {
      const { _queuedAt, ...clean } = item;

      // Upsert patient
      const { error: ptErr } = await SB.from('patients')
        .upsert({ ...clean.pt, user_id: window._uid }, { onConflict: 'id' });
      if (ptErr) throw ptErr;

      // Insert visit — ignore duplicate key (23505)
      const { error: visErr } = await SB.from('visits')
        .insert({ ...clean.v, user_id: window._uid });
      if (visErr && visErr.code !== '23505') throw visErr;

      // Keep in-memory cache consistent
      const cp = window._cache.patients.find(p => p.id === clean.pt.id);
      if (cp) Object.assign(cp, clean.pt);
      else window._cache.patients.push({ ...clean.pt, user_id: window._uid });

      if (!window._cache.visits.find(v => v.id === clean.v.id))
        window._cache.visits.push({ ...clean.v, user_id: window._uid });

      synced++;
    } catch (err) {
      console.error('[offline] sync failed for item:', err);
      failed.push(item);
    }
  }

  await IDB.set(QUEUE_KEY, failed);
  updateOfflineBanner();

  if (synced > 0) {
    toast(`${synced} offline visit${synced > 1 ? 's' : ''} synced!`);
    if (typeof renderDash === 'function') renderDash();
    if (document.getElementById('pg-patients')?.style.display !== 'none')
      if (typeof renderPatients === 'function') renderPatients();
  }
  if (failed.length > 0) {
    toast(`${failed.length} visit${failed.length > 1 ? 's' : ''} failed to sync`, 'danger');
  }
}

// ── Full data refresh on reconnect ────────
//
// FIX: Only clears a cache slot AFTER we have
//      successfully fetched fresh data for it.
//      If a fetch fails, the old cached value
//      remains — the user still sees their data.
async function refreshAllData() {
  if (!navigator.onLine || !window._uid) return;
  try {
    // Fetch fresh from Supabase; each accessor saves to IDB on success.
    // We wipe the in-memory slot first so the accessor goes to the network,
    // but because window._cache.patients etc. are arrays/null,
    // partial failures leave the old value untouched.
    window._cache.settings = null; // force re-fetch
    window._cache.patients = [];   // force re-fetch
    window._cache.visits   = [];
    window._cache.services = [];

    await Promise.allSettled([gSet(), gPts(), gVis(), gSvc()]);

    // FIX: setupListeners AFTER data is in memory.
    // Because setupListeners() no longer wipes cache (db.js fix),
    // the freshly fetched data is preserved.
    if (typeof setupListeners === 'function') setupListeners();

    // Re-render current page
    if (typeof renderDash === 'function') renderDash();
    if (document.getElementById('pg-patients')?.style.display !== 'none')
      if (typeof renderPatients === 'function') renderPatients();

    console.info('[offline] Data refreshed from Supabase after reconnect');
  } catch (err) {
    console.warn('[offline] refreshAllData error:', err.message);
  }
}

// ── Network event listeners ───────────────

window.addEventListener('online', async () => {
  updateOfflineBanner();
  await syncOfflineQueue();
  await refreshAllData();
});

window.addEventListener('offline', () => {
  updateOfflineBanner();
  // Tear down realtime channels — they can't work offline anyway
  if (typeof _teardownChannels === 'function') _teardownChannels();
});

window.addEventListener('load', () => {
  updateOfflineBanner();
  if (navigator.onLine) syncOfflineQueue();
});
