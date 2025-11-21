// js/dashboard.js (module) - patched version with category column + badges
import {
  collection, query, where, getDocs, orderBy, doc, updateDoc, serverTimestamp, addDoc, Timestamp, getDoc
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
function isoDateString(d){ const dd = String(d.getDate()).padStart(2,'0'); const mm = String(d.getMonth()+1).padStart(2,'0'); const yy = d.getFullYear(); return `${yy}-${mm}-${dd}`; }
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

/* injected overlap controls (reused) */
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

/* ---------- debug check ---------- */
console.info('dashboard.js loaded. window.__AUTH?', !!window.__AUTH, 'window.__FIRESTORE?', !!window.__FIRESTORE);

/* ---------- auth handlers ---------- */
loginBtn.addEventListener('click', async ()=>{
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  showLoginMsg(loginMsg, 'Log masuk...');
  try {
    const cred = await signInWithEmailAndPassword(window.__AUTH, email, pass);
    console.info('Login success:', cred.user && (cred.user.email || cred.user.uid));
    showLoginMsg(loginMsg, 'Berjaya log masuk.');
  } catch (err) {
    console.error('login err detailed', err);
    const code = err && err.code ? err.code : 'unknown_error';
    const msg = err && err.message ? err.message : String(err);
    showLoginMsg(loginMsg, `Gagal log masuk: ${code} — ${msg}`, false);
  }
});

logoutBtn.addEventListener('click', async ()=> {
  try {
    await signOut(window.__AUTH);
    showLoginMsg(loginMsg, 'Anda telah log keluar.', true);
  } catch (err) {
    console.error('logout err', err);
    showLoginMsg(loginMsg, 'Gagal log keluar', false);
  }
});

/* ---------- auth state change handling ---------- */
onAuthStateChanged(window.__AUTH, user => {
  console.info('dashboard: onAuthStateChanged ->', user ? (user.email || user.uid) : 'signed out');
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
    if (!filterDate.value) filterDate.value = isoDateString(now);
    loadTodayList();
  } else {
    loginBox.style.display = 'block';
    dashboardArea.style.display = 'none';
    logoutBtn.style.display = 'none';
  }
});

/* ---------- paging & fetch ---------- */
async function loadTodayList(){
  const dateStr = filterDate.value || isoDateString(new Date());
  await loadListForDateStr(dateStr);
}

reloadBtn.addEventListener('click', ()=> loadTodayList());
filterDate.addEventListener('change', ()=> loadTodayList());
navSummary.addEventListener('click', ()=> { showPage('summary'); });
navCheckedIn.addEventListener('click', ()=> { showPage('checkedin'); });
exportCSVBtn.addEventListener('click', ()=> { exportCSVForToday(); });

/* ---------- core fetch for date ---------- */
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

    // KPIs
    let pending = 0, checkedIn = 0, checkedOut = 0;
    rows.forEach(r => {
      if (!r.status || r.status === 'Pending') pending++;
      else if (r.status === 'Checked In') checkedIn++;
      else if (r.status === 'Checked Out') checkedOut++;
    });
    renderKPIs(pending, checkedIn, checkedOut);

    // render pages
    renderList(rows, listAreaSummary, false);
    renderCheckedInList(rows.filter(r => r.status === 'Checked In'));
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

/* ---------- Category helpers & badge map ---------- */

