// ════════════════════════════════════════
// report.js — Monthly Summary Report Page
// Shows KPIs with month-over-month change,
// daily revenue chart, top services and
// top patients for any selected month.
// ════════════════════════════════════════

/**
 * Called by go('report') — initialises the month picker
 * to the current month then renders.
 */
function initReport() {
  const now  = new Date();
  const val  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const pick = document.getElementById('reportMonthPicker');
  if (pick && !pick.value) pick.value = val;
  renderReport();
}

async function renderReport() {
  const pick = document.getElementById('reportMonthPicker');
  const val  = pick?.value;
  if (!val) return;

  const [y, m]    = val.split('-').map(Number);
  const start     = `${y}-${String(m).padStart(2, '0')}-01`;
  const end       = new Date(y, m, 0).toISOString().slice(0, 10);
  const dim       = new Date(y, m, 0).getDate();

  // Previous month bounds
  const prevDate  = new Date(y, m - 2, 1);
  const prevY     = prevDate.getFullYear();
  const prevM     = prevDate.getMonth() + 1;
  const prevStart = `${prevY}-${String(prevM).padStart(2, '0')}-01`;
  const prevEnd   = new Date(prevY, prevM, 0).toISOString().slice(0, 10);

  const allVis = await gVis();
  const allPts = await gPts();
  const s      = await gSet();

  const vis     = allVis.filter(v => v.date >= start && v.date <= end);
  const prevVis = allVis.filter(v => v.date >= prevStart && v.date <= prevEnd);

  // ── KPIs ──────────────────────────────
  const revenue      = vis.reduce((a, v) => a + (v.net      || 0), 0);
  const prevRevenue  = prevVis.reduce((a, v) => a + (v.net  || 0), 0);
  const discount     = vis.reduce((a, v) => a + (v.discount || 0), 0);
  const prevDiscount = prevVis.reduce((a, v) => a + (v.discount || 0), 0);

  const newPts = allPts.filter(p => {
    const first = allVis.filter(v => v.patientId === p.id)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    return first && first.date >= start && first.date <= end;
  }).length;
  const prevNewPts = allPts.filter(p => {
    const first = allVis.filter(v => v.patientId === p.id)
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    return first && first.date >= prevStart && first.date <= prevEnd;
  }).length;

  // ── Delta helpers ──────────────────────
  function delta(cur, prev) {
    if (!prev) return cur > 0 ? { pct: null, dir: 'new' } : { pct: null, dir: 'flat' };
    const pct = Math.round(((cur - prev) / prev) * 100);
    return { pct: Math.abs(pct), dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
  }
  function deltaHTML(d) {
    if (!d || d.dir === 'flat') return `<span class="rpt-delta flat">— same</span>`;
    if (d.dir === 'new')        return `<span class="rpt-delta up">✦ new</span>`;
    const arrow = d.dir === 'up' ? '▲' : '▼';
    const cls   = d.dir === 'up' ? 'up' : 'down';
    return `<span class="rpt-delta ${cls}">${arrow} ${d.pct}%</span>`;
  }

  const mo = ['January','February','March','April','May','June',
               'July','August','September','October','November','December'];
  const prevMoName = mo[prevM - 1];

  // ── Render header ──────────────────────
  document.getElementById('reportTitle').textContent =
    `${mo[m - 1]} ${y} — Summary`;
  document.getElementById('reportSubtitle').textContent =
    `Compared with ${prevMoName} ${prevY}`;

  // ── KPI cards ─────────────────────────
  const kpiIcon = path =>
    `<svg class="kpi-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${path}</svg>`;

  document.getElementById('reportKPIs').innerHTML = `
    <div class="kpi-card">
      ${kpiIcon('<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/>')}
      <div class="kpi-l">Visits</div>
      <div class="kpi-v">${vis.length}</div>
      <div class="rpt-vs">vs ${prevVis.length} ${prevMoName} ${deltaHTML(delta(vis.length, prevVis.length))}</div>
    </div>
    <div class="kpi-card kpi-green">
      ${kpiIcon('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"/>')}
      <div class="kpi-l">Revenue</div>
      <div class="kpi-v" style="color:var(--ok)">Rs.&nbsp;${revenue.toLocaleString()}</div>
      <div class="rpt-vs">vs Rs.${prevRevenue.toLocaleString()} ${deltaHTML(delta(revenue, prevRevenue))}</div>
    </div>
    <div class="kpi-card">
      ${kpiIcon('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>')}
      <div class="kpi-l">New Patients</div>
      <div class="kpi-v">${newPts}</div>
      <div class="rpt-vs">vs ${prevNewPts} ${prevMoName} ${deltaHTML(delta(newPts, prevNewPts))}</div>
    </div>
    <div class="kpi-card kpi-amber">
      ${kpiIcon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>')}
      <div class="kpi-l">Discount Given</div>
      <div class="kpi-v" style="font-size:20px;color:var(--warn)">Rs.&nbsp;${discount.toLocaleString()}</div>
      <div class="rpt-vs">vs Rs.${prevDiscount.toLocaleString()} ${deltaHTML(delta(discount, prevDiscount))}</div>
    </div>`;

  // ── Daily revenue chart ────────────────
  const buckets = Array.from({length: dim}, (_, i) => ({
    l: (i + 1) % 5 === 1 || i === dim - 1 ? String(i + 1) : '',
    v: 0
  }));
  vis.forEach(v => {
    const d = parseInt(v.date.split('-')[2]) - 1;
    if (buckets[d]) buckets[d].v += (v.net || 0);
  });
  document.getElementById('reportChart').innerHTML =
    buildSvgBarChart(buckets);

  // ── Top services ───────────────────────
  const svcMap = {};
  vis.forEach(v => (v.services || []).forEach(sv => {
    svcMap[sv.name] = (svcMap[sv.name] || 0) + 1;
  }));
  const topSvcs = Object.entries(svcMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxSvc  = topSvcs[0]?.[1] || 1;

  document.getElementById('reportTopSvcs').innerHTML = topSvcs.length
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
    : `<div class="empty" style="padding:12px 0"><p style="font-size:13px">No services this month</p></div>`;

  // ── Top patients ───────────────────────
  const ptRev  = {}, ptCnt = {}, ptName = {};
  vis.forEach(v => {
    ptRev[v.patientId]  = (ptRev[v.patientId]  || 0) + (v.net || 0);
    ptCnt[v.patientId]  = (ptCnt[v.patientId]  || 0) + 1;
    ptName[v.patientId] = v.patientName;
  });
  const topPts  = Object.entries(ptRev).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const rankCls = ['gold', 'silver', 'bronze', '', ''];

  document.getElementById('reportTopPts').innerHTML = topPts.length
    ? topPts.map(([pid, rev], i) => `
        <div class="pt-row">
          <div class="pt-rank ${rankCls[i]}">${i + 1}</div>
          <div style="flex:1;min-width:0">
            <div class="pt-name">${ptName[pid] || 'Unknown'}</div>
            <div class="pt-meta">${ptCnt[pid]} visit${ptCnt[pid] !== 1 ? 's' : ''}</div>
          </div>
          <div class="pt-rev">Rs.&nbsp;${rev.toLocaleString()}</div>
        </div>`).join('')
    : `<div class="empty" style="padding:12px 0"><p style="font-size:13px">No patient data</p></div>`;

  // ── Summary line ───────────────────────
  const avgVisit = vis.length ? Math.round(revenue / vis.length) : 0;
  const busiest  = buckets.reduce((best, b, i) =>
    b.v > (buckets[best]?.v || 0) ? i : best, 0);
  const busiestDay = buckets[busiest]?.v > 0 ? `Day ${busiest + 1}` : 'N/A';

  document.getElementById('reportSummary').innerHTML = `
    <div class="rpt-summary-grid">
      <div class="rpt-sum-item">
        <div class="rpt-sum-val">Rs. ${avgVisit.toLocaleString()}</div>
        <div class="rpt-sum-lbl">Avg per visit</div>
      </div>
      <div class="rpt-sum-item">
        <div class="rpt-sum-val">${busiestDay}</div>
        <div class="rpt-sum-lbl">Busiest day</div>
      </div>
      <div class="rpt-sum-item">
        <div class="rpt-sum-val">${allPts.length}</div>
        <div class="rpt-sum-lbl">Total patients</div>
      </div>
    </div>`;

  // ── Recent visits this month ───────────
  const rec = [...vis].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 6);
  document.getElementById('reportRecentVisits').innerHTML = rec.length
    ? rec.map(v => `
        <div class="hi" style="cursor:pointer;margin-bottom:8px" onclick="openHistory('${v.patientId}')">
          <div class="hd">${fmtDate(v.date)} ${v.time || ''}</div>
          <div class="hs">${v.patientName}</div>
          <div class="hn">${(v.services || []).map(sv => sv.name).join(', ')}</div>
          <div class="ha">Rs. ${(v.net || 0).toLocaleString()}</div>
        </div>`).join('')
    : `<div class="empty" style="padding:12px 0"><p style="font-size:13px">No visits this month</p></div>`;
}

// ── Save report as image ────────────────
async function saveReportImage() {
  const el = document.getElementById('reportContent');
  if (!el) return;
  try {
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#eef2f7' });
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href = url;
      a.download = 'Report_' + Date.now() + '.jpg';
      a.click();
      URL.revokeObjectURL(url);
      toast('Report saved to device!');
    }, 'image/jpeg', 0.95);
  } catch (err) {
    console.error('[report] save error:', err);
    toast('Failed to save report image.', 'danger');
  }
}
