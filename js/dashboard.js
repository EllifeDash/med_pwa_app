// ════════════════════════════════════════
// dashboard.js — Dashboard Page
// CHANGED: Removed Avg/Visit KPI.
//          Added custom date range picker.
// ════════════════════════════════════════

let dashRange      = 'today';
let customStart    = '';
let customEnd      = '';

// ── Range pill handler ─────────────────
function setDashRange(r, btn) {
  dashRange = r;
  document.querySelectorAll('.dpill').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  else document.querySelector(`.dpill[data-range="${r}"]`)?.classList.add('on');
  // Close custom panel if switching to a preset
  if (r !== 'custom') closeCustomPanel();
  renderDash();
}

// ── Custom date panel toggle ───────────
function toggleCustomPanel() {
  const panel = document.getElementById('customDatePanel');
  const isOpen = panel.classList.toggle('open');
  // Mark the custom pill active while panel is open
  document.querySelectorAll('.dpill').forEach(b => b.classList.remove('on'));
  if (isOpen) {
    document.querySelector('.dpill[data-range="custom"]').classList.add('on');
  } else {
    // Revert to active range pill
    document.querySelector(`.dpill[data-range="${dashRange}"]`)?.classList.add('on');
  }
}

function closeCustomPanel() {
  document.getElementById('customDatePanel')?.classList.remove('open');
}

// ── Apply custom date range ────────────
function applyCustomRange() {
  const s = document.getElementById('customStart').value;
  const e = document.getElementById('customEnd').value;
  if (!s || !e) { toast('Please select both a start and end date', 'danger'); return; }
  if (s > e)    { toast('Start date must be before end date', 'danger'); return; }
  customStart = s;
  customEnd   = e;
  dashRange   = 'custom';
  closeCustomPanel();
  document.querySelectorAll('.dpill').forEach(b => b.classList.remove('on'));
  document.querySelector('.dpill[data-range="custom"]').classList.add('on');
  renderDash();
}

// ── Date range calculator ──────────────
function dashDateRange(range) {
  const now = new Date();
  const tod = now.toISOString().slice(0, 10);

  if (range === 'custom') return { start: customStart || tod, end: customEnd || tod };
  if (range === 'today')  return { start: tod, end: tod };

  if (range === 'week') {
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return { start: mon.toISOString().slice(0, 10), end: tod };
  }
  if (range === 'month') {
    const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
    return { start: `${y}-${m}-01`, end: tod };
  }
  if (range === 'year') return { start: `${now.getFullYear()}-01-01`, end: tod };

  return { start: null, end: null }; // all time
}

// ── Filter visits by active range ──────
function filterVisRange(vis, range) {
  const { start, end } = dashDateRange(range);
  if (!start) return vis;
  return vis.filter(v => v.date >= start && v.date <= end);
}

