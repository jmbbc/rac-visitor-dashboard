// kumpul nilai tambahan host
const hostUnitVal = document.getElementById('hostUnit').value.trim();
const hostNameVal = document.getElementById('hostName').value.trim();
const hostPhoneVal = document.getElementById('hostPhone').value.trim();

// sedia validasi wajib baru
if (!hostUnitVal || !hostNameVal) {
  show('Sila lengkapkan maklumat Penghuni (Unit dan Nama).', false);
  return;
}

// pembentukan payload akhir (masukkan host fields)
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
