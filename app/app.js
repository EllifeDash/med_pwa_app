 // ════════════════════════════════════════
 // IMPORT MODULES
 // ════════════════════════════════════════
import "./utils.js";
import "./db.js";
import "./settings.js";
import "./init.js";

// start app
initApp();

import { initApp } from "./init.js";
import "./settings.js";

initApp();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}

// ════════════════════════════════════════
// WELCOME
// ════════════════════════════════════════
function getInits(name){if(!name)return'MA';return name.trim().split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)}
function updateWelcomeInitials(){
  const n = document.getElementById('iName').value;
  const el = document.getElementById('wInitials');
  if(el && el.tagName!=='IMG') el.textContent = getInits(n);
}
function setWelcomePhoto(b64){
  const wrap = document.getElementById('wSubjectWrap');
  if(wrap) wrap.innerHTML = `<img src="${b64}" class="wsubject-img"/>`;
}
function handleWelcomePhoto(input){
  const file = input.files[0]; if(!file) return;
  const r = new FileReader();
  r.onload = async e=>{
    const b64 = e.target.result;
    setWelcomePhoto(b64);
    const s=await gSet(); s.photo=b64; await DB.set('ma_settings',s);
  };
  r.readAsDataURL(file);
}
async function saveProfile(){
  const s=await gSet();
  s.name=document.getElementById('iName').value.trim()||s.name;
  s.rank=document.getElementById('iRank').value.trim()||s.rank;
  await DB.set('ma_settings',s); toast('Profile saved!');
}
async function enterApp(){
  await saveProfile();
  document.getElementById('ws').style.display='none';
  document.getElementById('app').classList.add('active');
  go('dashboard',null);
}
function logout(){
  document.getElementById('app').classList.remove('active');
  document.getElementById('ws').style.display=''; document.getElementById('ws').classList.add('active');
}
 
// ════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════
const pages = ['dashboard','patients','addVisit','history','settings'];
function go(pg, btn){
  pages.forEach(p=>{
    const el=document.getElementById('pg-'+p);
    if(el) el.style.display = p===pg?'':'none';
  });
  document.querySelectorAll('.nbtn[data-pg],.bb[data-pg]').forEach(b=>b.classList.toggle('on', b.dataset.pg===pg));
  if(pg==='dashboard') renderDash();
  if(pg==='patients') renderPatients();
  if(pg==='addVisit') renderSvcTags();
  if(pg==='settings') renderSettings();
}
 
// ════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════
let dashRange = 'today';

function setDashRange(r, btn) {
  dashRange = r;
  document.querySelectorAll('.dpill').forEach(b => b.classList.remove('on'));
  if(btn) btn.classList.add('on');
  else document.querySelector(`.dpill[data-range="${r}"]`)?.classList.add('on');
  renderDash();
}

function dashDateRange(range) {
  const now = new Date();
  const tod = now.toISOString().slice(0,10);
  if(range === 'today') return { start: tod, end: tod };
  if(range === 'week') {
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return { start: mon.toISOString().slice(0,10), end: tod };
  }
  if(range === 'month') {
    const y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,'0');
    return { start: `${y}-${m}-01`, end: tod };
  }
  if(range === 'year') {
    return { start: `${now.getFullYear()}-01-01`, end: tod };
  }
  return { start: null, end: null };
}

function filterVisRange(vis, range) {
  const { start, end } = dashDateRange(range);
  if(!start) return vis;
  return vis.filter(v => v.date >= start && v.date <= end);
}

function buildChartData(vis, range) {
  const now = new Date();
  if(range === 'today') {
    const buckets = Array.from({length:24}, (_,i) => ({ l: i%6===0 ? i+'h' : '', v: 0 }));
    vis.forEach(v => { const h = parseInt((v.time||'00:00').split(':')[0]); if(buckets[h]) buckets[h].v += (v.net||0); });
    return buckets;
  }
  if(range === 'week') {
    const labels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const buckets = labels.map(l => ({ l, v: 0 }));
    const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay()+6)%7)); mon.setHours(0,0,0,0);
    vis.forEach(v => {
      const d = new Date(v.date+'T00:00:00');
      const idx = Math.floor((d - mon) / 86400000);
      if(idx >= 0 && idx < 7) buckets[idx].v += (v.net||0);
    });
    return buckets;
  }
  if(range === 'month') {
    const dim = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const buckets = Array.from({length:dim}, (_,i) => ({ l: (i+1)%5===1||i===dim-1 ? String(i+1) : '', v: 0 }));
    vis.forEach(v => { const d = parseInt(v.date.split('-')[2])-1; if(buckets[d]) buckets[d].v += (v.net||0); });
    return buckets;
  }
  if(range === 'year') {
    const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const buckets = mo.map(l => ({ l, v: 0 }));
    vis.forEach(v => { const m = parseInt(v.date.split('-')[1])-1; if(buckets[m]) buckets[m].v += (v.net||0); });
    return buckets;
  }
  // All time — group by year-month
  if(!vis.length) return [];
  const map = {};
  vis.forEach(v => { const k = v.date.slice(0,7); map[k] = (map[k]||0) + (v.net||0); });
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return Object.keys(map).sort().map(k => {
    const [y, m] = k.split('-');
    return { l: mo[+m-1]+" '"+y.slice(2), v: map[k] };
  });
}