// ── Chart data builder ─────────────────
function buildChartData(vis, range) {
  const now = new Date();

  if (range === 'today') {
    const buckets = Array.from({length: 24}, (_, i) => ({ l: i % 6 === 0 ? i + 'h' : '', v: 0 }));
    vis.forEach(v => {
      const h = parseInt((v.time || '00:00').split(':')[0]);
      if (buckets[h]) buckets[h].v += (v.net || 0);
    });
    return buckets;
  }

  if (range === 'week') {
    const labels  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const buckets = labels.map(l => ({ l, v: 0 }));
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    mon.setHours(0, 0, 0, 0);
    vis.forEach(v => {
      const d   = new Date(v.date + 'T00:00:00');
      const idx = Math.floor((d - mon) / 86400000);
      if (idx >= 0 && idx < 7) buckets[idx].v += (v.net || 0);
    });
    return buckets;
  }

  if (range === 'month') {
    const dim     = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const buckets = Array.from({length: dim}, (_, i) => ({
      l: (i + 1) % 5 === 1 || i === dim - 1 ? String(i + 1) : '', v: 0
    }));
    vis.forEach(v => {
      const d = parseInt(v.date.split('-')[2]) - 1;
      if (buckets[d]) buckets[d].v += (v.net || 0);
    });
    return buckets;
  }

  if (range === 'year') {
    const mo      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const buckets = mo.map(l => ({ l, v: 0 }));
    vis.forEach(v => {
      const m = parseInt(v.date.split('-')[1]) - 1;
      if (buckets[m]) buckets[m].v += (v.net || 0);
    });
    return buckets;
  }

  // Custom range — bucket by day if ≤31 days, else by month
  if (range === 'custom' && customStart && customEnd) {
    const s    = new Date(customStart + 'T00:00:00');
    const e    = new Date(customEnd   + 'T00:00:00');
    const days = Math.round((e - s) / 86400000) + 1;

    if (days <= 31) {
      const buckets = Array.from({length: days}, (_, i) => {
        const d  = new Date(s); d.setDate(s.getDate() + i);
        const ds = d.toISOString().slice(0, 10);
        const lbl = (i === 0 || i === days - 1 || i % Math.ceil(days / 6) === 0)
          ? `${d.getDate()}/${d.getMonth()+1}` : '';
        return { l: lbl, v: 0, date: ds };
      });
      vis.forEach(v => {
        const b = buckets.find(b => b.date === v.date);
        if (b) b.v += (v.net || 0);
      });
      return buckets;
    } else {
      // Group by month for longer ranges
      const map = {};
      vis.forEach(v => { const k = v.date.slice(0,7); map[k] = (map[k]||0) + (v.net||0); });
      const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return Object.keys(map).sort().map(k => {
        const [y, m] = k.split('-');
        return { l: mo[+m-1] + " '" + y.slice(2), v: map[k] };
      });
    }
  }

  // All time — group by year-month
  if (!vis.length) return [];
  const map = {};
  vis.forEach(v => { const k = v.date.slice(0, 7); map[k] = (map[k] || 0) + (v.net || 0); });
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return Object.keys(map).sort().map(k => {
    const [y, m] = k.split('-');
    return { l: mo[+m - 1] + " '" + y.slice(2), v: map[k] };
  });
}

