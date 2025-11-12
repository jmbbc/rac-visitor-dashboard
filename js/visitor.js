// js/visitor.js (module) - complete, theme-aware, company disable logic, vehicle handling, Firestore submit
import {
  collection, addDoc, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/* ---------- utilities ---------- */
function waitForFirestore(timeout = 5000){
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check(){
      if (window.__FIRESTORE) return resolve(window.__FIRESTORE);
      if (Date.now() - start > timeout) return reject(new Error('Firestore not available'));
      setTimeout(check, 50);
    })();
  });
}

function toast(message, ok = true) {
  const el = document.createElement('div');
  el.className = `toast ${ok ? 'ok' : 'err'}`;
  el.textContent = message;
  document.body.appendChild(el);
  // small fade in/out via CSS class toggles (CSS already in page)
  setTimeout(()=> el.classList.add('fade'), 10);
  setTimeout(()=> el.remove(), 3300);
}

function showStatus(msg, ok=true){
  const statusEl = document.getElementById('statusMsg');
  if (!statusEl) return;
  statusEl.innerHTML = `<span class="${ok ? 'text-green-500' : 'text-red-500'}">${msg}</span>`;
}

function validatePhone(phone){
  if (!phone) return true;
  const p = phone.replace(/\s+/g,'').replace(/[^0-9+]/g,'');
  return p.length >= 7 && p.length <= 15;
}

function dateFromInputDateOnly(val){
  if (!val) return null;
  const parts = val.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0],10);
  const m = parseInt(parts[1],10)-1;
  const d = parseInt(parts[2],10);
  const dt = new Date(y,m,d,0,0,0,0);
  return isNaN(dt.getTime()) ? null : dt;
}

/* ---------- dynamic vehicle helpers ---------- */
function createVehicleRow(value=''){
  const wrapper = document.createElement('div');
  wrapper.className = 'vehicle-row';
  wrapper.style.display = 'flex';
  wrapper.style.gap = '8px';
  wrapper.style.alignItems = 'center';
  wrapper.style.marginTop = '6px';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'ABC1234';
  input.value = value;
  input.className = 'vehicle-input';
  input.style.flex = '1';
  input.style.padding = '8px';
  input.style.borderRadius = '8px';
  input.style.border = '1px solid var(--input-border, #e5e7eb)';
  input.style.background = 'var(--card, #fff)';
  input.style.color = 'var(--text, #111)';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'vehicle-remove';
  removeBtn.textContent = '−';
  removeBtn.title = 'Keluarkan baris';
  removeBtn.style.padding = '8px 10px';
  removeBtn.style.borderRadius = '8px';
  removeBtn.style.border = '1px solid var(--input-border, #e5e7eb)';
  removeBtn.style.background = 'transparent';
  removeBtn.style.cursor = 'pointer';
  removeBtn.addEventListener('click', () => wrapper.remove());

  wrapper.appendChild(input);
  wrapper.appendChild(removeBtn);
  return wrapper;
}

function getVehicleNumbersFromList(){
  const list = document.querySelectorAll('#vehicleList .vehicle-row input');
  const out = [];
  list.forEach(i => {
    const v = i.value.trim();
    if (v) out.push(v);
  });
  return out;
}

/* ---------- company field state helper ---------- */
const companyCategories = new Set(['Kontraktor','Penghantaran Barang','Pindah Rumah']);

function setCompanyFieldState(show) {
  const companyWrap = document.getElementById('companyWrap');
  const companyInput = document.getElementById('companyName');
  if (!companyWrap || !companyInput) return;
  if (show) {
    companyWrap.classList.remove('hidden');
    companyInput.required = true;
    companyInput.disabled = false;
    companyInput.removeAttribute('aria-hidden');
  } else {
    companyWrap.classList.add('hidden');
    companyInput.required = false;
    companyInput.disabled = true;
    companyInput.value = '';
    companyInput.setAttribute('aria-hidden','true');
  }
}

/* ---------- theme handling ---------- */
function applyTheme(theme){
  if (theme === 'light') {
    document.documentElement.classList.remove('dark');
    const tBtn = document.getElementById('themeToggle');
    if (tBtn) tBtn.textContent = 'Dark';
  } else {
    document.documentElement.classList.add('dark');
    const tBtn = document.getElementById('themeToggle');
    if (tBtn) tBtn.textContent = 'Light';
  }
  try { localStorage.setItem('visitorTheme', theme); } catch(e){}
}

