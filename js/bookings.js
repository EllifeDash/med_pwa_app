// ════════════════════════════════════════
// js/bookings.js — Internal App Module
//
// Covers:
//  1. updateAppointment()  — concurrency-safe
//     Accept / Reject / Reschedule actions.
//     "First Responder Wins" via .eq('status','pending').
//
//  2. listenToAppointments() — Realtime channel
//     Pushes INSERT / UPDATE events to a
//     caller-supplied callback. Call once on
//     app boot; the channel auto-reconnects.
//
//  3. buildWhatsAppURL()   — Utility
//     Constructs a wa.me confirmation link
//     for manual outreach by the assistant.
//
// Depends on: window.SB  (Supabase client,
//             set in supabase.js)
//             window._uid (authenticated UID)
// ════════════════════════════════════════

// ── 1. Concurrency-Safe Status Update ────
//
// Action values: 'accepted' | 'rejected' | 'rescheduled'
// For 'rescheduled', pass newDate and newTime in opts.
//
// How "First Responder Wins" works:
//   The UPDATE targets BOTH the appointment id AND
//   status = 'pending'. If another assistant already
//   changed the status, the .eq('status','pending')
//   filter matches 0 rows — Supabase returns count: 0.
//   We detect that and warn the user rather than
//   silently overwriting the other assistant's action.

/**
 * @param {string} appointmentId
 * @param {'accepted'|'rejected'|'rescheduled'} action
 * @param {{ newDate?: string, newTime?: string }} [opts]
 */
async function updateAppointment(appointmentId, action, opts = {}) {

  // ── Offline guard ──────────────────────
  if (!navigator.onLine) {
    toast('You are offline. Please reconnect before actioning an appointment.', 'danger');
    return;
  }

  // ── Build the patch payload ────────────
  const patch = {
    status:     action,
    handled_by: window._uid,          // record which assistant acted
    handled_at: new Date().toISOString(),
  };

  // Only attach rescheduled fields when provided
  if (action === 'rescheduled') {
    if (!opts.newDate || !opts.newTime) {
      toast('Please provide a new date and time to reschedule.', 'danger');
      return;
    }
    patch.preferred_date = opts.newDate;
    patch.preferred_time = opts.newTime;
  }

  // ── Concurrency-safe UPDATE ────────────
  // `.eq('status', 'pending')` is the race-condition lock:
  // if the row was already claimed, 0 rows match → count === 0.
  const { error, count } = await SB
    .from('appointments')
    .update(patch)
    .eq('id', appointmentId)
    .eq('status', 'pending')   // ← "First Responder Wins" guard
    .select('id', { count: 'exact', head: true }); // returns count only

  if (error) {
    console.error('[bookings] update error:', error.message);
    toast('Update failed — please try again.', 'danger');
    return;
  }

  // ── Concurrency collision check ────────
  if (count === 0) {
    // Another assistant beat us to it
    toast('⚠️ This appointment was already claimed by another assistant.', 'danger');
    // Optionally refresh the row to show current state:
    renderBookings();
    return;
  }

  // ── Success ────────────────────────────
  if (window._cache?.appointments) {
    const i = window._cache.appointments.findIndex(a => a.id === appointmentId);
    if (i > -1) window._cache.appointments[i] = { ...window._cache.appointments[i], ...patch };
  }
  const labels = { accepted: 'accepted ✓', rejected: 'rejected', rescheduled: 'rescheduled ✓' };
  toast(`Appointment ${labels[action]}`);
  renderBookings(); // re-render the bookings list
}

// ── 1b. Bookings UI + Cache ──────────────

function _ensureApptCache() {
  if (!window._cache)
    window._cache = { patients: [], visits: [], services: [], settings: null, appointments: [] };
  if (!Array.isArray(window._cache.appointments)) window._cache.appointments = [];
}

async function _fetchAppointments(force = false) {
  _ensureApptCache();

  if (!force && window._cache.appointments.length) return window._cache.appointments;
  if (!navigator.onLine) return window._cache.appointments;

  try {
    const { data, error } = await SB
      .from('appointments')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) {
      window._cache.appointments = data || [];
      return window._cache.appointments;
    }
    console.warn('[bookings] load error:', error.message);
  } catch (err) {
    console.warn('[bookings] load error:', err.message);
  }

  return window._cache.appointments;
}

