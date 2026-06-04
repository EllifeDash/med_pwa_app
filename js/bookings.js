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
  const labels = { accepted: 'accepted ✓', rejected: 'rejected', rescheduled: 'rescheduled ✓' };
  toast(`Appointment ${labels[action]}`);
  renderBookings(); // re-render the bookings list in the dashboard
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