/* ---------- main init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // theme init (run immediately so CSS variables apply before render)
  const savedTheme = (localStorage.getItem('visitorTheme') || 'dark');
  applyTheme(savedTheme);
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const cur = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  (async () => {
    try {
      await waitForFirestore();
    } catch (err) {
      console.error('Firestore init failed', err);
      showStatus('Initialisasi Firestore gagal. Sila hubungi pentadbir.', false);
      return;
    }

    // elements
    const form = document.getElementById('visitorForm');
    const clearBtn = document.getElementById('clearBtn');
    const categoryEl = document.getElementById('category');
    const stayOverEl = document.getElementById('stayOver');
    const etaEl = document.getElementById('eta');
    const etdEl = document.getElementById('etd');

    const companyWrap = document.getElementById('companyWrap');
    const companyInput = document.getElementById('companyName');

    const vehicleSingleWrap = document.getElementById('vehicleSingleWrap');
    const vehicleMultiWrap = document.getElementById('vehicleMultiWrap');
    const vehicleList = document.getElementById('vehicleList');
    const addVehicleBtn = document.getElementById('addVehicleBtn');

    if (!form) { console.error('visitorForm missing'); return; }

    // ensure initial UI state
    if (stayOverEl) stayOverEl.disabled = true;
    if (companyWrap && companyInput) {
      companyWrap.classList.add('hidden');
      companyInput.disabled = true;
      companyInput.setAttribute('aria-hidden','true');
    }
    if (vehicleMultiWrap) vehicleMultiWrap.classList.add('hidden');
    if (vehicleSingleWrap) vehicleSingleWrap.classList.remove('hidden');
    if (vehicleList) vehicleList.innerHTML = '';

    // Category change handler
    categoryEl?.addEventListener('change', (ev) => {
      const v = ev.target.value?.trim();

      // stayOver for Pelawat
      if (stayOverEl) {
        if (v === 'Pelawat') {
          stayOverEl.disabled = false;
          if (!stayOverEl.value) stayOverEl.value = 'No';
        } else {
          stayOverEl.value = 'No';
          stayOverEl.disabled = true;
        }
      }

      // companyName show/disable
      setCompanyFieldState(companyCategories.has(v));

      // vehicle switch
      if (v === 'Pelawat Khas') {
        vehicleSingleWrap?.classList.add('hidden');
        vehicleMultiWrap?.classList.remove('hidden');
        if (vehicleList && !vehicleList.querySelector('.vehicle-row')) {
          vehicleList.innerHTML = '';
          vehicleList.appendChild(createVehicleRow(''));
        }
      } else {
        vehicleSingleWrap?.classList.remove('hidden');
        vehicleMultiWrap?.classList.add('hidden');
        if (vehicleList) vehicleList.innerHTML = '';
      }
    });

    // in case addVehicleBtn exists (note: in our HTML earlier it may not exist; safe-check)
    addVehicleBtn?.addEventListener('click', () => {
      if (!vehicleList) return;
      vehicleList.appendChild(createVehicleRow(''));
    });

    // ETA -> ETD constraints
    etaEl?.addEventListener('change', () => {
      const etaVal = etaEl.value;
      if (!etaVal) {
        if (etdEl) { etdEl.value = ''; etdEl.min = ''; etdEl.max = ''; }
        return;
      }
      const etaDate = dateFromInputDateOnly(etaVal);
      if (!etaDate) return;
      const maxDate = new Date(etaDate); maxDate.setDate(maxDate.getDate() + 3);
      const toIso = d => d.toISOString().slice(0,10);
      if (etdEl) {
        etdEl.min = toIso(etaDate);
        etdEl.max = toIso(maxDate);
        if (etdEl.value) {
          const cur = dateFromInputDateOnly(etdEl.value);
          if (!cur || cur < etaDate || cur > maxDate) etdEl.value = '';
        }
      }
    });

    // initialize company/vehicle state based on current category (if form populated)
    const initCat = categoryEl?.value?.trim() || '';
    setCompanyFieldState(companyCategories.has(initCat));
    if (initCat === 'Pelawat Khas') {
      vehicleSingleWrap?.classList.add('hidden');
      vehicleMultiWrap?.classList.remove('hidden');
      if (vehicleList && !vehicleList.querySelector('.vehicle-row')) vehicleList.appendChild(createVehicleRow(''));
    } else {
      vehicleSingleWrap?.classList.remove('hidden');
      vehicleMultiWrap?.classList.add('hidden');
      if (vehicleList) vehicleList.innerHTML = '';
    }

    // submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      showStatus('Memproses...', true);

      // gather
      const hostUnit = document.getElementById('hostUnit')?.value.trim() || '';
      const hostName = document.getElementById('hostName')?.value.trim() || '';
      const hostPhone = document.getElementById('hostPhone')?.value.trim() || '';

      const category = categoryEl?.value || '';
      const entryDetails = document.getElementById('entryDetails')?.value.trim() || '';
      const companyName = document.getElementById('companyName')?.value.trim() || '';
      const visitorName = document.getElementById('visitorName')?.value.trim() || '';
      const visitorPhone = document.getElementById('visitorPhone')?.value.trim() || '';
      const stayOver = document.getElementById('stayOver')?.value || 'No';
      const etaVal = document.getElementById('eta')?.value || '';
      const etdVal = document.getElementById('etd')?.value || '';
      const vehicleType = document.getElementById('vehicleType')?.value || '';

      // validation
      if (!hostUnit || !hostName) { showStatus('Sila lengkapkan Butiran Penghuni (Unit & Nama).', false); toast('Sila lengkapkan Unit & Nama penghuni', false); return; }
      if (!category) { showStatus('Sila pilih Kategori.', false); toast('Sila pilih kategori', false); return; }
      if (companyCategories.has(category) && !companyName) { showStatus('Sila masukkan Nama syarikat.', false); toast('Sila masukkan Nama syarikat', false); return; }
      if (!visitorName) { showStatus('Sila masukkan Nama Pelawat.', false); toast('Sila masukkan Nama Pelawat', false); return; }
      if (!etaVal) { showStatus('Sila pilih Tarikh ETA.', false); toast('Sila pilih ETA', false); return; }
      if (!validatePhone(visitorPhone)) { showStatus('Nombor telefon pelawat tidak sah.', false); toast('Nombor telefon pelawat tidak sah', false); return; }
      if (hostPhone && !validatePhone(hostPhone)) { showStatus('Nombor telefon penghuni tidak sah.', false); toast('Nombor telefon penghuni tidak sah', false); return; }

      const etaDate = dateFromInputDateOnly(etaVal);
      const etdDate = etdVal ? dateFromInputDateOnly(etdVal) : null;
      if (!etaDate) { showStatus('Tarikh ETA tidak sah.', false); toast('Tarikh ETA tidak sah', false); return; }
      if (etdVal && !etdDate) { showStatus('Tarikh ETD tidak sah.', false); toast('Tarikh ETD tidak sah', false); return; }
      if (etdDate) {
        const max = new Date(etaDate); max.setDate(max.getDate() + 3);
        if (etdDate < etaDate || etdDate > max) { showStatus('Tarikh ETD mesti antara ETA hingga 3 hari selepas ETA.', false); toast('Tarikh ETD mesti antara ETA hingga 3 hari selepas ETA', false); return; }
      }

      // vehicle handling
      let vehicleNo = '';
      let vehicleNumbers = [];
      if (category === 'Pelawat Khas') {
        vehicleNumbers = getVehicleNumbersFromList();
        if (!vehicleNumbers.length) { showStatus('Sila masukkan sekurang-kurangnya satu nombor kenderaan untuk Pelawat Khas.', false); toast('Sila masukkan nombor kenderaan', false); return; }
      } else {
        vehicleNo = document.getElementById('vehicleNo')?.value.trim() || '';
      }

      // prepare payload
      const payload = {
        hostUnit,
        hostName,
        hostPhone: hostPhone || '',
        category,
        entryDetails: entryDetails || '',
        companyName: companyName || '',
        visitorName,
        visitorPhone: visitorPhone || '',
        stayOver: (category === 'Pelawat') ? (stayOver === 'Yes' ? 'Yes' : 'No') : 'No',
        eta: Timestamp.fromDate(etaDate),
        etd: etdDate ? Timestamp.fromDate(etdDate) : null,
        vehicleNo: vehicleNo || '',
        vehicleNumbers: vehicleNumbers.length ? vehicleNumbers : [],
        vehicleType: vehicleType || '',
        status: 'Pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      try {
        const col = collection(window.__FIRESTORE, 'responses');
        await addDoc(col, payload);
        showStatus('Pendaftaran berjaya. Terima kasih.', true);
        toast('Pendaftaran berjaya', true);
        form.reset();
        // reset UI bits
        setCompanyFieldState(false);
        if (vehicleMultiWrap) vehicleMultiWrap.classList.add('hidden');
        if (vehicleSingleWrap) vehicleSingleWrap.classList.remove('hidden');
        if (vehicleList) vehicleList.innerHTML = '';
        if (stayOverEl) { stayOverEl.disabled = true; stayOverEl.value = 'No'; }
        if (etdEl) { etdEl.min = ''; etdEl.max = ''; etdEl.value = ''; }
      } catch (err) {
        console.error('visitor add error', err);
        showStatus('Gagal hantar. Sila cuba lagi atau hubungi pentadbir.', false);
        toast('Gagal hantar. Sila cuba lagi', false);
      }
    });

    // clear handler
    clearBtn?.addEventListener('click', () => {
      form.reset();
      showStatus('', true);
      setCompanyFieldState(false);
      if (vehicleMultiWrap) vehicleMultiWrap.classList.add('hidden');
      if (vehicleSingleWrap) vehicleSingleWrap.classList.remove('hidden');
      if (vehicleList) vehicleList.innerHTML = '';
      if (stayOverEl) { stayOverEl.disabled = true; stayOverEl.value = 'No'; }
      if (etdEl) { etdEl.min = ''; etdEl.max = ''; etdEl.value = ''; }
    });
  })();
});