// determineCategory: returns Malay label for category
function determineCategory(r){
  if (r.category) {
    const k = String(r.category).toLowerCase();
    if (k.includes('contract') || k.includes('kontraktor')) return 'Kontraktor';
    if (k.includes('move') || k.includes('pindah')) return 'Pindah barang';
    if (k.includes('deliver') || k.includes('penghantaran')) return 'Penghantaran Barang';
    if (k.includes('vip') || k.includes('pelawat khas') || k.includes('special')) return 'Pelawat Khas';
    if (k.includes('resident') || k.includes('penghuni') || k.includes('owner') || k.includes('tenant')) return 'Penghuni';
    return String(r.category);
  }
  const note = (r.note || '').toString().toLowerCase();
  const role = (r.role || '').toString().toLowerCase();
  const vehicle = (Array.isArray(r.vehicleNumbers) ? r.vehicleNumbers.join(' ') : (r.vehicleNo || '')).toString().toLowerCase();

  if (/kontraktor|contractor|construction/i.test(note + ' ' + role)) return 'Kontraktor';
  if (/pindah|move out|moving|moved/i.test(note + ' ' + role)) return 'Pindah barang';
  if (/delivery|penghantaran|deliver|food|grab|foodpanda|lalamove/i.test(note + ' ' + role)) return 'Penghantaran Barang';
  if (/pelawat khas|vip|v\.i\.p|special guest/i.test(note + ' ' + role)) return 'Pelawat Khas';
  if (vehicle && vehicle.trim()) return 'Kenderaan';
  if (r.isResident || /penghuni|resident|owner|tenant/i.test(role + ' ' + note)) return 'Penghuni';
  return 'Pelawat';
}

// Badge class map (kategori label -> css class). Ensure matching CSS in style.css
const categoryClassMap = {
  'Pelawat': 'cat-pelawat',
  'Kontraktor': 'cat-kontraktor',
  'Pindah barang': 'cat-pindah',
  'Pelawat Khas': 'cat-pelawat-khas',
  'Penghantaran Barang': 'cat-penghantaran',
  'Kenderaan': 'cat-lain',
  'Penghuni': 'cat-lain'
};

/* General render for summary (full columns) with Kategori column + badges */
function renderList(rows, containerEl, compact=false){
  if (!rows || !rows.length) { containerEl.innerHTML = '<div class="small">Tiada rekod</div>'; return; }
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  table.className = 'table';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>
    <th>Nama Pelawat</th>
    <th>Unit / Tuan Rumah</th>
    <th>ETA</th>
    <th>ETD</th>
    <th>Kenderaan</th>
    <th>Kategori</th>
    <th>Status</th>
    <th>Aksi</th>
  </tr>`;
  table.appendChild(thead);
  const tbody = document.createElement('tbody');

  rows.forEach(r => {
    let vehicleDisplay = '-';
    if (Array.isArray(r.vehicleNumbers) && r.vehicleNumbers.length) vehicleDisplay = r.vehicleNumbers.join(', ');
    else if (r.vehicleNo) vehicleDisplay = r.vehicleNo;

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

    // determine category for display (no filtering)
    const categoryDisplay = determineCategory(r);
    const catClass = categoryClassMap[categoryDisplay] || 'cat-lain';

    const statusClass = r.status === 'Checked In' ? 'pill-in' : (r.status === 'Checked Out' ? 'pill-out' : 'pill-pending');
    const tr = document.createElement('tr');

    // Build inner HTML with category badge cell
    tr.innerHTML = `
      <td>${escapeHtml(r.visitorName || '')}${r.entryDetails ? '<div class="small">'+escapeHtml(r.entryDetails || '')+'</div>' : ''}</td>
      <td>${escapeHtml(r.hostUnit || '')}<div class="small">${hostContactHtml}</div></td>
      <td>${formatDateOnly(r.eta)}</td>
      <td>${formatDateOnly(r.etd)}</td>
      <td>${escapeHtml(vehicleDisplay)}</td>
      <td><span class="cat-badge ${catClass}">${escapeHtml(categoryDisplay)}</span></td>
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

  // Attach actions
  containerEl.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      await doStatusUpdate(id, action === 'in' ? 'Checked In' : 'Checked Out');
    });
  });
}

