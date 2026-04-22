// ════════════════════════════════════════
// dashboard.js — Dashboard Page
// Handles time-range filtering, KPI cards,
// SVG bar chart, top services & top patients.
// ════════════════════════════════════════

let dashRange = 'today';

/**
 * Switch the active time-range pill and re-render the dashboard.
 */
function setDashRange(r, btn) {
  dashRange = r;
  document.querySelectorAll('.dpill').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  else document.querySelector(`.dpill[data-range="${r}"]`)?.classList.add('on');
  renderDash();
}

/**
 * Return { start, end } ISO date strings for a given range.
 * Returns { start: null, end: null } for "all time".
 */
function dashDateRange(range) {
  const now = new Date();
  const tod = now.toISOString().slice(0, 10);

  if (range === 'today') return { start: tod, end: tod };

  if (range === 'week') {
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return { start: mon.toISOString().slice(0, 10), end: tod };
  }

  if (range === 'month') {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return { start: `${y}-${m}-01`, end: tod };
  }

  if (range === 'year') {
    return { start: `${now.getFullYear()}-01-01`, end: tod };
  }

  return { start: null, end: null }; // all time
}

/**
 * Filter a visits array to only those within the active range.
 */
function filterVisRange(vis, range) {
  const { start, end } = dashDateRange(range);
  if (!start) return vis;
  return vis.filter(v => v.date >= start && v.date <= end);
}

/**
 * Build bucketed chart data for the SVG bar chart.
 * Returns an array of { l: label, v: value } objects.
 */
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
      l: (i + 1) % 5 === 1 || i === dim - 1 ? String(i + 1) : '',
      v: 0
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

/**
 * Render an SVG bar chart from bucketed data.
 * Returns an HTML string (either <svg> or empty-state <div>).
 */
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
    return `<line x1="${pL}" y1="${y}" x2="${W - pR}" y2="${y}" stroke="var(--bd)" stroke-width="1"/>
<text x="${pL - 5}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--tx3)">${lbl}</text>`;
  }).join('');

  const step = Math.ceil(n / 10);
  const bars = data.map((d, i) => {
    const bh    = Math.max(d.v > 0 ? 2 : 0, Math.round((d.v / max) * cH));
    const x     = pL + i * slot + (slot - bw) / 2;
    const y     = pT + cH - bh;
    const alpha = d.v > 0 ? 1 : 0;
    const lbl   = (d.l && (i % step === 0 || i === n - 1))
      ? `<text x="${x + bw / 2}" y="${H - 7}" text-anchor="middle" font-size="9" fill="var(--tx3)">${d.l}</text>`
      : '';
    return `<rect x="${x.toFixed(1)}" y="${y}" width="${bw.toFixed(1)}" height="${bh}" rx="3" fill="var(--p)" opacity="${alpha}"/>${lbl}`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;overflow:visible">${grid}${bars}</svg>`;
}

/**
 * Main dashboard render — fetches all data, applies the active range filter,
 * then populates KPI cards, chart, top services, recent visits, and top patients.
 */
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

  const vis           = filterVisRange(allVis, dashRange);
  const { start, end } = dashDateRange(dashRange);

  // ── KPI calculations ─────────────────────
  const revenue  = vis.reduce((a, v) => a + (v.net      || 0), 0);
  const discount = vis.reduce((a, v) => a + (v.discount || 0), 0);
  const avgRev   = vis.length ? Math.round(revenue / vis.length) : 0;
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
    <div class="kpi-card kpi-cyan">
      ${kpiIcon('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>')}
      <div class="kpi-l">Avg / Visit</div>
      <div class="kpi-v" style="font-size:20px;color:var(--ac)">Rs.&nbsp;${avgRev.toLocaleString()}</div>
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

  // ── Revenue chart ────────────────────────
  const chartTitles = {
    today: 'Hourly Revenue — Today',
    week:  'Daily Revenue — This Week',
    month: 'Daily Revenue — This Month',
    year:  'Monthly Revenue — This Year',
    all:   'All-Time Revenue'
  };
  document.getElementById('dashChartTitle').textContent = chartTitles[dashRange] || 'Revenue Trend';
  document.getElementById('dashChartBadge').textContent = `Rs. ${revenue.toLocaleString()}`;
  document.getElementById('dashChart').innerHTML = buildSvgBarChart(buildChartData(vis, dashRange));

  // ── Top services ─────────────────────────
  const svcMap = {};
  vis.forEach(v => (v.services || []).forEach(sv => { svcMap[sv.name] = (svcMap[sv.name] || 0) + 1; }));
  const topSvcs = Object.entries(svcMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxSvc  = topSvcs[0]?.[1] || 1;
  document.getElementById('dashTopSvcs').innerHTML = topSvcs.length
    ? topSvcs.map(([name, cnt]) => `
        <div class="sbar-row">
          <div class="sbar-top">
            <span class="sbar-name">${name}</span>
            <span class="sbar-cnt">${cnt}×</span>
          </div>
          <div class="sbar-track">
            <div class="sbar-fill" style="width:${Math.round((cnt / maxSvc) * 100)}%"></div>
          </div>
        </div>`).join('')
    : `<div class="empty" style="padding:18px 0"><p style="font-size:13px">No services for this period</p></div>`;

  // ── Recent visits ────────────────────────
  const rec = [...vis].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 6);
  document.getElementById('recentVisits').innerHTML = rec.length
    ? rec.map(v => `
        <div class="hi" style="cursor:pointer;margin-bottom:8px" onclick="openHistory('${v.patientId}')">
          <div class="hd">${fmtDate(v.date)} ${v.time || ''}</div>
          <div class="hs">${v.patientName}</div>
          <div class="hn">${(v.services || []).map(sv => sv.name).join(', ')}</div>
          <div class="ha">Rs. ${(v.net || 0).toLocaleString()}</div>
        </div>`).join('')
    : `<div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
          <rect x="9" y="3" width="6" height="4" rx="1"/>
        </svg>
        <p>No visits this period</p>
        <span>Switch range or add a new visit</span>
      </div>`;

  // ── Top patients ─────────────────────────
  const ptRev = {}, ptCnt = {}, ptName = {};
  vis.forEach(v => {
    ptRev[v.patientId]  = (ptRev[v.patientId]  || 0) + (v.net || 0);
    ptCnt[v.patientId]  = (ptCnt[v.patientId]  || 0) + 1;
    ptName[v.patientId] = v.patientName;
  });
  const topPts  = Object.entries(ptRev).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const rankCls = ['gold', 'silver', 'bronze', '', ''];
  document.getElementById('dashTopPts').innerHTML = topPts.length
    ? topPts.map(([pid, rev], i) => `
        <div class="pt-row">
          <div class="pt-rank ${rankCls[i]}">${i + 1}</div>
          <div style="flex:1;min-width:0">
            <div class="pt-name">${ptName[pid] || 'Unknown'}</div>
            <div class="pt-meta">${ptCnt[pid]} visit${ptCnt[pid] !== 1 ? 's' : ''}</div>
          </div>
          <div class="pt-rev">Rs.&nbsp;${rev.toLocaleString()}</div>
        </div>`).join('')
    : `<div class="empty" style="padding:18px 0"><p style="font-size:13px">No patient data for this period</p></div>`;
}