function _applyApptChange(payload) {
  _ensureApptCache();
  const arr = window._cache.appointments;

  if (payload.eventType === 'INSERT') {
    if (!arr.find(x => x.id === payload.new.id)) arr.unshift(payload.new);
  } else if (payload.eventType === 'UPDATE') {
    const i = arr.findIndex(x => x.id === payload.new.id);
    if (i > -1) arr[i] = payload.new; else arr.unshift(payload.new);
  } else if (payload.eventType === 'DELETE') {
    const i = arr.findIndex(x => x.id === payload.old.id);
    if (i > -1) arr.splice(i, 1);
  }
}

function _ensureApptListener() {
  if (window._apptChannel || !navigator.onLine || !window._uid) return;

  window._apptChannel = listenToAppointments(payload => {
    _applyApptChange(payload);

    const listVisible = document.getElementById('pg-bookings')?.style.display !== 'none';
    if (payload.eventType === 'INSERT') {
      if (!listVisible) {
        const nm = payload.new?.patient_name || 'New booking';
        toast(`New booking: ${nm}`);
      }
    }
    if (listVisible) renderBookings();
  });
}

async function renderBookings(force = false) {
  _ensureApptListener();

  const listEl = document.getElementById('bookingsList');
  const countEl = document.getElementById('bkPendingCount');
  if (!listEl) return;

  listEl.innerHTML = '<div class="skel-card"><div class="skeleton skel-avatar"></div><div style="flex:1"><div class="skeleton skel-line long"></div><div class="skeleton skel-line short"></div></div></div>';

  const all = await _fetchAppointments(force);
  const pending = all.filter(a => (a.status || 'pending') === 'pending');

  if (countEl) countEl.textContent = `${pending.length} Pending`;

  if (!pending.length) {
    const msg = navigator.onLine
      ? 'No pending bookings right now.'
      : 'Offline. Connect to load bookings.';
    listEl.innerHTML = `
      <div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <p>Bookings</p>
        <span>${msg}</span>
      </div>
    `;
    return;
  }

  listEl.innerHTML = pending.map(a => {
    const name  = a.patient_name || 'Unknown';
    const svc   = a.service || '';
    const date  = a.preferred_date ? fmtDate(a.preferred_date) : '';
    const time  = a.preferred_time || '';
    const when  = date && time ? `${date} | ${time}` : (date || time || 'Unscheduled');
    const phone = a.phone || '';
    const addr  = a.address || '';
    const notes = a.notes || '';

    return `
      <div class="card bk-card">
        <div class="bk-top">
          <div>
            <div class="bk-name">${name}</div>
            <div class="bk-meta">${when}</div>
          </div>
          <span class="bdg b-amber">Pending</span>
        </div>
        <div class="bk-row">
          ${svc ? `<span class="bk-chip">Service: ${svc}</span>` : ''}
          ${phone ? `<span class="bk-chip">Phone: ${phone}</span>` : ''}
          ${addr ? `<span class="bk-chip">Address: ${addr}</span>` : ''}
        </div>
        ${notes ? `<div class="bk-note">${notes}</div>` : ''}
        <div class="bk-actions">
          <button class="btn bs bsm" onclick="updateAppointment('${a.id}','accepted')">Accept</button>
          <button class="btn bd bsm" onclick="updateAppointment('${a.id}','rejected')">Reject</button>
          <button class="btn bg bsm" data-id="${a.id}" onclick="openReschedule(this)">Reschedule</button>
        </div>
      </div>
    `;
  }).join('');
}

function openReschedule(btn) {
  const id = btn?.dataset?.id;
  if (!id) return;

  _ensureApptCache();
  const appt = window._cache.appointments.find(a => a.id === id) || {};

  const modal = document.getElementById('bkReschedModal');
  if (!modal) return;
  modal.dataset.id = id;

  const nameEl = document.getElementById('bkReschedName');
  if (nameEl) nameEl.textContent = appt.patient_name || 'Booking';

  const d = document.getElementById('bkNewDate');
  const t = document.getElementById('bkNewTime');
  if (d) d.value = appt.preferred_date || '';
  if (t) t.value = appt.preferred_time || '';

  openMo('bkReschedModal');
}

async function submitReschedule() {
  const modal = document.getElementById('bkReschedModal');
  const id = modal?.dataset?.id;
  if (!id) return;

  const newDate = document.getElementById('bkNewDate')?.value || '';
  const newTime = document.getElementById('bkNewTime')?.value || '';

  await updateAppointment(id, 'rescheduled', { newDate, newTime });
  closeMo('bkReschedModal');
}