/* ---------- Checked-In page minimal columns & Edit button ---------- */
function renderCheckedInList(rows){
  const containerEl = listAreaCheckedIn;
  if (!rows || rows.length === 0) { containerEl.innerHTML = '<div class="small">Tiada rekod</div>'; return; }

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  table.className = 'table';
  table.innerHTML = `<thead><tr>
    <th>Unit / Tuan Rumah</th>
    <th>ETA</th>
    <th>ETD</th>
    <th>Kenderaan</th>
    <th>Status</th>
    <th>Aksi</th>
  </tr></thead>`;
  const tbody = document.createElement('tbody');

  rows.forEach(r => {
    const vehicleDisplay = (Array.isArray(r.vehicleNumbers) && r.vehicleNumbers.length) ? r.vehicleNumbers.join(', ') : (r.vehicleNo || '-');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(r.hostUnit || '')}${r.hostName ? '<div class="small">'+escapeHtml(r.hostName)+'</div>' : ''}</td>
      <td>${formatDateOnly(r.eta)}</td>
      <td>${formatDateOnly(r.etd)}</td>
      <td>${escapeHtml(vehicleDisplay)}</td>
      <td><span class="status-pill ${r.status === 'Checked In' ? 'pill-in' : (r.status === 'Checked Out' ? 'pill-out' : 'pill-pending')}">${escapeHtml(r.status || 'Pending')}</span></td>
      <td>
        <div class="actions">
          <button class="btn btn-edit" data-id="${r.id}">Isi Butiran</button>
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

  // Attach actions
  containerEl.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      await doStatusUpdate(id, action === 'in' ? 'Checked In' : 'Checked Out');
    });
  });

  // Attach edit buttons
  containerEl.querySelectorAll('button.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      openEditModalFor(id);
    });
  });
}

/* ---------- status update & audit ---------- */
async function doStatusUpdate(docId, newStatus){
  try {
    const ref = doc(window.__FIRESTORE, 'responses', docId);
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

/* ---------- overlap detection (unchanged) ---------- */
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

    let html = '<div class="small" style="margin-bottom:8px">Ditemui pertindihan untuk nombor berikut:</div>';
    conflicts.forEach(c => { html += `<div style="margin-bottom:6px"><strong>${c.vehicle}</strong> — ${c.docIds.size} rekod</div>`; });
    overlapResultEl.innerHTML = html + '<div class="small" style="margin-top:8px">Baris yang terlibat diserlahkan di table.</div>';

    renderList(rows, listAreaSummary, false);
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

/* ---------- CSV export ---------- */
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
  let p = String(raw || '').trim();
  p = p.replace(/[\s\-().]/g,'');
  if (!p) return '#';
  if (p.startsWith('+')) return `https://wa.me/${p.replace(/^\+/,'')}`;
  if (p.startsWith('0')) return `https://wa.me/6${p.replace(/^0+/,'')}`;
  return `https://wa.me/${p}`;
}

/* ---------- modal edit: open/close/save ---------- */
async function openEditModalFor(docId){
  try {
    const ref = doc(window.__FIRESTORE, 'responses', docId);
    const snap = await getDoc(ref);
    if (!snap.exists()) { alert('Rekod tidak ditemui'); return; }
    const data = snap.data();
    document.getElementById('editDocId').value = docId;
    document.getElementById('editUnit').value = data.hostUnit || '';
    document.getElementById('editETA').value = data.eta && data.eta.toDate ? isoDateString(data.eta.toDate()) : '';
    document.getElementById('editETD').value = data.etd && data.etd.toDate ? isoDateString(data.etd.toDate()) : '';
    const veh = Array.isArray(data.vehicleNumbers) && data.vehicleNumbers.length ? data.vehicleNumbers.join(';') : (data.vehicleNo || '');
    document.getElementById('editVehicle').value = veh;
    document.getElementById('editStatus').value = data.status || 'Pending';
    showModal(true);
  } catch (err) {
    console.error('openEditModalFor err', err);
    alert('Gagal muatkan data. Semak konsol');
  }
}

function showModal(open){
  const modal = document.getElementById('editModal');
  if (!modal) return;
  if (open) {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden','false');
  } else {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden','true');
  }
}

document.getElementById('closeEditModal').addEventListener('click', ()=> showModal(false));
document.getElementById('cancelEditBtn').addEventListener('click', ()=> showModal(false));

document.getElementById('saveEditBtn').addEventListener('click', async (ev) => {
  ev.preventDefault();
  const id = document.getElementById('editDocId').value;
  if (!id) { alert('ID dokumen hilang'); return; }
  const unit = document.getElementById('editUnit').value.trim();
  const etaVal = document.getElementById('editETA').value || '';
  const etdVal = document.getElementById('editETD').value || '';
  const vehicleRaw = document.getElementById('editVehicle').value.trim();
  const status = document.getElementById('editStatus').value;

  const payload = {};
  if (unit) payload.hostUnit = unit;
  if (etaVal) payload.eta = Timestamp.fromDate(new Date(etaVal));
  if (etdVal) payload.etd = Timestamp.fromDate(new Date(etdVal));
  if (vehicleRaw) {
    const parts = vehicleRaw.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) { payload.vehicleNumbers = parts; payload.vehicleNo = ''; }
    else { payload.vehicleNo = parts[0] || ''; payload.vehicleNumbers = []; }
  }
  payload.status = status;
  payload.updatedAt = serverTimestamp();

  try {
    const ref = doc(window.__FIRESTORE, 'responses', id);
    // get old doc for audit
    const oldSnap = await getDoc(ref);
    const oldData = oldSnap.exists() ? oldSnap.data() : null;
    await updateDoc(ref, payload);

    const auditCol = collection(window.__FIRESTORE, 'audit');
    await addDoc(auditCol, {
      ts: serverTimestamp(),
      userId: window.__AUTH.currentUser ? window.__AUTH.currentUser.uid : 'unknown',
      rowId: id,
      field: 'manual_update',
      old: oldData ? JSON.stringify(oldData) : '',
      new: JSON.stringify(payload),
      actionId: String(Date.now()),
      notes: 'Manual edit from dashboard'
    });

    toast('Maklumat disimpan');
    showModal(false);
    await loadTodayList();
  } catch (err) {
    console.error('saveEdit err', err);
    alert('Gagal simpan. Semak konsol.');
  }
});

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