// ── SVG bar chart builder ──────────────
function buildSvgBarChart(data) {
  const noData = !data.length || data.every(d => d.v === 0);
  if (noData) {
    return `<div class="empty" style="padding:24px 0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:38px;height:38px;opacity:.2">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
      <p style="font-size:13px;margin-top:6px">No revenue data for this period</p>
    </div>`;
  }

  const W = 480, H = 155, pL = 50, pB = 28, pT = 10, pR = 8;
  const cW = W - pL - pR, cH = H - pB - pT;
  const max  = Math.max(...data.map(d => d.v), 1);
  const n    = data.length;
  const slot = cW / n;
  const bw   = Math.max(5, Math.min(34, slot * 0.62));

  const grid = [0.25, 0.5, 0.75, 1].map(f => {
    const y   = pT + cH - Math.round(f * cH);
    const lbl = max * f >= 1000 ? ((max * f) / 1000).toFixed(1) + 'k' : Math.round(max * f);
    return `<line x1="${pL}" y1="${y}" x2="${W-pR}" y2="${y}" stroke="var(--bd)" stroke-width="1"/>
<text x="${pL-5}" y="${y+4}" text-anchor="end" font-size="10" fill="var(--tx3)">${lbl}</text>`;
  }).join('');

  const step = Math.ceil(n / 10);
  const bars = data.map((d, i) => {
    const bh    = Math.max(d.v > 0 ? 2 : 0, Math.round((d.v / max) * cH));
    const x     = pL + i * slot + (slot - bw) / 2;
    const y     = pT + cH - bh;
    const alpha = d.v > 0 ? 1 : 0;
    const lbl   = (d.l && (i % step === 0 || i === n - 1))
      ? `<text x="${(x+bw/2).toFixed(1)}" y="${H-7}" text-anchor="middle" font-size="9" fill="var(--tx3)">${d.l}</text>`
      : '';
    return `<rect x="${x.toFixed(1)}" y="${y}" width="${bw.toFixed(1)}" height="${bh}" rx="3" fill="var(--p)" opacity="${alpha}"/>${lbl}`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;overflow:visible">${grid}${bars}</svg>`;
}

// ── Main render ────────────────────────
async function renderDash() {
  const pts    = await gPts();
  const allVis = await gVis();
  const s      = await gSet();
  const now    = new Date();
  const h      = now.getHours();

  document.getElementById('dashGreet').textContent =
    `Good ${h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'}, ${(s.name || 'Doctor').split(' ')[0]}!`;
  document.getElementById('dashDate').textContent =
    now.toLocaleDateString('en-PK', {weekday:'long', year:'numeric', month:'long', day:'numeric'});

  const vis            = filterVisRange(allVis, dashRange);
  const { start, end } = dashDateRange(dashRange);

  // ── KPI calculations (Avg/Visit removed) ──
  const revenue  = vis.reduce((a, v) => a + (v.net      || 0), 0);
  const discount = vis.reduce((a, v) => a + (v.discount || 0), 0);
  const newPts   = start
    ? pts.filter(p => {
        const first = allVis
          .filter(v => v.patientId === p.id)
          .sort((a, b) => a.date.localeCompare(b.date))[0];
        return first && first.date >= start && first.date <= end;
      }).length
    : pts.length;

  const kpiIcon = path =>
    `<svg class="kpi-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${path}</svg>`;

  // 4 KPI cards — Avg/Visit removed
  document.getElementById('statsGrid').innerHTML = `
    <div class="kpi-card">
      ${kpiIcon('<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/>')}
      <div class="kpi-l">Visits</div>
      <div class="kpi-v">${vis.length}</div>
    </div>
    <div class="kpi-card kpi-green">
      ${kpiIcon('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/>')}
      <div class="kpi-l">Revenue</div>
      <div class="kpi-v" style="color:var(--ok)">Rs.&nbsp;${revenue.toLocaleString()}</div>
    </div>
    <div class="kpi-card">
      ${kpiIcon('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>')}
      <div class="kpi-l">New Patients</div>
      <div class="kpi-v">${newPts}</div>
    </div>
    <div class="kpi-card kpi-amber">
      ${kpiIcon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>')}
      <div class="kpi-l">Discount Given</div>
      <div class="kpi-v" style="font-size:20px;color:var(--warn)">Rs.&nbsp;${discount.toLocaleString()}</div>
    </div>`;

  // ── Pending Bookings ───────────────────
  renderDashBookings();

  // ── Pending Patients ───────────────────
  if (typeof renderPendingPatients === 'function') renderPendingPatients();
}

// ── Pending Bookings (dashboard) ────────
async function renderDashBookings() {
  const el = document.getElementById('dashBookings');
  if (!el) return;

  // Ensure appointments cache is populated
  const all = window._cache?.appointments;
  if (!all || !all.length) {
    el.innerHTML = '';
    return;
  }

  const pending = all.filter(a => a.status === 'pending').slice(0, 5);

  el.innerHTML = `
    <div class="card" style="margin-top:16px">
      <div class="flex ic jb mb12">
        <h3>Pending Bookings</h3>
        <button class="btn bg bsm" onclick="go('bookings',null)">View All →</button>
      </div>
      ${pending.length
        ? pending.map(a => {
            const name  = a.patient_name || 'Unknown';
            const date  = a.preferred_date ? fmtDate(a.preferred_date) : '';
            const time  = a.preferred_time || '';
            const when  = date && time ? `${date} | ${time}` : (date || time || 'Unscheduled');
            const phone = a.patient_phone || '';
            const notes = a.notes || '';
            const waDigits = phone.replace(/\D/g, '');
            const waNumber = waDigits.startsWith('92') ? waDigits
              : waDigits.startsWith('0') ? '92' + waDigits.slice(1) : '92' + waDigits;

            return `
              <div class="bk-card-mini" onclick="go('bookings',null)" style="cursor:pointer">
                <div class="flex ic jb">
                  <div class="bk-name" style="font-size:14px">${name}</div>
                  <span class="bdg b-amber" style="font-size:10px;padding:2px 8px">Pending</span>
                </div>
                <div class="bk-meta" style="font-size:12px;margin-top:1px">${when}</div>
                <div class="flex ic g8" style="margin-top:4px">
                  ${phone ? `<span style="font-size:13px;font-weight:500">${phone}</span>` : ''}
                  ${phone ? `<a href="https://wa.me/${waNumber}" target="_blank" class="bk-wa-badge" style="width:24px;height:24px" title="Chat on WhatsApp">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                  </a>` : ''}
                  ${notes ? `<span class="tsm ts" style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px">${notes}</span>` : ''}
                </div>
              </div>`;
          }).join('<hr class="divider" style="margin:8px 0"/>')
        : `<div class="empty" style="padding:12px 0"><p style="font-size:13px">All clear — no pending bookings</p></div>`
      }
    </div>`;
}