function buildSvgBarChart(data) {
  const noData = !data.length || data.every(d => d.v === 0);
  if(noData) return `<div class="empty" style="padding:24px 0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:38px;height:38px;opacity:.2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><p style="font-size:13px;margin-top:6px">No revenue data for this period</p></div>`;
  const W=480, H=155, pL=50, pB=28, pT=10, pR=8;
  const cW=W-pL-pR, cH=H-pB-pT;
  const max = Math.max(...data.map(d=>d.v), 1);
  const n = data.length;
  const slot = cW / n;
  const bw = Math.max(5, Math.min(34, slot * 0.62));

  const ySteps = [0.25, 0.5, 0.75, 1];
  const grid = ySteps.map(f => {
    const y = pT + cH - Math.round(f * cH);
    const lbl = max*f >= 1000 ? ((max*f)/1000).toFixed(1)+'k' : Math.round(max*f);
    return `<line x1="${pL}" y1="${y}" x2="${W-pR}" y2="${y}" stroke="var(--bd)" stroke-width="1"/>
<text x="${pL-5}" y="${y+4}" text-anchor="end" font-size="10" fill="var(--tx3)">${lbl}</text>`;
  }).join('');

  const step = Math.ceil(n / 10);
  const bars = data.map((d, i) => {
    const bh = Math.max(d.v > 0 ? 2 : 0, Math.round((d.v/max)*cH));
    const x = pL + i*slot + (slot-bw)/2;
    const y = pT + cH - bh;
    const alpha = d.v > 0 ? 1 : 0;
    const lbl = (d.l && (i%step===0 || i===n-1))
      ? `<text x="${x+bw/2}" y="${H-7}" text-anchor="middle" font-size="9" fill="var(--tx3)">${d.l}</text>` : '';
    return `<rect x="${x.toFixed(1)}" y="${y}" width="${bw.toFixed(1)}" height="${bh}" rx="3" fill="var(--p)" opacity="${alpha}"/>${lbl}`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;overflow:visible">${grid}${bars}</svg>`;
}

async function renderDash() {
  const pts = await gPts(), allVis = await gVis(), s = await gSet();
  const now = new Date(), h = now.getHours();

  document.getElementById('dashGreet').textContent = `Good ${h<12?'Morning':h<17?'Afternoon':'Evening'}, ${(s.name||'Doctor').split(' ')[0]}!`;
  document.getElementById('dashDate').textContent = now.toLocaleDateString('en-PK', {weekday:'long',year:'numeric',month:'long',day:'numeric'});

  const vis = filterVisRange(allVis, dashRange);
  const { start, end } = dashDateRange(dashRange);

  // ── KPI calculations ──────────────────
  const revenue   = vis.reduce((a,v) => a+(v.net||0), 0);
  const discount  = vis.reduce((a,v) => a+(v.discount||0), 0);
  const avgRev    = vis.length ? Math.round(revenue / vis.length) : 0;
  const newPts    = start
    ? pts.filter(p => {
        const first = allVis.filter(v=>v.patientId===p.id).sort((a,b)=>a.date.localeCompare(b.date))[0];
        return first && first.date >= start && first.date <= end;
      }).length
    : pts.length;

  const kpiIcon = (path) => `<svg class="kpi-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${path}</svg>`;
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

  // ── Revenue chart ─────────────────────
  const chartTitles = { today:'Hourly Revenue — Today', week:'Daily Revenue — This Week', month:'Daily Revenue — This Month', year:'Monthly Revenue — This Year', all:'All-Time Revenue' };
  document.getElementById('dashChartTitle').textContent = chartTitles[dashRange] || 'Revenue Trend';
  document.getElementById('dashChartBadge').textContent = `Rs. ${revenue.toLocaleString()}`;
  document.getElementById('dashChart').innerHTML = buildSvgBarChart(buildChartData(vis, dashRange));

  // ── Top services ──────────────────────
  const svcMap = {};
  vis.forEach(v => (v.services||[]).forEach(sv => { svcMap[sv.name] = (svcMap[sv.name]||0)+1; }));
  const topSvcs = Object.entries(svcMap).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const maxSvc = topSvcs[0]?.[1] || 1;
  document.getElementById('dashTopSvcs').innerHTML = topSvcs.length
    ? topSvcs.map(([name,cnt]) => `
      <div class="sbar-row">
        <div class="sbar-top">
          <span class="sbar-name">${name}</span>
          <span class="sbar-cnt">${cnt}×</span>
        </div>
        <div class="sbar-track"><div class="sbar-fill" style="width:${Math.round((cnt/maxSvc)*100)}%"></div></div>
      </div>`).join('')
    : `<div class="empty" style="padding:18px 0"><p style="font-size:13px">No services for this period</p></div>`;

  // ── Recent visits ─────────────────────
  const rec = [...vis].sort((a,b) => (b.date+b.time).localeCompare(a.date+a.time)).slice(0,6);
  document.getElementById('recentVisits').innerHTML = rec.length
    ? rec.map(v=>`
      <div class="hi" style="cursor:pointer;margin-bottom:8px" onclick="openHistory('${v.patientId}')">
        <div class="hd">${fmtDate(v.date)} ${v.time||''}</div>
        <div class="hs">${v.patientName}</div>
        <div class="hn">${(v.services||[]).map(sv=>sv.name).join(', ')}</div>
        <div class="ha">Rs. ${(v.net||0).toLocaleString()}</div>
      </div>`).join('')
    : `<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg><p>No visits this period</p><span>Switch range or add a new visit</span></div>`;

  // ── Top patients ──────────────────────
  const ptRev = {}, ptCnt = {}, ptName = {};
  vis.forEach(v => {
    ptRev[v.patientId]  = (ptRev[v.patientId]||0) + (v.net||0);
    ptCnt[v.patientId]  = (ptCnt[v.patientId]||0) + 1;
    ptName[v.patientId] = v.patientName;
  });
  const topPts = Object.entries(ptRev).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const rankCls = ['gold','silver','bronze','',''];
  document.getElementById('dashTopPts').innerHTML = topPts.length
    ? topPts.map(([pid,rev],i) => `
      <div class="pt-row">
        <div class="pt-rank ${rankCls[i]}">${i+1}</div>
        <div style="flex:1;min-width:0">
          <div class="pt-name">${ptName[pid]||'Unknown'}</div>
          <div class="pt-meta">${ptCnt[pid]} visit${ptCnt[pid]!==1?'s':''}</div>
        </div>
        <div class="pt-rev">Rs.&nbsp;${rev.toLocaleString()}</div>
      </div>`).join('')
    : `<div class="empty" style="padding:18px 0"><p style="font-size:13px">No patient data for this period</p></div>`;
}
 
// ════════════════════════════════════════
// PATIENTS
// ════════════════════════════════════════
async function renderPatients(){
  const q=(document.getElementById('pSearch')?.value||'').toLowerCase();
  let pts=await gPts(); if(q) pts=pts.filter(p=>p.name.toLowerCase().includes(q)||(p.phone||'').includes(q)||(p.address||'').toLowerCase().includes(q));
  const vis=await gVis(); const el=document.getElementById('patientsList');
  if(!pts.length){el.innerHTML=`<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><p>${q?'No patients found':'No patients yet'}</p><span>${q?'Try a different search':'Add a new visit to create a patient record'}</span></div>`;return;}
  el.innerHTML=pts.map(p=>{
    const pvs=vis.filter(v=>v.patientId===p.id);
    const last=pvs.sort((a,b)=>b.date.localeCompare(a.date))[0];
    const av = p.photo ? `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>` : getInits(p.name);
    return `<div class="pc" onclick="openHistory('${p.id}')">
      <div class="av ${p.gender==='Female'?'f':p.age<18?'c':''}">${av}</div>
      <div class="pi">
        <div class="pn">${p.name}</div>
        <div class="pm">${p.age?p.age+' yrs':''} ${p.age&&p.gender?'·':''} ${p.gender||''} ${p.phone?'· '+p.phone:''}</div>
        ${last?`<div class="txs ts mt4">Last visit: ${fmtDate(last.date)}</div>`:''}
      </div>
      <div class="pst" style="display:flex;align-items:center;gap:10px">
        <div><div class="vc">${pvs.length}</div><div class="vl">visit${pvs.length!==1?'s':''}</div></div>
        <button class="trash-btn" title="Delete Patient" onclick="event.stopPropagation();deletePatient('${p.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}
 
// ════════════════════════════════════════
// HISTORY PAGE
// ════════════════════════════════════════
async function openHistory(pid){
  historyPatientId = pid;
  const p=(await gPts()).find(x=>x.id===pid); if(!p) return;
  const vis=(await gVis()).filter(v=>v.patientId===pid).sort((a,b)=>b.date.localeCompare(a.date));
  const total=vis.reduce((s,v)=>s+(v.net||0),0);
 
  document.getElementById('hpName').textContent = p.name;
  document.getElementById('hpMeta').textContent = [p.age?p.age+' yrs':'', p.gender, p.phone, p.address].filter(Boolean).join(' · ');
  document.getElementById('hpFullName').textContent = p.name;
  document.getElementById('hpDetails').textContent = [p.age?p.age+' years old':'', p.gender, p.phone].filter(Boolean).join(' · ');
  if(p.address) document.getElementById('hpDetails').textContent += ' · ' + p.address;
 
  // Avatar
  const hpAv = document.getElementById('hpAv');
  if(p.photo){
    hpAv.innerHTML = `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`;
  } else {
    hpAv.innerHTML = `<span style="font-size:22px;font-weight:700;color:var(--p)">${getInits(p.name)}</span><div class="wpa-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s;border-radius:50%"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div>`;
    hpAv.onmouseenter = ()=>hpAv.querySelector('.wpa-overlay').style.opacity=1;
    hpAv.onmouseleave = ()=>hpAv.querySelector('.wpa-overlay').style.opacity=0;
  }
 
  document.getElementById('hpStats').innerHTML = `
    <div class="scard"><div class="sv" style="font-size:20px">${vis.length}</div><div class="sl">Visits</div></div>
    <div class="scard"><div class="sv" style="font-size:16px;color:var(--ok)">Rs.${total.toLocaleString()}</div><div class="sl">Total Billed</div></div>
    <div class="scard"><div class="sv" style="font-size:14px">${vis[0]?fmtDate(vis[0].date):'—'}</div><div class="sl">Last Visit</div></div>`;
 
  renderHistNotes();
  renderDocs();
  renderPatientVisits(vis);
  updateStorageBar(pid);
 
  // Action button for new visit
// Remove existing button if already present
let btn = document.getElementById('newVisitBtn');
 
if (!btn) {
  btn = document.createElement('button');
  btn.id = "newVisitBtn";
  btn.className = "btn bp bsm mt12";
  document.getElementById('hpStats').after(btn);
}
 
btn.textContent = "+ New Visit for this Patient";
btn.onclick = () => prefillPt(pid);
 
  go('history', null);
}
 
async function renderHistNotes(){
  const notes = (await gHistNotes(historyPatientId)).sort((a,b)=>b.date.localeCompare(a.date));
  const el = document.getElementById('histNotes');
  if(!notes.length){ el.innerHTML=`<div class="empty" style="padding:16px 0"><p style="font-size:14px">No history notes yet</p><span>Add diagnoses, allergies, conditions…</span></div>`; return; }
  const catColors = {'Diagnosis':'b-red','Allergy':'b-amber','Chronic Condition':'b-red','Medication':'b-blue','Lab Result':'b-green','General Note':'b-gray','Other':'b-gray'};
  el.innerHTML = notes.map(n=>`
    <div class="hi" style="position:relative">
      <div class="flex ic jb mb4">
        <span class="bdg ${catColors[n.category]||'b-gray'}">${n.category}</span>
        <div class="flex ic g8">
          <span class="txs ts">${fmtDate(n.date)}</span>
          <button onclick="editHistNote('${n.id}')" class="btn bg bsm" style="padding:3px 8px;font-size:12px">Edit</button>
          <button onclick="delHistNote('${n.id}')" class="sdel">✕</button>
        </div>
      </div>
      <div class="hs">${n.title}</div>
      ${n.details?`<div class="hn">${n.details}</div>`:''}
    </div>`).join('');
}
 
function showAddHistNote(){
  editingHistNoteId = null;
  document.getElementById('histModalTitle').textContent = 'Add Medical History Note';
  document.getElementById('hnDate').value = new Date().toISOString().slice(0,10);
  document.getElementById('hnCat').value = 'General Note';
  document.getElementById('hnTitle').value = '';
  document.getElementById('hnDetails').value = '';
  openMo('histModal');
}
async function editHistNote(id){
  const notes = await gHistNotes(historyPatientId);
  const n = notes.find(x=>x.id===id); if(!n) return;
  editingHistNoteId = id;
  document.getElementById('histModalTitle').textContent = 'Edit History Note';
  document.getElementById('hnDate').value = n.date;
  document.getElementById('hnCat').value = n.category;
  document.getElementById('hnTitle').value = n.title;
  document.getElementById('hnDetails').value = n.details||'';
  openMo('histModal');
}
async function saveHistNote(){
  const title = document.getElementById('hnTitle').value.trim();
  if(!title){ toast('Enter a title','danger'); return; }
  const notes = await gHistNotes(historyPatientId);
  const note = {
    id: editingHistNoteId || 'hn_'+Date.now(),
    date: document.getElementById('hnDate').value,
    category: document.getElementById('hnCat').value,
    title, details: document.getElementById('hnDetails').value.trim()
  };
  if(editingHistNoteId){ const i=notes.findIndex(x=>x.id===editingHistNoteId); if(i>-1) notes[i]=note; }
  else notes.push(note);
  await DB.set('ma_hist_'+historyPatientId, notes);
  closeMo('histModal'); renderHistNotes(); toast('Note saved!');
}
async function delHistNote(id){
  if(!confirm('Delete this note?')) return;
  const notes = (await gHistNotes(historyPatientId)).filter(n=>n.id!==id);
  await DB.set('ma_hist_'+historyPatientId, notes); renderHistNotes(); toast('Note deleted');
}
 
// DOCUMENTS
async function handleDocUpload(input){
  const files = Array.from(input.files); if(!files.length) return;
  let done = 0;
  for(const file of files){
    if(file.size > 10*1024*1024){ toast('File too large (max 10MB): '+file.name,'danger'); done++; continue; }
    await new Promise(resolve=>{
      const r = new FileReader();
      r.onload = async e=>{
        const currentDocs = await gDocs(historyPatientId);
        await DB.set('ma_docs_'+historyPatientId, [...currentDocs, {
          id:'doc_'+Date.now()+'_'+Math.random().toString(36).slice(2),
          name: file.name, type: file.type, size: file.size,
          data: e.target.result, uploadedAt: new Date().toISOString()
        }]);
        done++;
        resolve();
      };
      r.onerror = ()=>{ done++; toast('Failed to read '+file.name,'danger'); resolve(); };
      r.readAsDataURL(file);
    });
  }
  renderDocs(); updateStorageBar(historyPatientId); input.value='';
  toast(done > 1 ? done+' documents uploaded!' : 'Document uploaded!');
}
async function renderDocs(){
  const docs = await gDocs(historyPatientId);
  const el = document.getElementById('docsList');
  if(!docs.length){ el.innerHTML=`<div class="empty" style="padding:12px 0"><p style="font-size:14px">No documents yet</p><span>Upload medical reports, images, prescriptions…</span></div>`; return; }
  el.innerHTML = docs.map(d=>{
    const isImg = d.type.startsWith('image/');
    const icon = isImg
      ? `<img src="${d.data}" class="doc-thumb" alt="${d.name}"/>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0369a1" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
    return `<div class="doc-card mb8">
      <div class="doc-icon">${icon}</div>
      <div class="doc-info">
        <div class="doc-name">${d.name}</div>
        <div class="doc-meta">${fmtFileSize(d.size)} · ${fmtDate(d.uploadedAt?.slice(0,10)||'')}</div>
      </div>
      <button class="btn bg bsm" style="flex-shrink:0;padding:5px 10px;font-size:12px" onclick="previewDoc('${d.id}')">View</button>
      <button class="doc-del" onclick="delDoc('${d.id}')">✕</button>
    </div>`;
  }).join('');
}
async function delDoc(id){
  if(!confirm('Delete this document?')) return;
  const docs = (await gDocs(historyPatientId)).filter(d=>d.id!==id);
  await DB.set('ma_docs_'+historyPatientId, docs); renderDocs(); updateStorageBar(historyPatientId); toast('Deleted');
}
async function previewDoc(id){
  const d = (await gDocs(historyPatientId)).find(x=>x.id===id); if(!d) return;
  document.getElementById('docModalName').textContent = d.name;
  const isImg = d.type.startsWith('image/');
  if(isImg){
    document.getElementById('docModalContent').innerHTML = `<img src="${d.data}" style="max-width:100%;border-radius:var(--rs)"/>`;
  } else {
    document.getElementById('docModalContent').innerHTML = `<p class="ts tsm mb12">PDF preview not available inline.</p><a href="${d.data}" download="${d.name}" class="btn bp">Download PDF</a>`;
  }
  openMo('docModal');
}
function fmtFileSize(b){if(b<1024)return b+'B';if(b<1024*1024)return(b/1024).toFixed(1)+'KB';return(b/1024/1024).toFixed(1)+'MB';}
 
async function updateStorageBar(pid){
  const el = document.getElementById('storageBar');
  el.style.display = 'block';
  // Use StorageManager API if available for accurate IDB usage
  if (navigator.storage && navigator.storage.estimate) {
    const {usage, quota} = await navigator.storage.estimate();
    const pct = Math.min(100, Math.round((usage||0)/(quota||1)*100));
    const usedMB = ((usage||0)/1024/1024).toFixed(1);
    const quotaMB = Math.round((quota||0)/1024/1024);
    document.getElementById('storPct').textContent = usedMB+'MB of ~'+quotaMB+'MB used ('+pct+'%)';
    const fill = document.getElementById('storFill');
    fill.style.width = pct+'%';
    fill.className = 'stor-fill'+(pct>85?' danger':pct>65?' warn':'');
  } else {
    document.getElementById('storPct').textContent = 'Storage: IndexedDB (large capacity)';
    document.getElementById('storFill').style.width = '2%';
    document.getElementById('storFill').className = 'stor-fill';
  }
}
 
function renderPatientVisits(vis){
  const el = document.getElementById('hpVisits');
  if(!vis.length){ el.innerHTML=`<div class="empty" style="padding:16px 0"><p style="font-size:14px">No visits yet</p></div>`; return; }
  el.innerHTML = vis.map(v=>`
    <div class="hi">
      <div class="flex ic jb">
        <div class="hd">${fmtDate(v.date)} ${v.time||''}</div>
        <div class="flex ic g8">
          <button class="btn bg bsm" style="padding:4px 10px;font-size:12px" onclick="previewReceipt('${v.id}')">Receipt</button>
          <button class="trash-btn" title="Delete Visit" onclick="deleteVisit('${v.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
      <div class="hs">${v.services.map(s=>s.name).join(', ')}</div>
      ${v.notes?`<div class="hn">${v.notes}</div>`:''}
      <div class="ha">Rs. ${(v.net||0).toLocaleString()}</div>
    </div>`).join('');
}
 
// DELETE PATIENT
async function deletePatient(id){
  if(!confirm('Delete this patient and ALL their visits, history notes, and documents? This cannot be undone.')) return;
  const pts = (await gPts()).filter(p=>p.id!==id);
  await DB.set('ma_patients', pts);
  // Remove all visits for this patient
  const vis = (await gVis()).filter(v=>v.patientId!==id);
  await DB.set('ma_visits', vis);
  // Remove history notes and docs keys
  await DB.set('ma_hist_'+id, []);
  await DB.set('ma_docs_'+id, []);
  toast('Patient deleted');
  renderPatients();
}

// DELETE VISIT
async function deleteVisit(id){
  if(!confirm('Delete this visit record?')) return;
  const vis = (await gVis()).filter(v=>v.id!==id);
  await DB.set('ma_visits', vis);
  // Re-render visits for current patient
  const updatedVis = vis.filter(v=>v.patientId===historyPatientId).sort((a,b)=>b.date.localeCompare(a.date));
  renderPatientVisits(updatedVis);
  // Refresh stats
  const total = updatedVis.reduce((s,v)=>s+(v.net||0),0);
  document.getElementById('hpStats').innerHTML = `
    <div class="scard"><div class="sv" style="font-size:20px">${updatedVis.length}</div><div class="sl">Visits</div></div>
    <div class="scard"><div class="sv" style="font-size:16px;color:var(--ok)">Rs.${total.toLocaleString()}</div><div class="sl">Total Billed</div></div>
    <div class="scard"><div class="sv" style="font-size:14px">${updatedVis[0]?fmtDate(updatedVis[0].date):'—'}</div><div class="sl">Last Visit</div></div>`;
  toast('Visit deleted');
}

// PATIENT PHOTO in history page
function handlePatientPhoto(input){
  const file=input.files[0]; if(!file) return;
  const r=new FileReader();
  r.onload=async e=>{
    const pts=await gPts(), p=pts.find(x=>x.id===historyPatientId);
    if(!p) return;
    p.photo=e.target.result;
    await DB.set('ma_patients',pts);
    // Re-read to confirm persistence, then update avatar
    const confirmedPts=await gPts(), confirmedP=confirmedPts.find(x=>x.id===historyPatientId);
    const hpAv=document.getElementById('hpAv');
    if(confirmedP && confirmedP.photo){
      hpAv.innerHTML=`<img src="${confirmedP.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`;
    }
    input.value='';
    toast('Photo updated!');
  };
  r.readAsDataURL(file);
}
 
// ════════════════════════════════════════
// ADD VISIT
// ════════════════════════════════════════
async function renderSvcTags(){
  const svcs=await gSvc();
  document.getElementById('svcTags').innerHTML=svcs.map(s=>`
    <div class="stag ${selSvcs[s.id]!==undefined?'sel':''}" onclick="togSvc(${s.id})" id="st-${s.id}">${s.name} <span style="opacity:.7">Rs.${s.price}</span></div>`).join('');
  renderSvcTable();
}
async function togSvc(id){
  const svcs=await gSvc(); const s=svcs.find(x=>x.id===id); if(!s) return;
  if(selSvcs[id]!==undefined) delete selSvcs[id]; else selSvcs[id]=s.price;
  document.getElementById('st-'+id)?.classList.toggle('sel', selSvcs[id]!==undefined);
  renderSvcTable(); calcTotal();
}
async function renderSvcTable(){
  const keys=Object.keys(selSvcs); const el=document.getElementById('svcTable');
  if(!keys.length){el.innerHTML='';return;}
  const svcs=await gSvc();
  el.innerHTML=`<table class="tbl"><thead><tr><th>Service</th><th>Price (Rs.)</th></tr></thead><tbody>
    ${keys.map(id=>{const s=svcs.find(x=>x.id==id);return`<tr><td>${s?s.name:'Service'}</td><td><input type="number" value="${selSvcs[id]}" style="width:100px" oninput="selSvcs[${id}]=+this.value;calcTotal()"/></td></tr>`;}).join('')}
  </tbody></table>`;
}
function calcTotal(){
  const sub=Object.values(selSvcs).reduce((a,b)=>a+(+b||0),0);
  const disc=+(document.getElementById('fDisc')?.value||0);
  document.getElementById('vTotal').textContent='Rs. '+sub.toLocaleString();
  document.getElementById('vNet').textContent='Rs. '+Math.max(0,sub-disc).toLocaleString();
}
async function suggestPt(){
  const q=document.getElementById('fName').value.toLowerCase().trim(); const el=document.getElementById('ptSugg');
  if(q.length<2){el.style.display='none';return;}
  const m=(await gPts()).filter(p=>p.name.toLowerCase().includes(q)).slice(0,5);
  if(!m.length){el.style.display='none';return;}
  el.style.display='block';
  el.innerHTML=m.map(p=>`<div onclick="prefillPt('${p.id}')" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--bd);font-size:14px"><strong>${p.name}</strong> <span class="ts">${p.age?p.age+' yrs':''} ${p.phone?'· '+p.phone:''}</span></div>`).join('');
}
document.addEventListener('click',e=>{if(!e.target.closest('#ptSugg')&&e.target.id!=='fName') document.getElementById('ptSugg').style.display='none';});
 
async function prefillPt(id){
  //closeMo('patientModal');
  activePtId=id;
  const p=(await gPts()).find(x=>x.id===id); if(!p) return;
  go('addVisit',null);
  setTimeout(()=>{
    document.getElementById('fName').value=p.name;
    document.getElementById('fAge').value=p.age||'';
    document.getElementById('fGender').value=p.gender||'';
    document.getElementById('fPhone').value=p.phone||'';
    document.getElementById('fAddr').value=p.address||'';
    const b=document.getElementById('existingBanner');
    b.style.display='block';
    b.innerHTML=`<strong>${p.name}</strong> — existing patient selected. Details pre-filled.`;
  },60);
}
function resetForm(){
  ['fName','fAge','fPhone','fAddr','fNotes','fDisc'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('fGender').value='';
  const now=new Date(); document.getElementById('fDate').valueAsDate=now;
  document.getElementById('fTime').value=now.toTimeString().slice(0,5);
  selSvcs={}; activePtId=null;
  document.getElementById('existingBanner').style.display='none';
  renderSvcTags(); calcTotal();
}
async function saveVisit(){
  const name=document.getElementById('fName').value.trim();
  if(!name){toast('Patient name is required','danger');return;}
  if(!Object.keys(selSvcs).length){toast('Select at least one service','danger');return;}
  const pts=await gPts(), vis=await gVis(), svcs=await gSvc();
  let pt;
  if(activePtId) pt=pts.find(p=>p.id===activePtId);
  if(!pt) pt=pts.find(p=>p.name.toLowerCase()===name.toLowerCase());
  if(!pt){
    pt={id:'p_'+Date.now(),name,age:+document.getElementById('fAge').value||null,gender:document.getElementById('fGender').value,phone:document.getElementById('fPhone').value.trim(),address:document.getElementById('fAddr').value.trim(),createdAt:new Date().toISOString()};
    pts.push(pt);
  } else {
    pt.age=+document.getElementById('fAge').value||pt.age;
    pt.gender=document.getElementById('fGender').value||pt.gender;
    pt.phone=document.getElementById('fPhone').value.trim()||pt.phone;
    pt.address=document.getElementById('fAddr').value.trim()||pt.address;
  }
  await DB.set('ma_patients',pts);
  const sub=Object.values(selSvcs).reduce((a,b)=>a+(+b||0),0);
  const disc=+(document.getElementById('fDisc').value||0);
  const v={id:'v_'+Date.now(),patientId:pt.id,patientName:pt.name,
    date:document.getElementById('fDate').value,time:document.getElementById('fTime').value,
    notes:document.getElementById('fNotes').value.trim(),
    services:Object.keys(selSvcs).map(id=>{const s=svcs.find(x=>x.id==id);return{id:+id,name:s?s.name:'Service',price:+selSvcs[id]};}),
    subtotal:sub,discount:disc,net:Math.max(0,sub-disc),createdAt:new Date().toISOString()};
  vis.push(v); await DB.set('ma_visits',vis);
  toast('Visit saved!'); previewReceipt(v.id); resetForm();
}
 
// ════════════════════════════════════════
// RECEIPT
// ════════════════════════════════════════
async function buildReceipt(vid){
  const v=(await gVis()).find(x=>x.id===vid); if(!v) return '<p>Not found</p>';
  const p=(await gPts()).find(x=>x.id===v.patientId)||{}, s=await gSet();
  const rno=vid.replace('v_','').slice(-6);
  return `<div class="rw" id="r-${vid}">
    <div class="rh">
      <div style="display:flex;align-items:flex-start;gap:10px">
        ${s.logo?`<img src="${s.logo}" style="width:48px;height:48px;object-fit:contain;border-radius:8px;flex-shrink:0;border:1px solid var(--bd);padding:2px"/>`:''}
        <div>
          <div class="rb">${s.businessName||'MediAssist Pro'}<span>${s.tagline||'Home Medical Care'}</span></div>
          <div style="font-size:13px;color:var(--tx2);margin-top:5px">${s.name} · ${s.rank}</div>
          ${s.phone?`<div style="font-size:12px;color:var(--tx3)">${s.phone}</div>`:''}
          ${s.address?`<div style="font-size:12px;color:var(--tx3)">${s.address}</div>`:''}
        </div>
      </div>
      <div class="rm"><div style="font-weight:700;font-size:14px">RECEIPT</div><div>#${rno}</div><div>${fmtDate(v.date)}</div><div>${v.time||''}</div></div>
    </div>
    <div class="rp"><strong>${p.name||v.patientName}</strong>
      ${[p.age?p.age+' yrs':'',p.gender,p.phone].filter(Boolean).join(' · ')}
      ${p.address?`<div style="font-size:12px;color:var(--tx2)">${p.address}</div>`:''}
    </div>
    ${v.notes?`<div style="font-size:13px;color:var(--tx2);margin-bottom:10px"><strong>Notes:</strong> ${v.notes}</div>`:''}
    <table class="rtbl"><thead><tr><th>#</th><th>Service</th><th style="text-align:right">Rs.</th></tr></thead>
      <tbody>${v.services.map((s,i)=>`<tr><td>${i+1}</td><td>${s.name}</td><td style="text-align:right">${(s.price||0).toLocaleString()}</td></tr>`).join('')}</tbody>
    </table>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;margin-bottom:9px;font-size:14px">
      <div>Subtotal: <strong>Rs. ${(v.subtotal||0).toLocaleString()}</strong></div>
      ${v.discount?`<div style="color:var(--err)">Discount: - Rs. ${v.discount.toLocaleString()}</div>`:''}
    </div>
    <div class="rtot"><span>Total Payable</span><span style="color:var(--ok)">Rs. ${(v.net||0).toLocaleString()}</span></div>
    <div class="rfoot">Thank you for trusting us with your care. Get well soon!<br>Generated by MediAssist Pro</div>
  </div>`;
}
async function previewReceipt(vid){
  document.getElementById('rcptContent').innerHTML = await buildReceipt(vid);
  document.getElementById('rcptContent').dataset.vid=vid;
  openMo('rcptModal');
}
/* Removed pdf function completely and going to use simple image export via html2canvas for now.
  async function dlPDF(){
  const vid=document.getElementById('rcptContent').dataset.vid;
  const v=(await gVis()).find(x=>x.id===vid);
  if(!v){ toast('Visit not found','danger'); return; }
  const p=(await gPts()).find(x=>x.id===v.patientId)||{};
  const s=await gSet();
 
  // ── Page setup: A5 portrait (420 × 595 pt) ──
  const W=420, H=595, ml=30, mr=W-30, cw=W-60;
 
  // PDF stream helpers
  // Use Tm (text matrix) for absolute positioning — avoids the Td accumulation bug
  const st=[];
  function esc(t){ return String(t==null?'':t).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)'); }
  function txt(t, x, y, sz, bold=false){
    // PDF y-axis is bottom-up; we pass top-down y so convert: pdfY = H - y
    st.push(`BT /${bold?'Fb':'F'} ${sz} Tf ${x} ${(H-y).toFixed(2)} Tm (${esc(t)}) Tj ET`);
  }
  function fillRect(x,y,w,h, r,g,b){
    // y is top-down top of rect; PDF rect uses bottom-left corner
    st.push(`${(r/255).toFixed(3)} ${(g/255).toFixed(3)} ${(b/255).toFixed(3)} rg`);
    st.push(`${x} ${(H-y-h).toFixed(2)} ${w} ${h} re f`);
    st.push(`0 0 0 rg`); // reset to black
  }
  function hline(x1,y,x2){
    st.push(`0.5 w 0.78 0.82 0.88 RG ${x1} ${(H-y).toFixed(2)} m ${x2} ${(H-y).toFixed(2)} l S 0 0 0 RG`);
  }
  function col(r,g,b){ st.push(`${(r/255).toFixed(3)} ${(g/255).toFixed(3)} ${(b/255).toFixed(3)} rg`); }
  function resetCol(){ st.push(`0 0 0 rg`); } */
 
// SAVE RECIPT TO DEVICE AS IMAGE 
async function saveImage(){
  const el = document.getElementById('rcptContent');
 
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff"
  });
 
  canvas.toBlob(function(blob){
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "Receipt_" + Date.now() + ".jpg";
    a.click();
    URL.revokeObjectURL(url);
    toast('Receipt saved to device!');
  }, "image/jpeg", 0.95);
}
// ════════════════════════════════════════
// MODALS
// ════════════════════════════════════════
function openMo(id){document.getElementById(id).classList.add('open');document.body.style.overflow='hidden';}
function closeMo(id){document.getElementById(id).classList.remove('open');document.body.style.overflow='';}
document.querySelectorAll('.mo').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeMo(m.id);}));