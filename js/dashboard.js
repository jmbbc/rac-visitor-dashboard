// js/dashboard.js (ganti keseluruhan fail sedia ada)
// Pastikan js/firebase-init.js dimuatkan dahulu

import {
  collection, query, where, getDocs, orderBy,
  doc, updateDoc, serverTimestamp, addDoc,
  Timestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

/* ---------- util ---------- */
function showLoginMsg(el, m, ok=true){ el.textContent = m; el.style.color = ok ? 'green' : 'red'; }
function formatDateOnly(ts){
  if (!ts) return '-';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/* ---------- DOM elements ---------- */
const loginBox = document.getElementById('loginBox');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginMsg = document.getElementById('loginMsg');
const dashboardArea = document.getElementById('dashboardArea');
const who = document.getElementById('who');
const listArea = document.getElementById('listArea');
const reloadBtn = document.getElementById('reloadBtn');

// new controls for overlap checking
const overlapWrap = document.createElement('div');
overlapWrap.className = 'card small';
overlapWrap.style.margin = '12px 0';
overlapWrap.innerHTML = `
  <div style="display:flex;gap:8px;align-items:center">
    <label style="font-weight:700">Pilih tarikh</label>
    <input id="overlapDate" type="date" />
    <button id="checkOverlapBtn" class="btn btn-ghost">Semak Pertindihan Kenderaan</button>
    <button id="clearOverlapBtn" class="btn btn-ghost">Kosongkan</button>
  </div>
  <div id="overlapResult" style="margin-top:8px"></div>
`;

// insert overlap controls into dashboard area after header (will be appended later)
let overlapDateEl, checkOverlapBtn, clearOverlapBtn, overlapResultEl;

/* ---------- auth & init ---------- */
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

logoutBtn.addEventListener('click', async ()=>{
  await signOut(window.__AUTH);
});

onAuthStateChanged(window.__AUTH, user => {
  if (user) {
    loginBox.style.display = 'none';
    dashboardArea.style.display = 'block';
    who.textContent = user.email || user.uid;
    logoutBtn.style.display = 'inline-block';
    // append overlap controls once
    if (!document.getElementById('overlapDate')) {
      dashboardArea.insertBefore(overlapWrap, listArea);
      overlapDateEl = document.getElementById('overlapDate');
      checkOverlapBtn = document.getElementById('checkOverlapBtn');
      clearOverlapBtn = document.getElementById('clearOverlapBtn');
      overlapResultEl = document.getElementById('overlapResult');
      checkOverlapBtn.addEventListener('click', ()=> checkOverlapsAndRender());
      clearOverlapBtn.addEventListener('click', ()=> { overlapDateEl.value=''; overlapResultEl.innerHTML=''; loadList(); });
    }
    loadList();
  } else {
    loginBox.style.display = 'block';
    dashboardArea.style.display = 'none';
    logoutBtn.style.display = 'none';
  }
});

/* ---------- fetch & render ---------- */
async function loadList(dateRangeQuery=null){
  listArea.innerHTML = '<div class="small">Memuat...</div>';
  try {
    const col = collection(window.__FIRESTORE, 'responses');
    let q;
    if (dateRangeQuery && dateRangeQuery.from && dateRangeQuery.to) {
      // query for ETA range [from, to)
      q = query(col, where('eta', '>=', Timestamp.fromDate(dateRangeQuery.from)), where('eta', '<', Timestamp.fromDate(dateRangeQuery.to)), orderBy('eta', 'desc'));
    } else {
      // default: last 200 entries
      q = query(col, orderBy('createdAt', 'desc'));
    }
    const snap = await getDocs(q);
    const rows = [];
    snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
    renderList(rows);
  } catch (err) {
    console.error('loadList err', err);
    listArea.innerHTML = '<div class="small">Gagal muat. Semak konsol.</div>';
  }
}

function renderList(rows, conflictMap=new Map()){
  // conflictMap: Map<vehicleValue, Set<docId>>
  if (!rows.length) return listArea.innerHTML = '<div class="small">Tiada rekod</div>';
  const table = document.createElement('table');
  table.className = 'table';
  table.innerHTML = `<thead><tr><th>Nama</th><th>Unit / Tuan Rumah</th><th>Kategori</th><th>ETA</th><th>ETD</th><th>Kenderaan</th><th>Status</th><th>Aksi</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  rows.forEach(r => {
    // compute displayed vehicle string and whether this row is in any conflict
    let vehicleDisplay = '';
    if (Array.isArray(r.vehicleNumbers) && r.vehicleNumbers.length) {
      vehicleDisplay = r.vehicleNumbers.join(', ');
    } else if (r.vehicleNo) {
      vehicleDisplay = r.vehicleNo;
    } else {
      vehicleDisplay = '-';
    }
    // detect if this row involved in any conflict using conflictMap
    let isConflictRow = false;
    for (const [veh, ids] of conflictMap.entries()) {
      if (ids.has(r.id)) { isConflictRow = true; break; }
    }

    const statusClass = r.status === 'Checked In' ? 'pill-in' : (r.status === 'Checked Out' ? 'pill-out' : 'pill-pending');
    const tr = document.createElement('tr');
    if (isConflictRow) tr.classList.add('conflict');
    tr.innerHTML = `
      <td>${r.visitorName || r.name || ''}${r.note ? '<div class="small">'+ (r.note || '') +'</div>' : ''}</td>
      <td>${r.hostUnit || ''}<div class="small">${r.hostName || ''} ${r.hostPhone ? ' • ' + r.hostPhone : ''}</div></td>
      <td>${r.category || ''}</td>
      <td>${formatDateOnly(r.eta)}</td>
      <td>${formatDateOnly(r.etd)}</td>
      <td>${vehicleDisplay}</td>
      <td><span class="status-pill ${statusClass}">${r.status || 'Pending'}</span></td>
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
  listArea.innerHTML = '';
  listArea.appendChild(table);

  // attach handlers for check in/out
  listArea.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
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
    // reload list (maintain previous date filter if any)
    loadList();
  } catch (err) {
    console.error('update err', err);
    alert('Gagal kemaskini status. Semak konsol.');
  }
}

/* ---------- overlap detection ---------- */
// helper: build date range [date, date+1day)
function buildDateRangeFromInput(dateStr){
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0],10);
  const m = parseInt(parts[1],10)-1;
  const d = parseInt(parts[2],10);
  const from = new Date(y,m,d,0,0,0,0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

// main routine: query entries for chosen date, find vehicle numbers that repeat, render results
async function checkOverlapsAndRender(){
  const dateStr = document.getElementById('overlapDate').value;
  const resultEl = overlapResultEl;
  resultEl.innerHTML = '';
  if (!dateStr) { resultEl.innerHTML = '<div class="small">Sila pilih tarikh untuk semakan.</div>'; return; }
  const range = buildDateRangeFromInput(dateStr);
  if (!range) { resultEl.innerHTML = '<div class="small">Tarikh tidak sah.</div>'; return; }

  resultEl.innerHTML = '<div class="small">Mencari rekod...</div>';

  try {
    // fetch records with eta in that date
    const col = collection(window.__FIRESTORE, 'responses');
    const q = query(col, where('eta', '>=', Timestamp.fromDate(range.from)), where('eta', '<', Timestamp.fromDate(range.to)), orderBy('eta', 'desc'));
    const snap = await getDocs(q);
    const rows = [];
    snap.forEach(d => rows.push({ id: d.id, ...d.data() }));

    // build map vehicleValue -> Set(docId)
    const map = new Map();
    rows.forEach(r => {
      // gather all vehicle strings for this row
      const vals = [];
      if (Array.isArray(r.vehicleNumbers) && r.vehicleNumbers.length) {
        r.vehicleNumbers.forEach(v => { if (v && v.trim()) vals.push(v.trim().toUpperCase()); });
      }
      if (r.vehicleNo) vals.push(String(r.vehicleNo).trim().toUpperCase());
      // deduplicate per row
      const uniq = [...new Set(vals)];
      uniq.forEach(v => {
        if (!map.has(v)) map.set(v, new Set());
        map.get(v).add(r.id);
      });
    });

    // find entries where Set size > 1 (conflict)
    const conflicts = [];
    for (const [veh, ids] of map.entries()) {
      if (veh && ids.size > 1) conflicts.push({ vehicle: veh, docIds: ids });
    }

    if (!conflicts.length) {
      resultEl.innerHTML = '<div class="msg">Tiada pertindihan nombor kenderaan pada tarikh ini.</div>';
      // still render list (no conflicts)
      const conflictMap = new Map(); // empty
      renderList(rows, conflictMap);
      return;
    }

    // render conflicts summary
    let html = '<div class="small" style="margin-bottom:8px">Ditemui pertindihan untuk nombor berikut:</div>';
    conflicts.forEach(c => {
      html += `<div style="margin-bottom:6px"><strong>${c.vehicle}</strong> — ${c.docIds.size} rekod</div>`;
    });
    html += '<div class="small" style="margin-top:8px">Di bawah: baris yang terlibat akan diserlah. Sila semak maklumat dan ambil tindakan.</div>';
    resultEl.innerHTML = html;

    // prepare conflictMap: vehicle -> Set(docId)
    const conflictMap = new Map();
    conflicts.forEach(c => conflictMap.set(c.vehicle, c.docIds));

    // render table with highlight
    renderList(rows, conflictMap);

    // also expand a detailed list of conflicts with clickable items to focus (optional)
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
    resultEl.appendChild(detailsWrap);

  } catch (err) {
    console.error('check overlap err', err);
    resultEl.innerHTML = '<div class="small">Ralat semasa semakan. Semak konsol.</div>';
  }
}

/* ---------- misc ---------- */
reloadBtn.addEventListener('click', ()=> loadList());

/* ---------- initial load ---------- */
loadList();
