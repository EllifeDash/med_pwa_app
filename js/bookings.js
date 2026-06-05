// ════════════════════════════════════════
// js/bookings.js — Internal App Module
//
// Covers:
//  1. Tab filter UI (Pending / Accepted / Rescheduled / Rejected)
//  2. updateAppointment()  — concurrency-safe Accept / Reject / Reschedule
//  3. handleAccept()       — caches row, updates DB, opens WhatsApp
//  4. listenToAppointments() — Realtime channel
//  5. buildWhatsAppURL()   — wa.me confirmation link
// ════════════════════════════════════════

let _bookingFilter = 'pending';

function setBookingFilter(filter, btn) {
  _bookingFilter = filter;
  document.querySelectorAll('#bkFilters .dpill').forEach(b => b.classList.toggle('on', b.dataset.filter === filter));
  renderBookings();
}

// ── 1. Concurrency-Safe Status Update ────
//
// Action values: 'accepted' | 'rejected' | 'rescheduled'
// For 'rescheduled', pass newDate and newTime in opts.
//
// Returns true on success, false on failure/collision.
async function updateAppointment(appointmentId, action, opts = {}) {

  if (!navigator.onLine) {
    toast('You are offline. Please reconnect before actioning an appointment.', 'danger');
    return false;
  }

  const patch = {
    status:     action,
    handled_by: window._uid,
    handled_at: new Date().toISOString(),
  };

  if (action === 'rescheduled') {
    if (!opts.newDate || !opts.newTime) {
      toast('Please provide a new date and time to reschedule.', 'danger');
      return false;
    }
    patch.preferred_date = opts.newDate;
    patch.preferred_time = opts.newTime;
  }

  const { error, count } = await SB
    .from('appointments')
    .update(patch)
    .eq('id', appointmentId)
    .eq('status', 'pending')
    .select('id', { count: 'exact', head: true });

  if (error) {
    console.error('[bookings] update error:', error.message);
    toast('Update failed — please try again.', 'danger');
    return false;
  }

  if (count === 0) {
    toast('⚠️ This appointment was already claimed by another assistant.', 'danger');
    renderBookings();
    return false;
  }

  if (window._cache?.appointments) {
    const i = window._cache.appointments.findIndex(a => a.id === appointmentId);
    if (i > -1) window._cache.appointments[i] = { ...window._cache.appointments[i], ...patch };
  }
  const labels = { accepted: 'accepted ✓', rejected: 'rejected', rescheduled: 'rescheduled ✓' };
  toast(`Appointment ${labels[action]}`);
  renderBookings();
  return true;
}

// ── WhatsApp trigger on Accept ────────────

async function handleAccept(appointmentId) {
  _ensureApptCache();
  const appt = window._cache.appointments.find(a => a.id === appointmentId);
  if (!appt) return;

  const ok = await updateAppointment(appointmentId, 'accepted');
  if (!ok) return;

  const s = window._cache?.settings || {};
  const name = s.name || 'Medical Attendant';
  const url = buildWhatsAppURL(appt, name);
  window.open(url, '_blank');
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

const _STATUS_STYLE = {
  pending:     'b-amber',
  accepted:    'b-green',
  rescheduled: 'b-blue',
  rejected:    'b-red',
};

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

  const listEl  = document.getElementById('bookingsList');
  const countEl = document.getElementById('bkPendingCount');
  if (!listEl) return;

  listEl.innerHTML = '<div class="skel-card"><div class="skeleton skel-avatar"></div><div style="flex:1"><div class="skeleton skel-line long"></div><div class="skeleton skel-line short"></div></div></div>';

  const all = await _fetchAppointments(force);

  const countByStatus = {};
  all.forEach(a => {
    const s = a.status || 'pending';
    countByStatus[s] = (countByStatus[s] || 0) + 1;
  });

  document.querySelectorAll('#bkFilters .dpill').forEach(b => {
    const f = b.dataset.filter;
    const c = countByStatus[f] || 0;
    const span = b.querySelector('.bk-fcnt') || (() => { const s = document.createElement('span'); s.className = 'bk-fcnt'; b.appendChild(s); return s; })();
    span.textContent = c;
  });

  if (countEl) countEl.textContent = countByStatus[_bookingFilter] || 0;

  const filtered = all.filter(a => (a.status || 'pending') === _bookingFilter);

  if (!filtered.length) {
    const msg = navigator.onLine
      ? `No ${_bookingFilter} bookings.`
      : 'Offline. Connect to load bookings.';
    listEl.innerHTML = `
      <div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <p>${_bookingFilter.charAt(0).toUpperCase() + _bookingFilter.slice(1)}</p>
        <span>${msg}</span>
      </div>
    `;
    return;
  }

  listEl.innerHTML = filtered.map(a => {
    const name  = a.patient_name || 'Unknown';
    const svc   = a.service || '';
    const date  = a.preferred_date ? fmtDate(a.preferred_date) : '';
    const time  = a.preferred_time || '';
    const when  = date && time ? `${date} | ${time}` : (date || time || 'Unscheduled');
    const phone = a.phone || '';
    const addr  = a.address || '';
    const notes = a.notes || '';
    const status = a.status || 'pending';
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    const statusCls  = _STATUS_STYLE[status] || 'b-gray';

    const showActions = status === 'pending';

    return `
      <div class="card bk-card">
        <div class="bk-top">
          <div>
            <div class="bk-name">${name}</div>
            <div class="bk-meta">${when}</div>
          </div>
          <span class="bdg ${statusCls}">${statusLabel}</span>
        </div>
        <div class="bk-row">
          ${svc ? `<span class="bk-chip">Service: ${svc}</span>` : ''}
          ${phone ? `<span class="bk-chip">Phone: ${phone}</span>` : ''}
          ${addr ? `<span class="bk-chip">Address: ${addr}</span>` : ''}
        </div>
        ${notes ? `<div class="bk-note">${notes}</div>` : ''}
        ${showActions ? `
        <div class="bk-actions">
          <button class="btn bs bsm" onclick="handleAccept('${a.id}')">Accept</button>
          <button class="btn bd bsm" onclick="updateAppointment('${a.id}','rejected')">Reject</button>
          <button class="btn bg bsm" data-id="${a.id}" onclick="openReschedule(this)">Reschedule</button>
        </div>` : ''}
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

function listenToAppointments(onEvent) {
  const ch = SB
    .channel('appointments_feed')
    .on(
      'postgres_changes',
      {
        event:  '*',
        schema: 'public',
        table:  'appointments',
      },
      payload => {
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


// ── 3. WhatsApp Confirmation URL Builder ──

function buildWhatsAppURL(appt, assistantName) {

  const digits = appt.phone.replace(/\D/g, '');
  const e164   = digits.startsWith('92')
    ? digits
    : digits.startsWith('0')
      ? '92' + digits.slice(1)
      : '92' + digits;

  const dateParts = appt.preferred_date?.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  const niceDate = dateParts
    ? `${+dateParts[2]} ${months[+dateParts[1]-1]} ${dateParts[0]}`
    : appt.preferred_date;

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
window.updateAppointment   = updateAppointment;
window.listenToAppointments = listenToAppointments;
window.buildWhatsAppURL    = buildWhatsAppURL;
window.renderBookings      = renderBookings;
window.openReschedule      = openReschedule;
window.submitReschedule    = submitReschedule;
window.setBookingFilter    = setBookingFilter;
window.handleAccept        = handleAccept;
