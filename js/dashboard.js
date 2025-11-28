// js/dashboard.js — full patched version with parking save fixes, deterministic doc IDs,
// and assignLotTransaction (Firestore transaction) for atomic parking assignment.

import {
  collection, query, where, getDocs, orderBy, doc, updateDoc, serverTimestamp,
  addDoc, setDoc, Timestamp, getDoc, runTransaction, writeBatch
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
function toast(msg, ok = true){ const t = document.createElement('div'); t.className = `msg ${ok ? 'ok' : 'err'}`; t.textContent = msg; // a11y
  t.setAttribute('role','status'); t.setAttribute('aria-live','polite'); t.setAttribute('aria-atomic','true');
  document.body.appendChild(t); setTimeout(()=>t.remove(),3000); }
function escapeHtml(s){ if (!s) return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function normalizePhoneForWhatsapp(raw){
  let p = String(raw || '').trim();
  p = p.replace(/[\s\-().]/g,'');
  if (!p) return '#';
  if (p.startsWith('+')) return `https://wa.me/${p.replace(/^\+/,'')}`;
  if (p.startsWith('0')) return `https://wa.me/6${p.replace(/^0+/,'')}`;
  return `https://wa.me/${p}`;
}

/* ---------- Category Mapping (moved early to avoid TDZ) ---------- */
const categoryClassMap = {
  'Pelawat': 'cat-pelawat',
  'Kontraktor': 'cat-kontraktor',
  'Pindah barang': 'cat-pindah',
  'Pelawat Khas': 'cat-pelawat-khas',
  'Penghantaran Barang': 'cat-penghantaran',
  'Kenderaan': 'cat-lain',
  'Penghuni': 'cat-lain'
};

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
const navParking = document.getElementById('navParking');
const exportCSVBtn = document.getElementById('exportCSVBtn');

// auto-refresh timer handle
let autoRefreshTimer = null;

function startAutoRefresh(intervalMs = 60_000){
  try{
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(()=>{
      console.info('[autoRefresh] running loadTodayList');
      loadTodayList();
    }, intervalMs);
    console.info('[autoRefresh] started interval', intervalMs);
    return autoRefreshTimer;
  } catch(e) { console.warn('startAutoRefresh err', e); }
}


/* ---------- debug ---------- */
console.info('dashboard.js loaded. __AUTH?', !!window.__AUTH, '__FIRESTORE?', !!window.__FIRESTORE);

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

/* ---------- auth state change ---------- */
onAuthStateChanged(window.__AUTH, user => {
  console.info('dashboard: onAuthStateChanged ->', user ? (user.email || user.uid) : 'signed out');
  if (user) {
    loginBox.style.display = 'none';
    dashboardArea.style.display = 'block';
    who.textContent = user.email || user.uid;
    logoutBtn.style.display = 'inline-block';


    const now = new Date();
    todayLabel.textContent = formatDateOnly(now);
    todayTime.textContent = now.toLocaleTimeString();
    if (!filterDate.value) filterDate.value = isoDateString(now);
    loadTodayList();
    startAutoRefresh();
  } else {
    loginBox.style.display = 'block';
    dashboardArea.style.display = 'none';
    logoutBtn.style.display = 'none';
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  }
});

/* ---------- paging & fetch ---------- */
async function loadTodayList(){
  const dateStr = filterDate.value || isoDateString(new Date());
  await loadListForDateStr(dateStr);
}

if (reloadBtn) reloadBtn.addEventListener('click', ()=> loadTodayList());
if (filterDate) filterDate.addEventListener('change', ()=> {
  loadTodayList();
  if (document.getElementById('pageParking') && document.getElementById('pageParking').style.display !== 'none') {
    const ds = filterDate.value || isoDateString(new Date());
    document.getElementById('parkingDateLabel').textContent = formatDateOnly(new Date(ds));
    if (typeof window.loadParkingForDate === 'function') window.loadParkingForDate(ds);
  }
});
if (navSummary) navSummary.addEventListener('click', ()=> { showPage('summary'); });
if (navCheckedIn) navCheckedIn.addEventListener('click', ()=> { showPage('checkedin'); });
if (exportCSVBtn) exportCSVBtn.addEventListener('click', ()=> { exportCSVForToday(); });

/* ---------- core fetch ---------- */
async function loadListForDateStr(yyyymmdd){
  console.info('[loadListForDateStr] called', yyyymmdd);
  const d = yyyymmdd.split('-');
  if (d.length !== 3) { listAreaSummary.innerHTML = '<div class="small">Tarikh tidak sah</div>'; return; }
  const from = new Date(parseInt(d[0],10), parseInt(d[1],10)-1, parseInt(d[2],10), 0,0,0,0);
  const to = new Date(from); to.setDate(to.getDate()+1);

  const spinner = document.getElementById('spinner');
  if (spinner) spinner.style.display = 'flex';
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
    console.info('[loadListForDateStr] rendered summary + checked-in lists, rows:', rows.length);
  } catch (err) {
    console.error('loadList err', err);
    listAreaSummary.innerHTML = '<div class="small">Gagal muat. Semak konsol.</div>';
    listAreaCheckedIn.innerHTML = '<div class="small">Gagal muat. Semak konsol.</div>';
  } finally {
    if (spinner) spinner.style.display = 'none';
  }
}

/* ---------- KPIs ---------- */
function renderKPIs(pending, checkedIn, checkedOut){
  kpiWrap.innerHTML = '';
  const chip = (label, val, cls = '') => {
    const d = document.createElement('div');
    d.className = `chip ${cls}`.trim();
    d.textContent = `${label}: ${val}`;
    d.setAttribute('role','status');
    d.setAttribute('aria-live','polite');
    return d;
  };
  kpiWrap.appendChild(chip('Pending', pending, 'chip-pending'));
  kpiWrap.appendChild(chip('Dalam (Checked In)', checkedIn, 'chip-in'));
  kpiWrap.appendChild(chip('Keluar (Checked Out)', checkedOut, 'chip-out'));
}

/* ---------- Category ---------- */
function determineCategory(r){
  if (r.category) {
    // normalize whitespace and punctuation
    const k = String(r.category).trim().toLowerCase().replace(/[()\[\],.]/g,'');
    if (k.includes('contract') || k.includes('kontraktor') || k.includes('kontraktor')) return 'Kontraktor';
    if (k.includes('move') || k.includes('pindah')) return 'Pindah barang';
    if (k.includes('deliver') || k.includes('penghantaran') || k.includes('delivery') || k.includes('hantar')) return 'Penghantaran Barang';
    if (k.includes('vip') || k.includes('pelawat khas') || k.includes('special') || k.includes('v i p')) return 'Pelawat Khas';
    if (k.includes('resident') || k.includes('penghuni') || k.includes('owner') || k.includes('tenant') || k.includes('occupant')) return 'Penghuni';
    return String(r.category);
  }
  const note = (r.note || '').toString().toLowerCase();
  const role = (r.role || '').toString().toLowerCase();
  const vehicle = (Array.isArray(r.vehicleNumbers) ? r.vehicleNumbers.join(' ') : (r.vehicleNo || '')).toString().toLowerCase();
  if (/kontraktor|contractor|construction|kontraktor/i.test(note + ' ' + role)) return 'Kontraktor';
  if (/pindah|move out|moving|moved|move in|pindah rumah|pindah barang/i.test(note + ' ' + role)) return 'Pindah barang';
  if (/delivery|penghantaran|deliver|hantar|food|grab|foodpanda|lalamove/i.test(note + ' ' + role)) return 'Penghantaran Barang';
  if (/pelawat khas|vip|v\.i\.p|special guest|v i p/i.test(note + ' ' + role)) return 'Pelawat Khas';
  if (vehicle && vehicle.trim()) return 'Kenderaan';
  if (r.isResident || /penghuni|resident|owner|tenant/i.test(role + ' ' + note)) return 'Penghuni';
  return 'Pelawat';
}

/* ---------- Render summary ---------- */
function renderList(rows, containerEl, compact=false, highlightIds = new Set()){
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

    const categoryDisplay = determineCategory(r);
    const catClass = categoryClassMap[categoryDisplay] || 'cat-lain';
    const statusClass = r.status === 'Checked In' ? 'pill-in' : (r.status === 'Checked Out' ? 'pill-out' : 'pill-pending');

    const tr = document.createElement('tr');
    if (highlightIds && highlightIds.has(r.id)) tr.classList.add('conflict');
    tr.innerHTML = `
      <td class="visitor-cell">${escapeHtml(r.visitorName || '')}${r.entryDetails ? '<div class="small">'+escapeHtml(r.entryDetails || '')+'</div>' : ''}${r.visitorPhone ? (function(){ const waHref = normalizePhoneForWhatsapp(r.visitorPhone); return '<div class="small visitor-phone"><a class="tel-link" href="'+waHref+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(r.visitorPhone)+'</a></div>'; })() : ''}</td>
      <td>${escapeHtml(r.hostUnit || '')}${hostContactHtml ? '<div class="small">'+hostContactHtml+'</div>' : ''}</td>
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

  containerEl.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      await doStatusUpdate(id, action === 'in' ? 'Checked In' : 'Checked Out');
    });
  });

  // No generic 'Isi Butiran' handlers here (checked-in edit removed)
}

/* ---------- Checked-In list (grouped by category) ---------- */
function renderCheckedInList(rows){
  const containerEl = listAreaCheckedIn;
  if (!rows || rows.length === 0) { containerEl.innerHTML = '<div class="small">Tiada rekod</div>'; return; }

  // group rows by category
  const groups = {};
  rows.forEach(r => {
    const c = determineCategory(r);
    groups[c] = groups[c] || [];
    groups[c].push(r);
  });

  // preferred order of categories
  const order = ['Pelawat','Kontraktor','Pindah barang','Penghantaran Barang','Pelawat Khas','Kenderaan','Penghuni'];
  const keys = Object.keys(groups).sort((a,b) => {
    const ia = order.indexOf(a); const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1; if (ib === -1) return -1; return ia - ib;
  });

  // build grouped card
  const wrap = document.createElement('div');
  wrap.className = 'card card-tight';
  keys.forEach(k => {
    const list = groups[k];
    const catClass = categoryClassMap[k] || 'cat-lain';
    const groupEl = document.createElement('div');
    groupEl.className = `parking-summary-group ${catClass}`;

    // header (coloured by category via catClass)
    const header = document.createElement('div');
    header.className = 'parking-summary-header';

    // create accessible toggle id for tbody
    const tidyKey = String(k).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'group';
    const tbodyId = `group-${tidyKey}-${Math.random().toString(36).slice(2,6)}`;

    header.innerHTML = `
      <div style="font-weight:700; display:flex; align-items:center; gap:12px">
        <button aria-controls="${tbodyId}" aria-expanded="true" class="group-toggle" title="Togol kumpulan ${escapeHtml(k)}">▾</button>
        <span class="group-title ${catClass}">${escapeHtml(k)}</span>
        <span class="small muted" style="margin-left:8px">(${list.length})</span>
      </div>`;
    groupEl.appendChild(header);

    const table = document.createElement('table');
    table.className = 'table';
    table.innerHTML = `<thead><tr>
      <th>Kategori</th>
      <th>Unit / Tuan Rumah</th>
      <th>Tarikh masuk</th>
      <th>Tarikh keluar</th>
      <th>Kenderaan</th>
      <th>Status</th>
      <th>Aksi</th>
    </tr></thead>`;
    const tbody = document.createElement('tbody');
    tbody.id = tbodyId;

    list.forEach(r => {
      const vehicleDisplay = (Array.isArray(r.vehicleNumbers) && r.vehicleNumbers.length) ? r.vehicleNumbers.join(', ') : (r.vehicleNo || '-');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="cat-badge ${catClass}">${escapeHtml(k)}</span></td>
        <td>${escapeHtml(r.hostUnit || '')}${r.hostName ? '<div class="small">'+escapeHtml(r.hostName)+'</div>' : ''}</td>
        <td>${formatDateOnly(r.eta)}</td>
        <td>${formatDateOnly(r.etd)}</td>
        <td>${escapeHtml(vehicleDisplay)}</td>
        <td><span class="status-pill ${r.status === 'Checked In' ? 'pill-in' : (r.status === 'Checked Out' ? 'pill-out' : 'pill-pending')}">${escapeHtml(r.status || 'Pending')}</span></td>
        <td>
          <div class="actions">
            <button class="btn" data-action="in" data-id="${r.id}">Check In</button>
            <button class="btn btn-ghost" data-action="out" data-id="${r.id}">Check Out</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

      // attach toggle handler to header button
      setTimeout(()=>{
        const btn = header.querySelector('.group-toggle');
        if (!btn) return;
        btn.addEventListener('click', ()=>{
          const expanded = btn.getAttribute('aria-expanded') === 'true';
          btn.setAttribute('aria-expanded', String(!expanded));
          if (!expanded) {
            // expand
            tbody.style.display = '';
            groupEl.classList.remove('collapsed');
            btn.textContent = '▾';
          } else {
            // collapse
            tbody.style.display = 'none';
            groupEl.classList.add('collapsed');
            btn.textContent = '▸';
          }
        });
      }, 0);

    table.appendChild(tbody);
    groupEl.appendChild(table);
    wrap.appendChild(groupEl);
  });

  containerEl.innerHTML = '';
  containerEl.appendChild(wrap);

  // attach button handlers
  containerEl.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      await doStatusUpdate(id, action === 'in' ? 'Checked In' : 'Checked Out');
    });
  });
}

/* ---------- Checked-In list ---------- */

/* ---------- status update & audit ---------- */
async function doStatusUpdate(docId, newStatus){
  try {
    const ref = doc(window.__FIRESTORE, 'responses', docId);

    // check existence
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { status: newStatus, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      await updateDoc(ref, { status: newStatus, updatedAt: serverTimestamp() });
    }

    // audit
    try {
      const auditCol = collection(window.__FIRESTORE, 'audit');
      await addDoc(auditCol, {
        ts: serverTimestamp(),
        userId: window.__AUTH.currentUser ? window.__AUTH.currentUser.uid : 'unknown',
        rowId: docId,
        field: 'status',
        old: snap.exists() ? JSON.stringify(snap.data()) : '',
        new: newStatus,
        actionId: String(Date.now()),
        notes: 'Status change from dashboard'
      });
    } catch(auditErr) {
      console.error('[status] audit write failed', auditErr);
    }

    toast('Status dikemaskini');
    await loadTodayList();
  } catch (err) {
    console.error('[status] doStatusUpdate err', err);
    toast('Gagal kemaskini status. Semak konsol untuk butiran penuh.');
  }
}

/* overlap detection removed per user request */

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

/* ---------- modal edit ---------- */
async function openEditModalFor(docId){
  try {
    const ref = doc(window.__FIRESTORE, 'responses', docId);
    const snap = await getDoc(ref);
    if (!snap.exists()) { toast('Rekod tidak ditemui'); return; }
    const data = snap.data();
    document.getElementById('editDocId').value = docId;
    document.getElementById('editUnit').value = data.hostUnit || '';
    document.getElementById('editETA').value = data.eta && data.eta.toDate ? isoDateString(data.eta.toDate()) : '';
    document.getElementById('editETD').value = data.etd && data.etd.toDate ? isoDateString(data.etd.toDate()) : '';
    const veh = Array.isArray(data.vehicleNumbers) && data.vehicleNumbers.length ? data.vehicleNumbers.join(';') : (data.vehicleNo || '');
    document.getElementById('editVehicle').value = veh;
    document.getElementById('editStatus').value = data.status || 'Pending';
    openModal(document.getElementById('editModal'), '#saveEditBtn');
  } catch (err) {
    console.error('openEditModalFor err', err);
    toast('Gagal muatkan data. Semak konsol');
  }
}
// Modal helper: open, close, focus trap and restore focus
// Use 'var' here so the binding is hoisted and not subject to TDZ when modal helpers are invoked
var _lastFocusedElement = null;
function _getFocusable(modal){
  const sel = 'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(modal.querySelectorAll(sel)).filter(el => el.offsetParent !== null);
}
function openModal(modal, initialFocusSelector){
  if (!modal) return;
  _lastFocusedElement = document.activeElement;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden','false');
  // focus
  const focusBase = initialFocusSelector ? modal.querySelector(initialFocusSelector) : modal.querySelector('button, input, select, textarea');
  (focusBase || modal).focus();
  // trap
  const focusables = _getFocusable(modal);
  if (focusables.length) {
    const first = focusables[0]; const last = focusables[focusables.length-1];
    modal._trapListener = (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
      else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
    };
    modal.addEventListener('keydown', modal._trapListener);
  }
}
function closeModal(modal){
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden','true');
  if (modal._trapListener) { modal.removeEventListener('keydown', modal._trapListener); modal._trapListener = null; }
  if (_lastFocusedElement && typeof _lastFocusedElement.focus === 'function') _lastFocusedElement.focus();
  _lastFocusedElement = null;
}
document.getElementById('closeEditModal').addEventListener('click', ()=> closeModal(document.getElementById('editModal')));
document.getElementById('cancelEditBtn').addEventListener('click', ()=> closeModal(document.getElementById('editModal')));
document.getElementById('saveEditBtn').addEventListener('click', async (ev) => {
  ev.preventDefault();
  const id = document.getElementById('editDocId').value;
  if (!id) { toast('ID dokumen hilang'); return; }
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
    closeModal(document.getElementById('editModal'));
    await loadTodayList();
  } catch (err) {
    console.error('saveEdit err', err);
    toast('Gagal simpan. Semak konsol.');
  }
});

/* ---------- page switching ---------- */
function showPage(key){
  if (key === 'summary') {
    document.getElementById('pageSummary').style.display = '';
    document.getElementById('pageCheckedIn').style.display = 'none';
    document.getElementById('pageParking').style.display = 'none';
    navSummary.classList.add('active');
    navCheckedIn.classList.remove('active');
    if (navParking) navParking.classList.remove('active');
  } else if (key === 'checkedin') {
    document.getElementById('pageSummary').style.display = 'none';
    document.getElementById('pageCheckedIn').style.display = '';
    document.getElementById('pageParking').style.display = 'none';
    navSummary.classList.remove('active');
    navCheckedIn.classList.add('active');
    if (navParking) navParking.classList.remove('active');
  }
  // KPIs are only relevant for the registration summary view
  try { kpiWrap.style.display = (key === 'summary') ? '' : 'none'; } catch(e) { /* ignore if missing */ }
  // show filterDate only on summary
  try {
    const lbl = document.querySelector('label[for="filterDate"]');
    if (lbl) lbl.style.display = (key === 'summary' ? '' : 'none');
    if (filterDate) filterDate.style.display = (key === 'summary' ? '' : 'none');
  } catch(e) {}
}

/* initialize filterDate with today if empty */
if (!filterDate.value) filterDate.value = isoDateString(new Date());
document.addEventListener('DOMContentLoaded', ()=>{ /* ready */ });

/* ---------- Parking report module (patched) ---------- */
(function initParkingModule(){
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

  const masukSlots = Array.from({length:19}, (_,i)=> String(i+1).padStart(2,'0')); // 01..19
  const luarSlots = Array.from({length:19}, (_,i)=> String(40 + i)); // 40..58

  // in-memory cache: { slotId: { vehicle, unit, eta, etd, docId } }
  let slotCache = {};

  function setParkingDate(dateStr){
    const d = dateStr ? new Date(dateStr) : new Date();
    parkingDateLabel.textContent = formatDateOnly(d);
  }

  // deterministic doc id helper
  function parkingDocIdFor(dateStr, slotId){
    const safeDate = dateStr || isoDateString(new Date());
    return `parking-${safeDate}-${slotId}`;
  }

  // load parking for date
  async function loadParkingForDate(dateStr){
    console.info('[parking] loadParkingForDate', dateStr);
    try {
      slotCache = {};
      const col = collection(window.__FIRESTORE, 'parkingSlots');
      const q = query(col, where('date', '==', dateStr), orderBy('slot','asc'));
      const snap = await getDocs(q);
      snap.forEach(d => {
        const data = d.data();
        const slotId = data.slot || '';
        slotCache[slotId] = Object.assign({}, data, { docId: d.id });
      });
      renderAllSlots();
    } catch (err) {
      console.error('[parking] loadParkingForDate err', err);
      toast('Gagal muat data parkir. Semak konsol.');
    }
  }

  // render single slot row
  function renderSlotRow(slotId, container){
    // console.debug to help trace rendering
    //console.debug('[parking] renderSlotRow', slotId);
    const data = slotCache[slotId] || {};
    const div = document.createElement('div');
    div.className = 'parking-slot' + (data.vehicle ? ' filled' : '');
    div.dataset.slot = slotId;
    div.innerHTML = `
      <div class="meta">
        <div class="slot-num">${escapeHtml(slotId)}</div>
        <div class="slot-info">
          <div class="small">${data.vehicle ? escapeHtml(data.vehicle) : '<span class="parking-empty">Kosong</span>'}</div>
          <div class="small">${data.unit ? escapeHtml(data.unit) : ''}${data.eta ? ' • '+escapeHtml(data.eta) : ''}${data.etd ? ' • '+escapeHtml(data.etd) : ''}</div>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-edit" data-slot="${escapeHtml(slotId)}">Edit</button>
      </div>
    `;
    const btn = div.querySelector('.btn-edit');
    btn.addEventListener('click', ()=> openSlotModal(slotId));
    container.appendChild(div);
  }

  // render all slots (defensive: make sure containers exist)
  function renderAllSlots(){
    try {
      if (!parkingMasuk || !parkingLuar) {
        console.warn('[parking] container missing', {parkingMasuk: !!parkingMasuk, parkingLuar: !!parkingLuar});
        return;
      }
      parkingMasuk.innerHTML = '';
      parkingLuar.innerHTML = '';
      masukSlots.forEach(s => renderSlotRow(s, parkingMasuk));
      luarSlots.forEach(s => renderSlotRow(s, parkingLuar));

      // also render compact lot list for quick overview
      try { renderParkingLotList(); } catch(e) { /* ignore if not present */ }
    } catch (err) {
      console.error('[parking] renderAllSlots err', err);
    }
  }

  // open modal for slot
  function openSlotModal(slotId){
    const data = slotCache[slotId] || {};
    slotNumberEl.value = slotId;
    slotVehicleEl.value = data.vehicle || '';
    slotUnitEl.value = data.unit || '';
    slotETAEl.value = data.eta || '';
    slotETDEl.value = data.etd || '';
    slotDocIdEl.value = data.docId || '';
    openModal(modal, '#slotVehicle');
  }

  // quick-edit by lot number control (inserts tiny control at top of parking page)
  try {
    const pageParkingEl = document.getElementById('pageParking');
    if (pageParkingEl) {
      // create a compact lot list container (top of page)
      const lotListWrap = document.createElement('div');
      lotListWrap.id = 'parkingLotListWrap';
      pageParkingEl.insertAdjacentElement('afterbegin', lotListWrap);
    }
  } catch (e) {
    console.warn('[parking] parking list container failed to create', e);
  }

  // render a compact list / grid view of all lots with status
  function renderParkingLotList(){
    try {
      const wrapper = document.getElementById('parkingLotListWrap');
      if (!wrapper) return;
      wrapper.innerHTML = '';

      const title = document.createElement('div');
      title.style.display = 'flex';
      title.style.justifyContent = 'space-between';
      title.style.alignItems = 'center';
      title.style.gap = '8px';
      title.innerHTML = `<div style="font-weight:700;margin-bottom:6px">Senarai Lot Parkir</div><div class="small muted">(Klik lot untuk edit)</div>`;
      wrapper.appendChild(title);

      const cols = document.createElement('div');
      cols.className = 'lot-columns';

      // left: Masuk
      const left = document.createElement('div');
      left.className = 'lot-column';
      left.innerHTML = `<div style="font-weight:700;margin-bottom:6px">Lot Parkir Pelawat — Bahagian Masuk</div>`;
      const leftGrid = document.createElement('div');
      leftGrid.className = 'lot-grid';
      masukSlots.forEach(slotId => {
        const data = slotCache[slotId] || {};
        const chip = document.createElement('button');
        chip.className = 'lot-chip' + (data.vehicle ? ' filled' : '');
        chip.type = 'button';
        chip.textContent = slotId + (data.vehicle ? ` • ${data.vehicle}` : ' • Kosong');
        chip.dataset.slot = slotId;
        chip.addEventListener('click', ()=> openSlotModal(slotId));
        leftGrid.appendChild(chip);
      });
      left.appendChild(leftGrid);

      // right: Luar
      const right = document.createElement('div');
      right.className = 'lot-column';
      right.innerHTML = `<div style="font-weight:700;margin-bottom:6px">Lot Parkir Pelawat — Bahagian Luar</div>`;
      const rightGrid = document.createElement('div');
      rightGrid.className = 'lot-grid';
      luarSlots.forEach(slotId => {
        const data = slotCache[slotId] || {};
        const chip = document.createElement('button');
        chip.className = 'lot-chip' + (data.vehicle ? ' filled' : '');
        chip.type = 'button';
        chip.textContent = slotId + (data.vehicle ? ` • ${data.vehicle}` : ' • Kosong');
        chip.dataset.slot = slotId;
        chip.addEventListener('click', ()=> openSlotModal(slotId));
        rightGrid.appendChild(chip);
      });
      right.appendChild(rightGrid);

      cols.appendChild(left);
      cols.appendChild(right);
      wrapper.appendChild(cols);
    } catch (err) {
      console.error('[parking] renderParkingLotList err', err);
    }
  }

  // save single slot (create or merge) using deterministic doc id
  async function saveSlot(slotId, payload, applyToResponses = false){
    try {
      const dateKey = filterDate.value || isoDateString(new Date());
      const docId = parkingDocIdFor(dateKey, slotId);
      const ref = doc(window.__FIRESTORE, 'parkingSlots', docId);
      await setDoc(ref, Object.assign({ slot: slotId, date: dateKey }, payload, { updatedAt: serverTimestamp() }), { merge: true });
      slotCache[slotId] = Object.assign(slotCache[slotId] || {}, payload, { docId });
      renderAllSlots();
      toast('Slot disimpan');
      // if user opted to apply the slot change to registration
      if (applyToResponses) {
        try {
          const dateKey = filterDate.value || isoDateString(new Date());
          const result = await applySlotToResponses(dateKey, slotId, payload);
          if (result && result.updated) toast(`Kemas kini pendaftaran: ${result.updated} rekod`);
          else if (result && result.matched === 0) toast('Tiada pendaftaran sepadan ditemui', false);
        } catch (err) {
          console.error('[parking] applySlotToResponses err', err);
          toast('Gagal kemaskini pendaftaran. Semak konsol.', false);
        }
      }
    } catch (err) {
      console.error('[parking] saveSlot err', err);
      toast('Gagal simpan slot. Semak konsol untuk butiran.');
    }
  }

  // clear single slot
  async function clearSlot(slotId){
    try {
      const dateKey = filterDate.value || isoDateString(new Date());
      const docId = parkingDocIdFor(dateKey, slotId);
      const ref = doc(window.__FIRESTORE, 'parkingSlots', docId);
      await setDoc(ref, { slot: slotId, date: dateKey, vehicle:'', unit:'', eta:'', etd:'', updatedAt: serverTimestamp() }, { merge: true });
      slotCache[slotId] = { vehicle:'', unit:'', eta:'', etd:'', docId };
      renderAllSlots();
      toast('Slot dikosongkan');
    } catch (err) {
      console.error('[parking] clearSlot err', err);
      toast('Gagal kosongkan slot. Semak konsol.');
    }
  }

  // save parking meta (PK name)
  async function saveParkingMeta(){
    try {
      const pkName = parkingPKName.value.trim();
      const dateKey = filterDate.value || isoDateString(new Date());
      const metaId = `meta-${dateKey}`;
      const ref = doc(window.__FIRESTORE, 'parkingMeta', metaId);
      await setDoc(ref, { date: dateKey, pkName, updatedAt: serverTimestamp() }, { merge: true });
      toast('Maklumat ringkasan disimpan');
    } catch (err) {
      console.error('[parking] saveParkingMeta err', err);
      toast('Gagal simpan ringkasan. Semak konsol.');
    }
  }

  // attach listeners for modal buttons
  if (saveSlotBtn) {
    saveSlotBtn.addEventListener('click', async () => {
      const slotId = slotNumberEl.value;
      const payload = {
        vehicle: slotVehicleEl.value.trim() || '',
        unit: slotUnitEl.value.trim() || '',
        eta: slotETAEl.value || '',
        etd: slotETDEl.value || ''
      };
      const applyToResponses = (document.getElementById('applyToRegistration') && document.getElementById('applyToRegistration').checked) || false;
      await saveSlot(slotId, payload, applyToResponses);
      closeModal(modal);
    });
  }
  if (clearSlotBtn) {
    clearSlotBtn.addEventListener('click', async () => {
      const slotId = slotNumberEl.value;
      await clearSlot(slotId);
      closeModal(modal);
    });
  }
  if (parkingSaveAll) {
    parkingSaveAll.addEventListener('click', async () => {
      await saveParkingMeta();
    });
  }

  // nav: activate parking page
  if (navParking) {
    navParking.addEventListener('click', ()=> {
      console.info('[navParking] clicked');
      document.getElementById('pageSummary').style.display = 'none';
      document.getElementById('pageCheckedIn').style.display = 'none';
      pageParking.style.display = '';

      navSummary.classList.remove('active');
      navCheckedIn.classList.remove('active');
      navParking.classList.add('active');

      // KPIs are only shown on 'Senarai pendaftaran'
      try { kpiWrap.style.display = 'none'; } catch(e) {}

      const ds = filterDate.value || isoDateString(new Date());
      // hide the top filter date input/label for parking view (we show calendar only)
      try { const lbl = document.querySelector('label[for="filterDate"]'); if (lbl) lbl.style.display = 'none'; if (filterDate) filterDate.style.display = 'none'; } catch(e) {}
      console.info('[navParking] loading parking for date', ds);
      setParkingDate(ds);
      // hide the old static parking card (clean the page for calendar + lot list)
      try {
        const staticCard = document.getElementById('pageParking').querySelector('.card.card-tight');
        if (staticCard) staticCard.style.display = 'none';
      } catch (e) { /* ignore */ }
      // load parking slots then render week calendar + summary
      loadParkingForDate(ds).then(()=>{
        try { console.info('[navParking] renderParkingWeekCalendar after load'); renderParkingWeekCalendar(ds); } catch(e){ console.warn('[navParking] calendar render failed', e); }
        if (typeof renderParkingLotSummary === 'function') { console.info('[navParking] scheduling renderParkingLotSummary'); setTimeout(()=>renderParkingLotSummary(ds), 100); }
      }).catch(err=>{ console.warn('[navParking] loadParkingForDate error', err); });
    });
  }

  // close modal handlers
  [closeParkingModal, cancelSlotBtn].forEach(b => b && b.addEventListener('click', ()=> { closeModal(modal); }));

  // expose loader for external calls (used when filterDate changes)
  window.loadParkingForDate = loadParkingForDate;

  // Apply slot update to matching responses for the same date (manual-confirmation flow)
  async function applySlotToResponses(dateKey, slotId, payload){
    if (!dateKey) return { matched: 0, updated: 0 };
    try {
      const from = new Date(dateKey + 'T00:00:00');
      const to = new Date(from); to.setDate(to.getDate()+1);

      const colRef = collection(window.__FIRESTORE, 'responses');
      const q = query(colRef, where('eta','>=', Timestamp.fromDate(from)), where('eta','<', Timestamp.fromDate(to)), orderBy('eta','asc'));
      const snap = await getDocs(q);
      const rows = [];
      snap.forEach(d => rows.push({ id: d.id, ...d.data() }));

      // find matches — match by vehicleNo or vehicleNumbers array or hostUnit
      const needle = String(payload.vehicle || '').trim().toLowerCase();
      const matches = rows.filter(r => {
        try{
          if (!needle) return false;
          if (r.vehicleNo && String(r.vehicleNo).trim().toLowerCase() === needle) return true;
          if (Array.isArray(r.vehicleNumbers) && r.vehicleNumbers.map(x=>String(x).toLowerCase()).includes(needle)) return true;
          if (r.hostUnit && String(r.hostUnit).trim().toLowerCase() === String(payload.unit || '').trim().toLowerCase()) return true;
          return false;
        } catch(e){ return false; }
      });

      if (!matches.length) {
        return { matched: 0, updated: 0 };
      }

      // if multiple matches, confirm with the user before updating all
      if (matches.length > 1) {
        const ok = confirm(`Ditemui ${matches.length} pendaftaran yang sepadan. Kemaskini semua?`);
        if (!ok) return { matched: matches.length, updated: 0 };
      }

      // perform batch update (vehicleNo, hostUnit and parkingLot)
      const batch = writeBatch(window.__FIRESTORE);
      matches.forEach(m => {
        const ref = doc(window.__FIRESTORE, 'responses', m.id);
        const upd = { updatedAt: serverTimestamp() };
        if (payload.vehicle) upd.vehicleNo = payload.vehicle;
        if (payload.unit) upd.hostUnit = payload.unit;
        // also set parkingLot to the slot id so registration stays in sync
        upd.parkingLot = slotId;
        batch.update(ref, upd);
      });
      await batch.commit();

      // write audit entry
      try{
        const auditCol = collection(window.__FIRESTORE, 'audit');
        await addDoc(auditCol, { ts: serverTimestamp(), userId: window.__AUTH && window.__AUTH.currentUser ? (window.__AUTH.currentUser.uid || window.__AUTH.currentUser.email) : 'unknown', action: 'apply_slot_to_responses', slotId, date: dateKey, matched: matches.length });
      } catch(e){ console.warn('audit write failed', e); }

      return { matched: matches.length, updated: matches.length };
    } catch(err){ console.error('[parking] applySlotToResponses err', err); throw err; }
  }

  /* ---------- Parking report summary (only include category 'Pelawat') ---------- */
  async function renderParkingLotSummary(dateStr){
    console.info('[parking] renderParkingLotSummary called', dateStr);
    try {
      const ds = dateStr || filterDate.value || isoDateString(new Date());
      const d = ds.split('-');
      if (d.length !== 3) return;
      const from = new Date(parseInt(d[0],10), parseInt(d[1],10)-1, parseInt(d[2],10), 0,0,0,0);
      const to = new Date(from); to.setDate(to.getDate()+1);

      // fetch responses for that date
      const colRef = collection(window.__FIRESTORE, 'responses');
      const q = query(colRef, where('eta','>=', Timestamp.fromDate(from)), where('eta','<', Timestamp.fromDate(to)), orderBy('eta','asc'));
      const snap = await getDocs(q);
      const rows = [];
      snap.forEach(d => rows.push({ id: d.id, ...d.data() }));

      // filter only Pelawat category
      const pelawatRows = rows.filter(r => determineCategory(r) === 'Pelawat');

      const total = pelawatRows.length;
      const assigned = pelawatRows.filter(r => r.parkingLot && String(r.parkingLot).trim()).length;
      const unassigned = total - assigned;
      console.info('[parking] pelawatRows', total, 'assigned', assigned, 'unassigned', unassigned);

      // build small summary card
      const page = document.getElementById('pageParking');
      if (!page) return;

      let existing = document.getElementById('parkingReportSummary');
      const wrap = existing || document.createElement('div');
      wrap.id = 'parkingReportSummary';
      wrap.className = 'card small';
      wrap.style.marginBottom = '12px';
      let listHtml = '';
      if (pelawatRows.length) {
        // show a tiny list of unassigned items for quick action
        const sample = pelawatRows.slice(0,6);
        listHtml = '<div style="margin-top:8px">';
        sample.forEach(r => {
          const phone = r.visitorPhone ? escapeHtml(r.visitorPhone) : '-';
          const slot = r.parkingLot ? `<strong>Lot ${escapeHtml(r.parkingLot)}</strong>` : '<em>Belum assigned</em>';
          listHtml += `<div class="small">${escapeHtml(r.visitorName || '-') } — ${escapeHtml(r.hostUnit || '-') } • ${phone} • ${slot}</div>`;
        });
        if (pelawatRows.length > sample.length) listHtml += `<div class="small muted" style="margin-top:6px">+${pelawatRows.length - sample.length} lagi...</div>`;
        listHtml += '</div>';
      } else {
        listHtml = '<div class="small">Tiada rekod pelawat pada tarikh ini.</div>';
      }

      wrap.innerHTML = `
        <div style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap">
          <div style="display:flex;gap:10px;align-items:center">
            <div style="font-weight:700">Laporan Parkir — Pelawat</div>
            <div class="small muted">(${formatDateOnly(from)})</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <div class="chip chip-pending">Jumlah: ${total}</div>
            <div class="chip chip-in">Assigned: ${assigned}</div>
            <div class="chip chip-out">Unassigned: ${unassigned}</div>
          </div>
        </div>
        ${listHtml}
      `;

      if (!existing) {
        const header = page.querySelector('.card.card-tight');
        if (header) header.parentNode.insertBefore(wrap, header);
        else page.insertAdjacentElement('afterbegin', wrap);
      }

      // render the weekly parking calendar view (fresh view for Pelawat)
      try { renderParkingWeekCalendar(dateStr || ds); } catch(e){ console.warn('[parking] calendar render failed', e); }
    } catch (err) {
      console.error('[parking] renderParkingLotSummary err', err);
    }
  }

  /* ---------- Weekly calendar view (Pelawat-only) ---------- */
  function dayStart(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }
  function dayKey(d){ const x = dayStart(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; }

  function weekRangeFromDate(dateStr){
    const d = dateStr ? new Date(dateStr) : new Date();
    // find Monday of week (or Sunday start if you prefer). We'll use Monday.
    const day = d.getDay(); // 0=Sun,1=Mon
    const diff = (day === 0 ? -6 : 1) - day; // how many days to subtract to get Monday
    const monday = new Date(d); monday.setDate(d.getDate() + diff); monday.setHours(0,0,0,0);
    const days = [];
    for (let i=0;i<7;i++){ const dd = new Date(monday); dd.setDate(monday.getDate()+i); days.push(dd); }
    return { start: days[0], days };
  }

  async function renderParkingWeekCalendar(dateStr){
    console.info('[parking] renderParkingWeekCalendar called', dateStr);
    try{
      const page = document.getElementById('pageParking');
      if (!page) return;

      const ds = dateStr || filterDate.value || isoDateString(new Date());
      const wr = weekRangeFromDate(ds);
      const from = new Date(wr.start); const to = new Date(wr.start); to.setDate(to.getDate()+7);

      // Query responses for the week
      const col = collection(window.__FIRESTORE, 'responses');
      const q = query(col, where('eta','>=', Timestamp.fromDate(from)), where('eta','<', Timestamp.fromDate(to)), orderBy('eta','asc'));
      const snap = await getDocs(q);
      const rows = []; snap.forEach(d => rows.push({ id: d.id, ...d.data() }));

      // Only Pelawat category
      const pelawat = rows.filter(r => determineCategory(r) === 'Pelawat');

      // Build per-plate counts across the week (count of distinct days a plate appears on)
      // We'll use this to mark plates that appear on multiple days
      const plateDays = {}; // plate -> Set of dayKeys
      pelawat.forEach(r => {
        // gather all plates for this registration
        const plates = new Set();
        if (r.vehicleNo) plates.add(String(r.vehicleNo).trim());
        if (Array.isArray(r.vehicleNumbers)) r.vehicleNumbers.forEach(x => plates.add(String(x).trim()));
        if (typeof r.vehicleNumbers === 'string' && !r.vehicleNo) plates.add(String(r.vehicleNumbers).trim());
        // if none, skip
        plates.forEach(pl => {
          if (!pl) return;
          const key = dayKey(r.eta && r.eta.toDate ? r.eta.toDate() : (r.eta ? new Date(r.eta) : new Date()));
          plateDays[pl] = plateDays[pl] || new Set();
          plateDays[pl].add(key);
        });
      });

      // convert to counts map for quick lookup
      const plateCounts = {};
      Object.keys(plateDays).forEach(p => { plateCounts[p] = plateDays[p].size; });

      // build calendar container
      let calWrap = document.getElementById('parkingWeekCalendar');
      if (!calWrap){ calWrap = document.createElement('div'); calWrap.id = 'parkingWeekCalendar'; calWrap.className = 'card'; calWrap.style.marginTop = '12px'; }
      calWrap.innerHTML = '';

      // helper: stable color mapping per plate (simple hash -> palette)
      const dupPalette = ['#FB7185','#60A5FA','#F59E0B','#34D399','#A78BFA','#F97316','#60A5FA','#FCA5A5','#86EFAC'];
      function colorForPlate(plate) {
        if (!plate) return dupPalette[0];
        let h = 0; for (let i=0;i<plate.length;i++) h = ((h<<5)-h) + plate.charCodeAt(i), h |= 0;
        const idx = Math.abs(h) % dupPalette.length; return dupPalette[idx];
      }

      const header = document.createElement('div');
      header.style.display = 'flex'; header.style.justifyContent='space-between'; header.style.alignItems='center'; header.style.gap='8px';
      // left: title + prev/next controls, right: week range
      const left = document.createElement('div'); left.style.display='flex'; left.style.alignItems='center'; left.style.gap='8px';
      const title = document.createElement('div'); title.style.fontWeight = '700'; title.textContent = 'Kalendar Mingguan Parkir — Pelawat';
      const navWrap = document.createElement('div'); navWrap.className = 'pw-week-nav';
      const prevBtn = document.createElement('button'); prevBtn.type='button'; prevBtn.className='btn-ghost'; prevBtn.textContent = '‹'; prevBtn.title = 'Minggu sebelumnya';
      const nextBtn = document.createElement('button'); nextBtn.type='button'; nextBtn.className='btn-ghost'; nextBtn.textContent = '›'; nextBtn.title = 'Minggu seterusnya';
      navWrap.appendChild(prevBtn); navWrap.appendChild(nextBtn);
      left.appendChild(title); left.appendChild(navWrap);
      const right = document.createElement('div'); right.className = 'small muted'; right.textContent = `Minggu bermula ${formatDateOnly(wr.days[0])} — ${formatDateOnly(wr.days[6])}`;
      header.appendChild(left); header.appendChild(right);
      // wire navigation
      prevBtn.addEventListener('click', ()=>{
        try{
          const base = new Date(wr.start); base.setDate(base.getDate() - 7);
          renderParkingWeekCalendar(isoDateString(base));
        } catch(e){ console.warn('[parking] prev week failed', e); }
      });
      nextBtn.addEventListener('click', ()=>{
        try{
          const base = new Date(wr.start); base.setDate(base.getDate() + 7);
          renderParkingWeekCalendar(isoDateString(base));
        } catch(e){ console.warn('[parking] next week failed', e); }
      });
      calWrap.appendChild(header);

      // Render a simplified 2-column weekly table (Date | Unit + Vehicle) for Pelawat only
      const dayKeys = wr.days.map(dayKey);

      const table = document.createElement('table');
      table.className = 'parking-week-table';
      table.style.width = '100%';
      // No table column headers (we display combined cards per date)
      const tbody = document.createElement('tbody');
      // Build rows per day (2-column: Date | Vehicle + Unit)
      dayKeys.forEach(k => {
        const theDate = new Date(k);
        const tr = document.createElement('tr');
        const tdDate = document.createElement('td'); tdDate.className = 'pw-date-cell';
        const tdItems = document.createElement('td'); tdItems.className = 'pw-items-cell';
        // find rows where ETA..ETD includes this date
        const items = pelawat.filter(r => {
          try{
            const eta = r.eta && r.eta.toDate ? r.eta.toDate() : (r.eta ? new Date(r.eta) : null);
            const etd = r.etd && r.etd.toDate ? r.etd.toDate() : (r.etd ? new Date(r.etd) : null);
            if (!eta) return false;
            const s = dayStart(eta); const e = etd ? dayStart(etd) : s;
            const dd = dayStart(k);
            return s.getTime() <= dd.getTime() && dd.getTime() <= e.getTime();
          } catch(e){ return false; }
        });

        // header with date information (left column)
        const headerEl = document.createElement('div'); headerEl.className = 'pw-day-header';
        const dayLong = theDate.toLocaleDateString(undefined, { weekday: 'long' });
        const malayDays = ['Ahad','Isnin','Selasa','Rabu','Khamis','Jumaat','Sabtu'];
        const malay = malayDays[theDate.getDay()];
        const dd = String(theDate.getDate()).padStart(2,'0');
        const mm = String(theDate.getMonth()+1).padStart(2,'0');
        const yy = theDate.getFullYear();
        headerEl.innerHTML = `<div style="font-weight:700">${dayLong} (${malay})</div><div class="small">${dd}/${mm}/${yy}</div>`;
        tdDate.appendChild(headerEl);

        // total vehicle count for this day (account for arrays / strings)
        const totalVehicles = items.reduce((acc, rr) => {
          let cnt = 0;
          if (rr.vehicleNo) cnt++;
          if (Array.isArray(rr.vehicleNumbers)) cnt += rr.vehicleNumbers.length;
          else if (typeof rr.vehicleNumbers === 'string' && !rr.vehicleNo) cnt++;
          return acc + cnt;
        }, 0);

        if (!items.length) {
          const empty = document.createElement('div'); empty.className = 'small muted'; empty.textContent = 'Tiada pelawat Checked In'; tdItems.appendChild(empty);
        } else {
          const list = document.createElement('div'); list.className = 'pw-vehicle-list';
          // if more than 2 vehicle items, use a 2-column grid
          if (totalVehicles > 2) list.classList.add('multi-cols');
          // show all vehicle numbers (no limit); support vehicleNo and vehicleNumbers (array or string)
          // Collect vehicle+unit entries and dedupe exact pairs per day
          const pairs = [];
          items.forEach(r => {
            const rawNums = [];
            if (r.vehicleNo) rawNums.push(String(r.vehicleNo));
            if (Array.isArray(r.vehicleNumbers)) rawNums.push(...r.vehicleNumbers.map(x => String(x)));
            if (typeof r.vehicleNumbers === 'string' && !r.vehicleNo) rawNums.push(String(r.vehicleNumbers));
            rawNums.forEach(num => {
              const plate = String(num || '').trim();
              if (!plate) return;
              const unit = r.hostUnit ? String(r.hostUnit).trim() : '';
              pairs.push({ plate, unit, id: r.id });
            });
          });

          // dedupe by plate + unit (so same plate at different units is kept, exact duplicates removed)
          const unique = [];
          const seen = new Set();
          pairs.forEach(p => {
            const key = `${p.plate}||${p.unit}`;
            if (!seen.has(key)) { seen.add(key); unique.push(p); }
          });

          unique.forEach(r => {
            const item = document.createElement('div'); item.className = 'pw-vehicle-item';
            const unit = r.unit ? ` — ${r.unit}` : '';
            // if plate appears on more than one day this week, mark it
            const count = plateCounts[r.plate] || 0;
            item.textContent = `${r.plate}${unit}`;
            if (count > 1) {
              item.classList.add('pw-vehicle-duplicate');
              item.setAttribute('data-dup-count', String(count));
              // store plate on element for later color mapping
              item.setAttribute('data-plate', r.plate);
              // assign consistent color for this plate
              const pcolor = colorForPlate(r.plate);
              try { item.style.setProperty('--dup-color', pcolor); } catch(e) {}
              // add small icon for duplication visibility
              const icon = document.createElement('span'); icon.className = 'dup-icon'; icon.textContent = '🔁'; icon.setAttribute('aria-hidden','true');
              item.insertBefore(icon, item.firstChild);
            }
            // attempt to open matching response id if available
            item.addEventListener('click', ()=>{ try{ const id = r.id; if (id) openEditModalFor && typeof openEditModalFor === 'function' ? openEditModalFor(id) : toast('Buka butiran pendaftaran (fungsi tidak tersedia)', false); } catch(e) { console.warn(e); } });
            list.appendChild(item);
          });
          tdItems.appendChild(list);
        }
        // append two columns
        tr.appendChild(tdDate);
        tr.appendChild(tdItems);
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      calWrap.appendChild(table);

      // insert calendar after summary or top of page
      const existingCal = document.getElementById('parkingWeekCalendar');
      if (!existingCal) {
        const header = page.querySelector('.card.card-tight');
        if (header) header.parentNode.insertBefore(calWrap, header.nextSibling);
        else page.appendChild(calWrap);
      }

    } catch(err){ console.error('[parking] renderParkingWeekCalendar err', err); }
  }

  /* ---------- Assign Lot transaction helpers ---------- */

  // helper: get yyyy-mm-dd from Timestamp or Date/string
  function dateKeyFromEta(eta) {
    if (!eta) return null;
    let d;
    if (eta.toDate) d = eta.toDate();
    else if (typeof eta === 'string') d = new Date(eta);
    else d = new Date(eta);
    if (isNaN(d.getTime())) return null;
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  /**
   * Assign lot atomically using Firestore transaction.
   * Ensures no two responses get same lot for same date.
   */
  async function assignLotTransaction(responseId, lotId) {
    if (!responseId || !lotId) throw new Error('responseId dan lotId diperlukan');

    const responsesCol = collection(window.__FIRESTORE, 'responses');
    const respRef = doc(window.__FIRESTORE, 'responses', responseId);
    const auditCol = collection(window.__FIRESTORE, 'audit');

    try {
      const auditPayload = await runTransaction(window.__FIRESTORE, async (tx) => {
        // read response
        const respSnap = await tx.get(respRef);
        if (!respSnap.exists()) throw new Error('Rekod pendaftaran tidak ditemui');

        const respData = respSnap.data();
        const eta = respData.eta;
        const dateKey = dateKeyFromEta(eta);
        if (!dateKey) throw new Error('Tarikh masuk tidak sah pada rekod ini');

        // build range for that date
        const from = new Date(dateKey + 'T00:00:00');
        const to = new Date(from); to.setDate(to.getDate() + 1);

        // query other responses for same date with same lot
        const colRef = collection(window.__FIRESTORE, 'responses');
        const q = query(
          colRef,
          where('eta', '>=', Timestamp.fromDate(from)),
          where('eta', '<', Timestamp.fromDate(to)),
          where('parkingLot', '==', lotId)
        );

        const qSnap = await getDocs(q);
        const conflict = qSnap.docs.some(d => d.id !== responseId);
        if (conflict) throw new Error(`Lot ${lotId} sudah diambil untuk tarikh ${dateKey}`);

        // perform update
        const assignedBy = window.__AUTH && window.__AUTH.currentUser ? (window.__AUTH.currentUser.uid || window.__AUTH.currentUser.email) : 'unknown';
        tx.update(respRef, {
          parkingLot: lotId,
          assignedBy,
          assignedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // prepare audit payload to write after tx
        return {
          ts: serverTimestamp(),
          userId: assignedBy,
          rowId: responseId,
          action: 'assign_parking_lot',
          details: {
            lot: lotId,
            eta: dateKey,
            hostUnit: respData.hostUnit || null,
            visitorName: respData.visitorName || null
          }
        };
      });

      // write audit after successful transaction
      try {
        await addDoc(auditCol, auditPayload);
      } catch (ae) {
        console.error('Gagal tulis audit selepas assign', ae);
      }
    } catch (err) {
      console.error('[assignLot] err', err);
      throw err;
    }
  }

  // UI handler wrapper
  async function onAssignButtonClicked(responseId, selectedLotId) {
    try {
      // optional: disable UI
      await assignLotTransaction(responseId, selectedLotId);
      toast(`Lot ${selectedLotId} berjaya diassign`);
      await loadTodayList();
    } catch (err) {
      const msg = err && err.message ? err.message : 'Gagal assign lot';
      toast(`Gagal assign lot: ${msg}`);
    } finally {
      // optional: re-enable UI
    }
  }

  // expose assign function for UI usage
  window.assignLotTransaction = assignLotTransaction;
  window.onAssignButtonClicked = onAssignButtonClicked;

})();
