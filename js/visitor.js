// js/visitor.js (module)
// Pastikan js/firebase-init.js di-load dahulu (type="module") sehingga window.__FIRESTORE tersedia.

import {
  collection, addDoc, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// utility: tunggu Firestore inisialisasi (behaviour robust untuk loading)
function waitForFirestore(timeout = 3000){
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check(){
      if (window.__FIRESTORE) return resolve(window.__FIRESTORE);
      if (Date.now() - start > timeout) return reject(new Error('Firestore not available'));
      setTimeout(check, 50);
    })();
  });
}

const form = document.getElementById('visitorForm');
const statusEl = document.getElementById('statusMsg');
const clearBtn = document.getElementById('clearBtn');

function show(msg, ok=true){
  statusEl.innerHTML = `<div class="${ok ? 'msg' : 'small'}">${msg}</div>`;
}

function validatePhone(phone){
  if (!phone) return true;
  const p = phone.replace(/\s+/g,'').replace(/[^0-9+]/g,'');
  return p.length >= 7 && p.length <= 15;
}

function isoFromInput(val){
  if (!val) return null;
  // input datetime-local gives a string like "2025-11-11T15:30"
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

(async ()=>{
  try {
    await waitForFirestore();
  } catch (err) {
    console.error('Firestore init failed', err);
    show('Initialisasi gagal. Sila hubungi pentadbir.', false);
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // visitor values
    const name = document.getElementById('name').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const vehicle = document.getElementById('vehicle').value.trim();
    const category = document.getElementById('category').value;
    const etaVal = document.getElementById('eta').value;
    const etdVal = document.getElementById('etd').value;
    const note = document.getElementById('note').value.trim();
    const parking = document.getElementById('parking').value;

    // host values
    const hostUnitVal = document.getElementById('hostUnit').value.trim();
    const hostNameVal = document.getElementById('hostName').value.trim();
    const hostPhoneVal = document.getElementById('hostPhone').value.trim();

    // client validation
    if (!hostUnitVal || !hostNameVal) {
      show('Sila lengkapkan maklumat Penghuni (Unit dan Nama).', false);
      return;
    }
    if (!name || !category || !etaVal) {
      show('Sila lengkapkan semua medan bertanda *', false);
      return;
    }
    if (!validatePhone(phone)) {
      show('Nombor telefon pengunjung tidak sah. Sila semak.', false);
      return;
    }
    if (!validatePhone(hostPhoneVal)) {
      show('Nombor telefon penghuni tidak sah. Sila semak.', false);
      return;
    }

    const etaDate = isoFromInput(etaVal);
    const etdDate = isoFromInput(etdVal);
    if (!etaDate) { show('Tarikh/Masa ETA tidak sah', false); return; }
    if (etdVal && !etdDate) { show('Tarikh/Masa ETD tidak sah', false); return; }

    // build payload
    const payload = {
      // visitor info
      name,
      phone: phone || '',
      vehicle: vehicle || '',
      category,
      eta: Timestamp.fromDate(etaDate),
      etd: etdDate ? Timestamp.fromDate(etdDate) : null,
      note: note || '',
      parking: parking || 'No',
      status: 'Pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),

      // host info
      hostUnit: hostUnitVal,
      hostName: hostNameVal,
      hostPhone: hostPhoneVal || ''
    };

    show('Menghantar — tunggu seketika...', true);

    try {
      const col = collection(window.__FIRESTORE, 'responses');
      await addDoc(col, payload);
      show('Terima kasih — pendaftaran berjaya. Keselamatan akan semak.', true);
      form.reset();
    } catch (err) {
      console.error('visitor add error', err);
      show('Gagal hantar. Sila cuba lagi atau hubungi pentadbir.', false);
    }
  });

  clearBtn.addEventListener('click', ()=> {
    form.reset();
    statusEl.innerHTML = '';
  });
})();
