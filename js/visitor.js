import { collection, addDoc, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const form = document.getElementById('visitorForm');
const statusEl = document.getElementById('statusMsg');
const clearBtn = document.getElementById('clearBtn');

function show(msg, ok=true){
  statusEl.innerHTML = `<div class="${ok ? 'msg' : 'small'}">${msg}</div>`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  show('Menghantar...', true);
  const name = document.getElementById('name').value.trim();
  const unit = document.getElementById('unit').value.trim();
  const category = document.getElementById('category').value;
  const vehicle = document.getElementById('vehicle').value.trim() || '';
  const etaVal = document.getElementById('eta').value;
  const etdVal = document.getElementById('etd').value;

  const data = {
    name,
    unit,
    category,
    vehicle,
    eta: etaVal ? Timestamp.fromDate(new Date(etaVal)) : null,
    etd: etdVal ? Timestamp.fromDate(new Date(etdVal)) : null,
    status: 'Pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    const col = collection(window.__FIRESTORE, 'responses');
    await addDoc(col, data);
    show('Terima kasih — pendaftaran diterima. Keselamatan akan semak.', true);
    form.reset();
  } catch (err) {
    console.error('visitor add error', err);
    show('Gagal hantar. Sila cuba lagi.', false);
  }
});

clearBtn.addEventListener('click', ()=> form.reset());
