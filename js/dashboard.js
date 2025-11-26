// js/dashboard.js
// Pastikan firebase-init.js dimuat dahulu dan modul Firestore (v9) tersedia secara global:
// collection, getDocs, query, where, orderBy, doc, setDoc, updateDoc, Timestamp

// -----------------------------
// Helper utilities
// -----------------------------
function log(...args) { console.log('[dashboard]', ...args); }

function toast(msg) {
  // Gantikan dengan sistem toast anda jika ada
  console.info('[toast]', msg);
}

// ===== Helper: mark parking group as 'pindah' and update count =====
function markParkingGroupAsPindah(wrapperEl) {
  if (!wrapperEl) return;
  wrapperEl.classList.add('parking-group', 'pindah');
}

function setPindahCount(wrapperEl, count) {
  let countEl = wrapperEl.querySelector('.count') || wrapperEl.querySelector('#countPindah');
  if (!countEl) {
    countEl = document.createElement('span');
    countEl.className = 'count small muted';
    countEl.style.marginLeft = '8px';
    const left = wrapperEl.querySelector('div');
    if (left) left.appendChild(countEl);
  }
  countEl.textContent = `(${Number(count || 0)})`;
}

// -----------------------------
// Firestore helpers (assume modular SDK functions are globally available)
// -----------------------------
function getFirestoreInstance() {
  // prefer window.__FIRESTORE if your firebase-init sets it
  return window.__FIRESTORE || (window.firebase && window.firebase.firestore && window.firebase.firestore());
}

function getAuthInstance() {
  return window.__AUTH || (window.firebase && window.firebase.auth && window.firebase.auth());
}

// -----------------------------
// Slot cache & rendering
// -----------------------------
let slotCache = {}; // keyed by slot id or slot number
const slotsContainerSelector = '#parkingSlotsContainer'; // update jika berbeza

async function loadParkingForDate(dateStr) {
  try {
    log('loadParkingForDate', dateStr);
    slotCache = {};
    const db = getFirestoreInstance();
    if (!db) throw new Error('Firestore not initialized');

    const col = collection(db, 'parkingSlots');

    // 1) Query by date string (if docs saved with date string)
    try {
      const q1 = query(col, where('date', '==', dateStr), orderBy('slot', 'asc'));
      const snap1 = await getDocs(q1);
      snap1.forEach(d => {
        const data = d.data();
        const slotId = data.slot || d.id;
        slotCache[slotId] = Object.assign({}, data, { docId: d.id });
      });
    } catch (e) {
      log('query by date string failed (maybe no index or no date string)', e);
    }

    // 2) Query by eta Timestamp range (if docs saved with Timestamp)
    try {
      const from = new Date(dateStr + 'T00:00:00');
      const to = new Date(from);
      to.setDate(to.getDate() + 1);
      const q2 = query(col, where('eta', '>=', Timestamp.fromDate(from)), where('eta', '<', Timestamp.fromDate(to)));
      const snap2 = await getDocs(q2);
      snap2.forEach(d => {
        const data = d.data();
        const slotId = data.slot || d.id;
        if (!slotCache[slotId]) slotCache[slotId] = Object.assign({}, data, { docId: d.id });
      });
    } catch (e) {
      log('query by eta Timestamp failed (maybe no eta field)', e);
    }

    log('slotCache loaded', slotCache);
    renderAllSlots();
  } catch (err) {
    console.error('[parking] loadParkingForDate err', err);
    toast('Gagal muat data parkir. Semak konsol.');
  }
}

function clearSlotsContainer() {
  const container = document.querySelector(slotsContainerSelector);
  if (container) container.innerHTML = '';
}

function renderAllSlots() {
  const container = document.querySelector(slotsContainerSelector);
  if (!container) {
    log('No container found for slots:', slotsContainerSelector);
    return;
  }
  container.innerHTML = ''; // clear

  // If slotCache empty, show placeholder
  const keys = Object.keys(slotCache).sort((a,b) => {
    // try numeric sort if possible
    const na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  if (keys.length === 0) {
    container.innerHTML = '<div class="small muted">Tiada rekod lot untuk tarikh ini.</div>';
    return;
  }

  keys.forEach(k => {
    const data = slotCache[k];
    const row = buildSlotRow(k, data);
    container.appendChild(row);
  });
}

// Build a single slot/category row element
function buildSlotRow(slotId, data) {
  // wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'parking-group'; // base class; CSS will style

  // left content
  const left = document.createElement('div');
  left.style.fontWeight = '700';

  // badge text: use category if present, else slot label
  const badge = document.createElement('span');
  const categoryText = data.category || data.type || '';
  if (/pindah/i.test(categoryText)) {
    badge.className = 'cat-badge cat-pindah';
    badge.textContent = categoryText || 'Pindah barang';
  } else {
    // fallback badge
    badge.className = 'cat-badge';
    badge.textContent = categoryText || `Lot ${slotId}`;
  }

  left.appendChild(badge);

  // count element
  const countEl = document.createElement('span');
  countEl.className = 'small muted count';
  countEl.style.marginLeft = '8px';
  const countVal = data.count || (data.items && data.items.length) || 0;
  countEl.textContent = `(${countVal})`;
  left.appendChild(countEl);

  // right content (action)
  const right = document.createElement('div');
  const viewLink = document.createElement('a');
  viewLink.href = '#';
  viewLink.className = 'btn btn-ghost small';
  viewLink.textContent = 'Lihat';
  viewLink.addEventListener('click', (ev) => {
    ev.preventDefault();
    // implement filter or open modal
    log('View clicked for', slotId, data);
    // example: openSlotDetail(data)
  });
  right.appendChild(viewLink);

  wrapper.appendChild(left);
  wrapper.appendChild(right);

  // If category is Pindah, mark and set count
  if (categoryText && /pindah/i.test(categoryText)) {
    markParkingGroupAsPindah(wrapper);
    setPindahCount(wrapper, countVal);
  }

  return wrapper;
}

// -----------------------------
// Example: wire up date filter and initial load
// -----------------------------
function initDashboard() {
  // date input id expected: #filterDate
  const dateInput = document.getElementById('filterDate');
  const today = new Date();
  const isoDate = today.toISOString().slice(0,10); // YYYY-MM-DD
  if (dateInput) {
    dateInput.value = isoDate;
    dateInput.addEventListener('change', (e) => {
      loadParkingForDate(e.target.value);
    });
  }

  // initial load
  loadParkingForDate(dateInput ? dateInput.value : isoDate);

  // auth state debug (optional)
  const auth = getAuthInstance();
  if (auth && auth.onAuthStateChanged) {
    auth.onAuthStateChanged(user => {
      log('auth state changed', !!user, user && user.email);
    });
  }
}

// -----------------------------
// Expose some functions for console debugging
// -----------------------------
window.__dashboard = {
  loadParkingForDate,
  renderAllSlots,
  markParkingGroupAsPindah,
  setPindahCount,
  buildSlotRow,
};

// Auto init when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  try {
    initDashboard();
  } catch (e) {
    console.error('dashboard init error', e);
  }
});
