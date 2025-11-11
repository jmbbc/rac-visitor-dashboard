// js/visitor.js (module) - lengkap untuk sokong Pelawat Khas & tarikh sahaja
import {
  collection, addDoc, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/* ---------- util ---------- */
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

function show(msg, ok=true){
  const statusEl = document.getElementById('statusMsg');
  if (!statusEl) return console.warn('statusMsg element missing');
  statusEl.innerHTML = `<div class="${ok ? 'msg' : 'small'}">${msg}</div>`;
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
  wrapper.className = 'vehicle-row row';
  wrapper.style.marginTop = '8px';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'vehicle-input';
  input.placeholder = 'ABC1234';
  input.value = value;
  input.style.flex = '1';
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn-ghost';
  removeBtn.textContent = '−';
  removeBtn.style.marginLeft = '8px';
  removeBtn.addEventListener('click', () => wrapper.remove());
  wrapper.appendChild(input);
  wrapper.appendChild(removeBtn);
  return wrapper;
}

function getVehicleNumbersFromList(){
  const list = document.querySelectorAll('#vehicleList .vehicle-input');
  const out = [];
  list.forEach(i => {
    const v = i.value.trim();
    if (v) out.push(v);
  });
  return out;
}

/* ---------- main ---------- */
// tunggu DOM siap sebelum inisialisasi
document.addEventListener('DOMContentLoaded', () => {
  (async () => {
    try {
      await waitForFirestore();
    } catch (err) {
      console.error('Firestore init failed', err);
      show('Initialisasi Firestore gagal. Hubungi pentadbir.', false);
      return;
    }

    // element refs (ambil dengan pemeriksaan)
    const form = document.getElementById('visitorForm');
    const clearBtn = document.getElementById('clearBtn');
    const categoryEl = document.getElementById('category');
    const stayOverEl = document.getElementById('stayOver');
    const etaEl = document.getElementById('eta');
    const etdEl = document.getElementById('etd');

    const vehicleSingleWrap = document.getElementById('vehicleSingleWrap');
    const vehicleMultiWrap = document.getElementById('vehicleMultiWrap');
    const vehicleList = document.getElementById('vehicleList');
    const addVehicleBtn = document.getElementById('addVehicleBtn');

    if (!form) {
      console.error('visitorForm element not found. Aborting init.');
      return;
    }

    // initial UI
    if (stayOverEl) stayOverEl.disabled = true;
    if (vehicleMultiWrap) vehicleMultiWrap.style.display = 'none';
    if (vehicleSingleWrap) vehicleSingleWrap.style.display = 'block';

    // category change handler (safe checks)
    if (categoryEl) {
      categoryEl.addEventListener('change', () => {
        const v = categoryEl.value;
        if (stayOverEl) {
          if (v === 'Pelawat') {
            stayOverEl.disabled = false;
            if (!stayOverEl.value) stayOverEl.value = 'No';
          } else {
            stayOverEl.value = 'No';
            stayOverEl.disabled = true;
          }
        }

        if (v === 'Pelawat Khas') {
          if (vehicleSingleWrap) vehicleSingleWrap.style.display = 'none';
          if (vehicleMultiWrap) {
            vehicleMultiWrap.style.display = 'block';
            if (vehicleList && !vehicleList.querySelector('.vehicle-row')) {
              vehicleList.appendChild(createVehicleRow(''));
            }
          }
        } else {
          if (vehicleSingleWrap) vehicleSingleWrap.style.display = 'block';
          if (vehicleMultiWrap) {
            vehicleMultiWrap.style.display = 'none';
            if (vehicleList) vehicleList.innerHTML = '';
          }
        }
      });
    }

    // add vehicle row handler (if button exists)
    if (addVehicleBtn && vehicleList) {
      addVehicleBtn.addEventListener('click', () => {
        vehicleList.appendChild(createVehicleRow(''));
      });
    }

    // ETA change -> set ETD min/max
    if (etaEl && etdEl) {
      etaEl.addEventListener('change', () => {
        const etaVal = etaEl.value;
        if (!etaVal) {
          etdEl.value = '';
          etdEl.min = '';
          etdEl.max = '';
          return;
        }
        const etaDate = dateFromInputDateOnly(etaVal);
        if (!etaDate) return;
        const maxDate = new Date(etaDate);
        maxDate.setDate(maxDate.getDate() + 3);
        const toIso = d => d.toISOString().slice(0,10);
        etdEl.min = toIso(etaDate);
        etdEl.max = toIso(maxDate);
        if (etdEl.value) {
          const cur = dateFromInputDateOnly(etdEl.value);
          if (!cur || cur < etaDate || cur > maxDate) etdEl.value = '';
        }
      });
    }

    // submit handler (safe element access)
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      show('Memproses...', true);

      const hostUnit = document.getElementById('hostUnit')?.value.trim() || '';
      const hostName = document.getElementById('hostName')?.value.trim() || '';
      const hostPhone = document.getElementById('hostPhone')?.value.trim() || '';

      const category = document.getElementById('category')?.value || '';
      const entryDetails = document.getElementById('entryDetails')?.value.trim() || '';
      const visitorName = document.getElementById('visitorName')?.value.trim() || '';
      const visitorPhone = document.getElementById('visitorPhone')?.value.trim() || '';
      const stayOver = document.getElementById('stayOver')?.value || 'No';
      const etaVal = document.getElementById('eta')?.value || '';
      const etdVal = document.getElementById('etd')?.value || '';

      const vehicleType = document.getElementById('vehicleType')?.value || '';

      // validation
      if (!hostUnit || !hostName) { show('Sila lengkapkan Butiran Penghuni (Unit & Nama).', false); return; }
      if (!category) { show('Sila pilih Kategori.', false); return; }
      if (!visitorName) { show('Sila masukkan Nama Pelawat.', false); return; }
      if (!etaVal) { show('Sila pilih Tarikh ETA.', false); return; }
      if (!validatePhone(visitorPhone)) { show('Nombor telefon pelawat tidak sah.', false); return; }
      if (hostPhone && !validatePhone(hostPhone)) { show('Nombor telefon penghuni tidak sah.', false); return; }

      const etaDate = dateFromInputDateOnly(etaVal);
      const etdDate = etdVal ? dateFromInputDateOnly(etdVal) : null;
      if (!etaDate) { show('Tarikh ETA tidak sah.', false); return; }
      if (etdVal && !etdDate) { show('Tarikh ETD tidak sah.', false); return; }
      if (etdDate) {
        const max = new Date(etaDate); max.setDate(max.getDate() + 3);
        if (etdDate < etaDate || etdDate > max) {
          show('Tarikh ETD mesti antara ETA hingga 3 hari selepas ETA.', false); return;
        }
      }

      // vehicle handling
      let vehicleNo = '';
      let vehicleNumbers = [];
      if (category === 'Pelawat Khas') {
        if (vehicleList) vehicleNumbers = getVehicleNumbersFromList();
        if (!vehicleNumbers.length) { show('Sila masukkan sekurang-kurangnya satu nombor kenderaan untuk Pelawat Khas.', false); return; }
      } else {
        vehicleNo = document.getElementById('vehicleNo')?.value.trim() || '';
      }

      const payload = {
        hostUnit,
        hostName,
        hostPhone: hostPhone || '',
        category,
        entryDetails: entryDetails || '',
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
        show('Pendaftaran berjaya. Terima kasih.', true);
        form.reset();
        if (vehicleMultiWrap) vehicleMultiWrap.style.display = 'none';
        if (vehicleSingleWrap) vehicleSingleWrap.style.display = 'block';
        if (vehicleList) vehicleList.innerHTML = '';
        if (stayOverEl) { stayOverEl.disabled = true; stayOverEl.value = 'No'; }
        if (etdEl) { etdEl.min = ''; etdEl.max = ''; etdEl.value = ''; }
      } catch (err) {
        console.error('visitor add error', err);
        show('Gagal hantar. Sila cuba lagi atau hubungi pentadbir.', false);
      }
    });

    // clear handler
    if (clearBtn) {
      clearBtn.addEventListener('click', ()=> {
        form.reset();
        document.getElementById('statusMsg').innerHTML = '';
        if (vehicleMultiWrap) vehicleMultiWrap.style.display = 'none';
        if (vehicleSingleWrap) vehicleSingleWrap.style.display = 'block';
        if (vehicleList) vehicleList.innerHTML = '';
        if (stayOverEl) { stayOverEl.disabled = true; stayOverEl.value = 'No'; }
        if (etdEl) { etdEl.min = ''; etdEl.max = ''; etdEl.value = ''; }
      });
    }
  })();
});