// ── 2. Realtime Channel Subscription ─────
//
// Listens to all INSERT and UPDATE events on
// `appointments` filtered to the current user's
// scope (via RLS — no client-side filter needed
// since the DB already enforces it).
//
// `onEvent` receives the full Supabase payload:
//   { eventType: 'INSERT'|'UPDATE', new: {...}, old: {...} }
//
// Returns the channel object so the caller can
// call SB.removeChannel(ch) on sign-out / cleanup.

/**
 * @param {(payload: object) => void} onEvent
 * @returns {RealtimeChannel}
 */
function listenToAppointments(onEvent) {
  const ch = SB
    .channel('appointments_feed')
    .on(
      'postgres_changes',
      {
        event:  '*',          // INSERT + UPDATE + DELETE
        schema: 'public',
        table:  'appointments',
      },
      payload => {
        // Pass raw payload to the caller — keep this layer thin
        onEvent(payload);
      }
    )
    .subscribe(status => {
      if (status === 'SUBSCRIBED')
        console.info('[bookings] realtime channel active');
      if (status === 'CHANNEL_ERROR')
        console.warn('[bookings] realtime channel error — will retry');
    });

  return ch;
}

// ── Usage example (call once in dashboard init) ──────────
//
//   const apptChannel = listenToAppointments(payload => {
//     if (payload.eventType === 'INSERT') {
//       // New appointment from landing page — prepend to list
//       window._cache.appointments.unshift(payload.new);
//       renderBookings();
//       toast(`New appointment: ${payload.new.patient_name}`);
//     }
//     if (payload.eventType === 'UPDATE') {
//       // A colleague just claimed/rescheduled — update the row in cache
//       const idx = window._cache.appointments
//         .findIndex(a => a.id === payload.new.id);
//       if (idx > -1) window._cache.appointments[idx] = payload.new;
//       renderBookings();
//     }
//   });
//
//   // On sign-out / page teardown:
//   // SB.removeChannel(apptChannel);


// ── 3. WhatsApp Confirmation URL Builder ──
//
// Builds a pre-filled wa.me URL the assistant
// can tap to send a manual confirmation message.
// `phone` should be E.164 without '+' or spaces
// (e.g. "923001234567"). The function normalises
// common Pakistani formats automatically.
//
// @param {object} appt  — appointment row from DB
// @param {string} assistantName — from settings / auth
// @returns {string}     — full https://wa.me/... URL

/**
 * @param {{ patient_name: string, phone: string, service: string, preferred_date: string, preferred_time: string }} appt
 * @param {string} assistantName
 * @returns {string}
 */
function buildWhatsAppURL(appt, assistantName) {

  // ── Normalise phone to E.164 digits only ──
  // Handles: 0300-1234567, +92 300 1234567, 923001234567
  const digits = appt.phone.replace(/\D/g, '');
  const e164   = digits.startsWith('92')
    ? digits                        // already country-coded
    : digits.startsWith('0')
      ? '92' + digits.slice(1)      // local 0xxx → 92xxx
      : '92' + digits;              // bare number → prepend 92

  // ── Format the date for the message ──────
  const dateParts = appt.preferred_date?.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  const niceDate = dateParts
    ? `${+dateParts[2]} ${months[+dateParts[1]-1]} ${dateParts[0]}`
    : appt.preferred_date;

  // ── Message body ─────────────────────────
  const msg = [
    `Assalam-u-Alaikum *${appt.patient_name}*! 👋`,
    ``,
    `Your home care appointment has been *confirmed* ✅`,
    ``,
    `📋 *Service:* ${appt.service}`,
    `📅 *Date:*    ${niceDate}`,
    `🕐 *Time:*    ${appt.preferred_time}`,
    ``,
    `Our attendant *${assistantName}* will arrive at your address.`,
    `Please keep your prescription/doctor's note ready if required.`,
    ``,
    `For any changes, reply here or call us directly.`,
    ``,
    `_Nankana Home Care — Your health, our priority_ 🏥`,
  ].join('\n');

  return `https://wa.me/${e164}?text=${encodeURIComponent(msg)}`;
}


// ── Expose to global scope ─────────────────
// (Consistent with the project's no-module pattern
//  for defer-loaded scripts used alongside supabase.js)
window.updateAppointment   = updateAppointment;
window.listenToAppointments = listenToAppointments;
window.buildWhatsAppURL    = buildWhatsAppURL;
window.renderBookings       = renderBookings;
window.openReschedule       = openReschedule;
window.submitReschedule     = submitReschedule;
