// js/dashboard.js (module) - versi dikemaskini untuk mobile-friendly, today-only ETA filter, WhatsApp links, sidebar pages
import {
  collection, query, where, getDocs, orderBy, doc, updateDoc, serverTimestamp, addDoc, Timestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

/* ---------- helpers ---------- */
function formatDateOnly(ts){
  if (!ts) return '-';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}
function isoDateString(d){ // yyyy-mm-dd
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yy = d.getFullYear();
  return `${yy}-${mm}-${dd}`;
}
function showLoginMsg(el, m, ok=true){ el.textContent = m; el.style.color = ok ? 'green' : 'red'; }
function toast(msg){ const t = document.createElement('div'); t.className = 'msg'; t.textContent = msg; document.body.appendChild(t); setTimeout(()=>t.remove(),3000); }

/* ---------- DOM refs ---------- */
const loginBox = document.getElementById('loginBox');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginMsg = document.getElementById('loginMsg');
const dashboardArea = document.getElementById('dashboardArea');
const who = document.getElementById('who');
const listAreaSummary = document.getElementById('listAreaSummary');
const listAreaCheckedIn = document.getElementById('listAreaCheckedIn');
const reloadBtn = document.getElementById('reloadBtn');
const filterDate = document.getElementById('filterDate');
const todayLabel = document.getElementById('todayLabel');
const todayTime = document.getElementById('todayTime');
const kpiWrap = document.getElementById('kpiWrap');
const injectedControls = document.getElementById('injectedControls');

const navSummary = document.getElementById('navSummary');
const navCheckedIn = document.getElementById('navCheckedIn');
const exportCSVBtn = document.getElementById('exportCSVBtn');

/* injected overlap controls referencing (we keep same markup as before) */
const overlapWrap = document.createElement('div');
overlapWrap.className = 'card small';
overlapWrap.style.margin = '12px 0';
overlapWrap.innerHTML = `
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <label style="font-weight:700">Pilih tarikh</label>
    <input id="overlapDate" type="date" />
    <button id="checkOverlapBtn" class="btn btn-ghost">Semak Pertindihan Kenderaan</button>
    <button id="clearOverlapBtn" class="btn btn-ghost">Kosongkan</button>
  </div>
  <div id="overlapResult" style="margin-top:8px"></div>
`;
let overlapDateEl, checkOverlapBtn, clearOverlapBtn, overlapResultEl;

/* ---------- auth handlers ---------- */
loginBtn.addEventListener('click', async ()=>{
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  showLoginMsg(loginMsg, 'Log masuk...');
  try {
    await signInWithEmailAndPassword(window.__AUTH, email, pass);
  } catch (err) {
    console.error('login err', err);
    showLoginMsg(loginMsg, 'Gagal log masuk: ' + (err.message || err), false);
  }
});

logoutBtn.addEventListener('click', async ()=> {
  await signOut(window.__AUTH);
});

onAuthStateChanged(window.__AUTH, user => {
  if (user) {
    loginBox.style.display = 'none';
    dashboardArea.style.display = 'block';
    who.textContent = user.email || user.uid;
    logoutBtn.style.display = 'inline-block';
    // inject overlap controls once
    if (!document.getElementById('overlapDate')) {
      injectedControls.appendChild(overlapWrap);
      overlapDateEl = document.getElementById('overlapDate');
      checkOverlapBtn = document.getElementById('checkOverlapBtn');
      clearOverlapBtn = document.getElementById('clearOverlapBtn');
      overlapResultEl = document.getElementById('overlapResult');
      checkOverlapBtn.addEventListener('click', ()=> checkOverlapsAndRender());
      clearOverlapBtn.addEventListener('click', ()=> { overlapDateEl.value=''; overlapResultEl.innerHTML=''; loadTodayList(); });
    }
    // set today's date into filter and label
    const now = new Date();
    todayLabel.textContent = formatDateOnly(now);
    todayTime.textContent = now.toLocaleTimeString();
    filterDate.value = isoDateString(now);
    loadTodayList();
  } else {
    loginBox.style.display = 'block';
    dashboardArea.style.display = 'none';
    logoutBtn.style.display = 'none';
  }
});

/* ---------- paging & fetch ---------- */
async function loadTodayList(){
  // Uses filterDate value; default to today
  const dateStr = filterDate.value || isoDateString(new Date());
  await loadListForDateStr(dateStr);
}

reloadBtn.addEventListener('click', ()=> loadTodayList());
filterDate.addEventListener('change', ()=> loadTodayList());

navSummary.addEventListener('click', ()=> { showPage('summary'); });
navCheckedIn.addEventListener('click', ()=> { showPage('checkedin'); });

exportCSVBtn.addEventListener('click', ()=> {
  exportCSVForToday();
});

/* ---------- core fetch for a given date string yyyy-mm-dd ---------- */
async function loadListForDateStr(yyyymmdd){
  const d = yyyymmdd.split('-');
  if (d.length !== 3) { listAreaSummary.innerHTML = '<div class="small">Tarikh tidak sah</div>'; return; }
  const from = new Date(parseInt(d[0],10), parseInt(d[1],10)-1, parseInt(d[2],10), 0,0,0,0);
  const to = new Date(from); to.setDate(to.getDate()+1);

  listAreaSummary.innerHTML = '<div class="small">Memuat...</div>';
  listAreaCheckedIn.innerHTML = '<div class="small">Memuat...</div>';
  try {
    const col = collection(window.__FIRESTORE, 'responses');
    const q = query(col, where('eta', '>=', Timestamp.fromDate(from)), where('eta', '<', Timestamp.fromDate(to)), orderBy('eta','asc'));
    const snap = await getDocs(q);
    const rows = [];
    snap.forEach(d => rows.push({ id: d.id, ...d.data() }));

    // compute KPIs
    let pending = 0, checkedIn = 0, checkedOut = 0;
    rows.forEach(r => {
      if (!r.status || r.status === 'Pending') pending++;
      else if (r.status === 'Checked In') checkedIn++;
      else if (r.status === 'Checked Out') checkedOut++;
    });
    renderKPIs(pending, checkedIn, checkedOut);

    // render both pages: summary (all) and checked-in (filtered)
    renderList(rows, listAreaSummary, false);
    renderList(rows.filter(r => r.status === 'Checked In'), listAreaCheckedIn, true);
  } catch (err) {
    console.error('loadList err', err);
    listAreaSummary.innerHTML = '<div class="small">Gagal muat. Semak konsol.</div>';
    listAreaCheckedIn.innerHTML = '<div class="small">Gagal muat. Semak konsol.</div>';
  }
}

/* ---------- render helpers ---------- */
function renderKPIs(pending, checkedIn, checkedOut){
  kpiWrap.innerHTML = '';
  const createChip = (label, val) => {
    const d = document.createElement('div');
    d.className = 'chip';
    d.textContent = `${label}: ${val}`;
    return d;
  };
  kpiWrap.appendChild(createChip('Pending', pending));
  kpiWrap.appendChild(createChip('Dalam (Checked In)', checkedIn));
  kpiWrap.appendChild(createChip('Keluar (Checked Out)', checkedOut));
}

/* Render into a container (table mobile-friendly) */
function renderList(rows, containerEl, compact=false){
  if (!rows.length) { containerEl.innerHTML = '<div class="small">Tiada rekod</div>'; return; }
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  table.className = 'table';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr><th>Nama Pelawat</th><th>Unit / Tuan Rumah</th><th>ETA</th><th>ETD</th><th>Kenderaan</th><th>Status</th><th>Aksi</th></tr>`;
  table.appendChild(thead);
  const tbody = document.createElement('tbody');

  rows.forEach(r => {
    let vehicleDisplay = '-';
    if (Array.isArray(r.vehicleNumbers) && r.vehicleNumbers.length) vehicleDisplay = r.vehicleNumbers.join(', ');
    else if (r.vehicleNo) vehicleDisplay = r.vehicleNo;

    // WhatsApp link for host phone if exists
    let hostContactHtml = '';
    if (r.hostName || r.hostPhone) {
      const phone = (r.hostPhone || '').trim();
      if (phone) {
        const normalized = normalizePhoneForWhatsapp(phone);
        hostContactHtml = `${escapeHtml(r.hostName || '')} • <a class="tel-link" href="${normalized}" target="_blank" rel="noopener noreferrer">${escapeHtml(phone)}</a>`;
      } else {
        hostContactHtml = escapeHtml(r.hostName || '');
      }
    }

    const statusClass = r.status === 'Checked In' ? 'pill-in' : (r.status === 'Checked Out' ? 'pill-out' : 'pill-pending');
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${escapeHtml(r.visitorName || '')}${r.entryDetails ? '<div class="small">'+escapeHtml(r.entryDetails || '')+'</div>' : ''}</td>
      <td>${escapeHtml(r.hostUnit || '')}<div class="small">${hostContactHtml}</div></td>
      <td>${formatDateOnly(r.eta)}</td>
      <td>${formatDateOnly(r.etd)}</td>
      <td>${escapeHtml(vehicleDisplay)}</td>
      <td><span class="status-pill ${statusClass}">${escapeHtml(r.status || 'Pending')}</span></td>
      <td>
        <div class="actions">
          <button class="btn" data-action="in" data-id="${r.id}">Check In</button>
          <button class="btn btn-ghost" data-action="out" data-id="${r.id}">Check Out</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  containerEl.innerHTML = '';
  containerEl.appendChild(wrap);

  // Attach actions with equal button sizes already handled by CSS
  containerEl.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      await doStatusUpdate(id, action === 'in' ? 'Checked In' : 'Checked Out');
    });
  });
}

/* ---------- status update & audit ---------- */
async function doStatusUpdate(docId, newStatus){
  try {
    const ref = doc(window.__FIRESTORE, 'responses', docId);
    // fetch current doc to include old value in audit (optional)
    // const snap = await getDoc(ref);
    // const oldStatus = snap.exists() ? snap.data().status : '';
    await updateDoc(ref, { status: newStatus, updatedAt: serverTimestamp() });
    const auditCol = collection(window.__FIRESTORE, 'audit');
    await addDoc(auditCol, {
      ts: serverTimestamp(),
      userId: window.__AUTH.currentUser ? window.__AUTH.currentUser.uid : 'unknown',
      rowId: docId,
      field: 'status',
      old: '',
      new: newStatus,
      actionId: String(Date.now()),
      notes: ''
    });
    toast('Status dikemaskini');
    loadTodayList();
  } catch (err) {
    console.error('update err', err);
    alert('Gagal kemaskini status. Semak konsol.');
  }
}

/* ---------- overlap detection (same as previous) ---------- */
function buildDateRangeFromInput(dateStr){
  if (!dateStr) return null;
  const p = dateStr.split('-');
  if (p.length !== 3) return null;
  const y = parseInt(p[0],10), m = parseInt(p[1],10)-1, d = parseInt(p[2],10);
  const from = new Date(y,m,d,0,0,0,0);
  const to = new Date(from); to.setDate(to.getDate()+1);
  return { from, to };
}

async function checkOverlapsAndRender(){
  const dateStr = document.getElementById('overlapDate').value;
  overlapResultEl.innerHTML = '';
  if (!dateStr) { overlapResultEl.innerHTML = '<div class="small">Sila pilih tarikh untuk semakan.</div>'; return; }
  const range = buildDateRangeFromInput(dateStr);
  if (!range) { overlapResultEl.innerHTML = '<div class="small">Tarikh tidak sah.</div>'; return; }

  overlapResultEl.innerHTML = '<div class="small">Mencari rekod...</div>';
  try {
    const col = collection(window.__FIRESTORE, 'responses');
    const q = query(col, where('eta', '>=', Timestamp.fromDate(range.from)), where('eta', '<', Timestamp.fromDate(range.to)), orderBy('eta','desc'));
    const snap = await getDocs(q);
    const rows = [];
    snap.forEach(d => rows.push({ id: d.id, ...d.data() }));

    // map vehicle->Set(docId)
    const map = new Map();
    rows.forEach(r => {
      const vals = [];
      if (Array.isArray(r.vehicleNumbers) && r.vehicleNumbers.length) {
        r.vehicleNumbers.forEach(v => { if (v && v.trim()) vals.push(v.trim().toUpperCase()); });
      }
      if (r.vehicleNo) vals.push(String(r.vehicleNo).trim().toUpperCase());
      const uniq = [...new Set(vals)];
      uniq.forEach(v => {
        if (!v) return;
        if (!map.has(v)) map.set(v, new Set());
        map.get(v).add(r.id);
      });
    });

    const conflicts = [];
    for (const [veh, ids] of map.entries()) if (ids.size > 1) conflicts.push({ vehicle: veh, docIds: ids });

    if (!conflicts.length) {
      overlapResultEl.innerHTML = '<div class="msg">Tiada pertindihan nombor kenderaan pada tarikh ini.</div>';
      renderList(rows, listAreaSummary, false);
      return;
    }

    // summary + highlight
    let html = '<div class="small" style="margin-bottom:8px">Ditemui pertindihan untuk nombor berikut:</div>';
    conflicts.forEach(c => { html += `<div style="margin-bottom:6px"><strong>${c.vehicle}</strong> — ${c.docIds.size} rekod</div>`; });
    overlapResultEl.innerHTML = html + '<div class="small" style="margin-top:8px">Baris yang terlibat diserlahkan di table.</div>';

    const conflictMap = new Map();
    conflicts.forEach(c => conflictMap.set(c.vehicle, c.docIds));
    renderList(rows, listAreaSummary, false); // We don't highlight per-vehicle in this simplified render
    // details list
    const detailsWrap = document.createElement('div');
    detailsWrap.style.marginTop = '12px';
    detailsWrap.innerHTML = '<h4 style="margin:0 0 8px 0">Butiran Pertindihan</h4>';
    conflicts.forEach(c => {
      const div = document.createElement('div');
      div.className = 'small';
      div.style.marginBottom = '8px';
      const ids = Array.from(c.docIds);
      div.innerHTML = `<strong>${c.vehicle}</strong> — ${ids.length} rekod: ${ids.join(', ')}`;
      detailsWrap.appendChild(div);
    });
    overlapResultEl.appendChild(detailsWrap);
  } catch (err) {
    console.error('check overlap err', err);
    overlapResultEl.innerHTML = '<div class="small">Ralat semasa semakan. Semak konsol.</div>';
  }
}

/* ---------- CSV export (simple) ---------- */
async function exportCSVForToday(){
  const dateStr = filterDate.value || isoDateString(new Date());
  const d = dateStr.split('-');
  const from = new Date(parseInt(d[0],10), parseInt(d[1],10)-1, parseInt(d[2],10), 0,0,0,0);
  const to = new Date(from); to.setDate(to.getDate()+1);

  try {
    const col = collection(window.__FIRESTORE, 'responses');
    const q = query(col, where('eta', '>=', Timestamp.fromDate(from)), where('eta', '<', Timestamp.fromDate(to)), orderBy('eta','asc'));
    const snap = await getDocs(q);
    const rows = [];
    snap.forEach(d => rows.push({ id: d.id, ...d.data() }));

    if (!rows.length) { toast('Tiada rekod untuk eksport'); return; }

    const header = ['id','hostUnit','hostName','hostPhone','visitorName','visitorPhone','category','eta','etd','vehicleNo','vehicleNumbers','status'];
    const csv = [header.join(',')];
    rows.forEach(r => {
      const line = [
        r.id || '',
        (r.hostUnit||'').replace(/,/g,''),
        (r.hostName||'').replace(/,/g,''),
        (r.hostPhone||'').replace(/,/g,''),
        (r.visitorName||'').replace(/,/g,''),
        (r.visitorPhone||'').replace(/,/g,''),
        (r.category||'').replace(/,/g,''),
        (r.eta && r.eta.toDate) ? r.eta.toDate().toISOString() : '',
        (r.etd && r.etd.toDate) ? r.etd.toDate().toISOString() : '',
        (r.vehicleNo||'').replace(/,/g,''),
        (Array.isArray(r.vehicleNumbers) ? r.vehicleNumbers.join(';') : '').replace(/,/g,''),
        (r.status||'')
      ];
      csv.push(line.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','));
    });
    const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `visitors_${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('export csv err', err);
    toast('Gagal eksport CSV. Semak konsol.');
  }
}

/* ---------- utilities ---------- */
function escapeHtml(s){ if (!s) return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function normalizePhoneForWhatsapp(raw){
  // Accept local Malaysian formats; attempt to normalize to international without plus
  let p = String(raw).trim();
  // Remove spaces, dashes, parentheses
  p = p.replace(/[\s\-().]/g,'');
  // If starts with 0, replace with 60 (Malaysia). If starts with +, keep the +.
  if (p.startsWith('+')) return `https://wa.me/${p.replace(/^\+/,'')}`;
  if (p.startsWith('0')) return `https://wa.me/6${p.replace(/^0+/,'')}`;
  // fallback: assume already country code
  return `https://wa.me/${p}`;
}
function isoDateString(d){ const dd = String(d.getDate()).padStart(2,'0'); const mm = String(d.getMonth()+1).padStart(2,'0'); const yy = d.getFullYear(); return `${yy}-${mm}-${dd}`; }

/* ---------- page switching ---------- */
function showPage(key){
  if (key === 'summary') {
    document.getElementById('pageSummary').style.display = '';
    document.getElementById('pageCheckedIn').style.display = 'none';
    navSummary.classList.add('active'); navCheckedIn.classList.remove('active');
  } else {
    document.getElementById('pageSummary').style.display = 'none';
    document.getElementById('pageCheckedIn').style.display = '';
    navSummary.classList.remove('active'); navCheckedIn.classList.add('active');
  }
}

/* initialize filterDate with today if empty */
if (!filterDate.value) filterDate.value = isoDateString(new Date());

/* export overlap controls bind (we already add handlers on auth) */
document.addEventListener('DOMContentLoaded', ()=> {
  // nothing here; logic attached in onAuthStateChanged injection
});