/* DOM ready (no-op) */
document.addEventListener('DOMContentLoaded', ()=>{ /* ready */ });

/* Parking report module */
(async function initParkingModule(){
  // DOM
  const navParking = document.getElementById('navParking');
  const pageParking = document.getElementById('pageParking');
  const parkingDateLabel = document.getElementById('parkingDateLabel');
  const parkingPKName = document.getElementById('parkingPKName');
  const parkingMasuk = document.getElementById('parkingMasuk');
  const parkingLuar = document.getElementById('parkingLuar');
  const parkingSaveAll = document.getElementById('parkingSaveAll');

  const modal = document.getElementById('parkingSlotModal');
  const closeParkingModal = document.getElementById('closeParkingModal');
  const cancelSlotBtn = document.getElementById('cancelSlotBtn');
  const saveSlotBtn = document.getElementById('saveSlotBtn');
  const clearSlotBtn = document.getElementById('clearSlotBtn');
  const slotNumberEl = document.getElementById('slotNumber');
  const slotVehicleEl = document.getElementById('slotVehicle');
  const slotUnitEl = document.getElementById('slotUnit');
  const slotETAEl = document.getElementById('slotETA');
  const slotETDEl = document.getElementById('slotETD');
  const slotDocIdEl = document.getElementById('slotDocId');

  // Define slot lists
  const masukSlots = Array.from({length:19}, (_,i)=> String(i+1).padStart(2,'0')); // "01".."19"
  const luarSlots = Array.from({length:19}, (_,i)=> String(40 + i)); // "40".."58"

  // In-memory cache of slot docs for current date: { slotId: { vehicle, unit, eta, etd, docId } }
  let slotCache = {};

  // Helper: format date label
  function setParkingDate(dateStr){
    const d = dateStr ? new Date(dateStr) : new Date();
    parkingDateLabel.textContent = formatDateOnly(d);
  }

  // Show / hide page handlers
  if (navParking) navParking.addEventListener('click', ()=> {
    showPage('summary'); // keep other nav deactivated
    // show parking page
    document.getElementById('pageSummary').style.display = 'none';
    document.getElementById('pageCheckedIn').style.display = 'none';
    pageParking.style.display = '';
    // set date label from filterDate
    setParkingDate(filterDate.value || isoDateString(new Date()));
    loadParkingForDate(filterDate.value || isoDateString(new Date()));
  });

  // Close modal handlers
  [closeParkingModal, cancelSlotBtn].forEach(b => b && b.addEventListener('click', ()=> { modal.classList.add('hidden'); modal.setAttribute('aria-hidden','true'); }));

  // Open edit modal for slot
  function openSlotModal(slotId){
    const data = slotCache[slotId] || {};
    slotNumberEl.value = slotId;
    slotVehicleEl.value = data.vehicle || '';
    slotUnitEl.value = data.unit || '';
    slotETAEl.value = data.eta || '';
    slotETDEl.value = data.etd || '';
    slotDocIdEl.value = data.docId || '';
    modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false');
    slotVehicleEl.focus();
  }

  // Render single slot row
  function renderSlotRow(slotId, container){
    const data = slotCache[slotId] || {};
    const div = document.createElement('div');
    div.className = 'parking-slot' + (data.vehicle ? ' filled' : '');
    div.dataset.slot = slotId;
    div.innerHTML = `
      <div class="meta">
        <div class="slot-num">${escapeHtml(slotId)}</div>
        <div class="slot-info">
          <div class="small">${data.vehicle ? escapeHtml(data.vehicle) : '<span class="parking-empty">Kosong</span>'}</div>
          <div class="small">${data.unit ? escapeHtml(data.unit) : ''} ${data.eta ? '• '+escapeHtml(data.eta) : ''} ${data.etd ? '• '+escapeHtml(data.etd) : ''}</div>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-edit-slot" data-slot="${escapeHtml(slotId)}">Edit</button>
      </div>
    `;
    // click edit
    div.querySelector('.btn-edit-slot').addEventListener('click', (e)=> {
      openSlotModal(slotId);
    });
    container.appendChild(div);
  }

  // Render all slots
  function renderAllSlots(){
    parkingMasuk.innerHTML = '';
    parkingLuar.innerHTML = '';
    masukSlots.forEach(s => renderSlotRow(s, parkingMasuk));
    luarSlots.forEach(s => renderSlotRow(s, parkingLuar));
  }

  // Load parking slots from Firestore for the given date
  async function loadParkingForDate(dateStr){
    slotCache = {}; // reset
    // try to read docs from collection 'parkingSlots' where date == dateStr
    try {
      const colRef = collection(window.__FIRESTORE, 'parkingSlots');
      // Query by date field stored as string 'YYYY-MM-DD' or stored as date -> adjust accordingly
      // We'll fetch all docs with field date == dateStr (string). If you store Date/Timestamp instead, adapt query.
      const q = query(colRef, where('date','==', dateStr || isoDateString(new Date())));
      const snap = await getDocs(q);
      snap.forEach(d => {
        const p = d.data();
        if (!p || !p.slot) return;
        slotCache[p.slot] = {
          vehicle: p.vehicle || '',
          unit: p.unit || '',
          eta: p.eta || '',
          etd: p.etd || '',
          docId: d.id
        };
      });
    } catch (err) {
      console.warn('loadParkingForDate: failed to query parkingSlots; falling back to empty cache', err);
    }

    // Render
    renderAllSlots();
  }

  // Save a single slot to Firestore (create or update)
  async function saveSlot(slotId, payload){
    try {
      const colRef = collection(window.__FIRESTORE, 'parkingSlots');
      // If docId exists, update
      const existing = slotCache[slotId] && slotCache[slotId].docId ? slotCache[slotId].docId : null;
      if (existing) {
        const refDoc = doc(window.__FIRESTORE, 'parkingSlots', existing);
        await updateDoc(refDoc, payload);
      } else {
        // create with slot and date
        const toCreate = Object.assign({ slot: slotId, date: filterDate.value || isoDateString(new Date()) }, payload);
        const created = await addDoc(colRef, toCreate);
        slotCache[slotId] = Object.assign({}, payload, { docId: created.id });
      }
      // update local cache & re-render slot
      slotCache[slotId] = Object.assign({}, slotCache[slotId] || {}, payload);
      renderAllSlots();
      toast('Slot disimpan');
      // write audit
      if (typeof writeAudit === 'function') writeAudit('parking_slot_save', { rowId: slotId, meta: payload, note: `slot ${slotId}` });
    } catch (err) {
      console.error('saveSlot err', err);
      alert('Gagal simpan slot. Semak konsol.');
    }
  }

  // Save all slots (bulk): currently it writes PK name and leaves slot docs alone
  parkingSaveAll.addEventListener('click', async ()=> {
    // persist PK name optionally in a single doc
    try {
      const pkName = parkingPKName.value.trim();
      const metaCol = collection(window.__FIRESTORE, 'parkingMeta');
      // simple design: doc id per date
      const docId = `meta-${filterDate.value || isoDateString(new Date())}`;
      // attempt to update existing doc, otherwise create (using addDoc not suitable for custom id)
      try {
        const refDoc = doc(window.__FIRESTORE, 'parkingMeta', docId);
        await updateDoc(refDoc, { pkName, updatedAt: serverTimestamp() });
      } catch (e) {
        // create with set via addDoc? use addDoc to create no custom id; to keep stable id you'd normally use setDoc; 
        // fallback: addDoc with explicit date field
        await addDoc(collection(window.__FIRESTORE, 'parkingMeta'), { date: filterDate.value || isoDateString(new Date()), pkName, createdAt: serverTimestamp() });
      }
      toast('Maklumat ringkasan disimpan');
      if (typeof writeAudit === 'function') writeAudit('parking_meta_save', { note: `pkName=${pkName}` });
    } catch (err) {
      console.error('parkingSaveAll err', err);
      alert('Gagal simpan ringkasan. Semak konsol.');
    }
  });

  // Modal save / clear handlers
  saveSlotBtn.addEventListener('click', async ()=> {
    const slotId = slotNumberEl.value;
    const payload = {
      vehicle: slotVehicleEl.value.trim() || '',
      unit: slotUnitEl.value.trim() || '',
      eta: slotETAEl.value || '',
      etd: slotETDEl.value || ''
    };
    await saveSlot(slotId, payload);
    modal.classList.add('hidden'); modal.setAttribute('aria-hidden','true');
  });

  clearSlotBtn.addEventListener('click', async ()=> {
    // clear slot fields and remove doc if exists
    const slotId = slotNumberEl.value;
    const docId = slotCache[slotId] && slotCache[slotId].docId;
    if (docId) {
      try {
        const refDoc = doc(window.__FIRESTORE, 'parkingSlots', docId);
        await updateDoc(refDoc, { vehicle:'', unit:'', eta:'', etd:'', updatedAt: serverTimestamp() });
        slotCache[slotId] = { vehicle:'', unit:'', eta:'', etd:'', docId };
        renderAllSlots();
        toast('Slot dikosongkan');
        if (typeof writeAudit === 'function') writeAudit('parking_slot_clear', { rowId: slotId });
      } catch (err) {
        console.error('clearSlot err', err);
        alert('Gagal kosongkan slot. Semak konsol.');
      }
    } else {
      // simply clear local fields
      slotVehicleEl.value = ''; slotUnitEl.value = ''; slotETAEl.value = ''; slotETDEl.value = '';
      slotCache[slotId] = { vehicle:'', unit:'', eta:'', etd:'' };
      renderAllSlots();
      modal.classList.add('hidden'); modal.setAttribute('aria-hidden','true');
    }
  });

  // When date filter changes, reload parking slots if page visible
  filterDate.addEventListener('change', ()=> {
    if (pageParking && pageParking.style.display !== 'none') {
      setParkingDate(filterDate.value);
      loadParkingForDate(filterDate.value);
    }
  });

  // Initialize date label
  setParkingDate(filterDate.value || isoDateString(new Date()));

  // Expose for debugging / external use
  window.loadParkingForDate = loadParkingForDate;
})();

