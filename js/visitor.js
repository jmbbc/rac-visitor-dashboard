// js/visitor.js - lengkap: grouped autocomplete + normalization + agreement checkbox
import {
  collection, serverTimestamp, Timestamp, doc, runTransaction
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-functions.js";

/* ---------- full units array (from your List.csv) ---------- */
const units = [
"A-1-1","A-1-2","A-1-3","A-1-4","A-1-5","A-1-6","A-1-7","A-1-8","A-1-9","A-1-10",
"A-2-1","A-2-2","A-2-3","A-2-4","A-2-5","A-2-6","A-2-7","A-2-8","A-2-9","A-2-10",
"A-3-1","A-3-2","A-3-3","A-3-4","A-3-5","A-3-6","A-3-7","A-3-8","A-3-9","A-3-10",
"A-4-1","A-4-2","A-4-3","A-4-4","A-4-5","A-4-6","A-4-7","A-4-8","A-4-9","A-4-10",
"A-5-1","A-5-2","A-5-3","A-5-4","A-5-5","A-5-6","A-5-7","A-5-8","A-5-9","A-5-10",
"A-6-1","A-6-2","A-6-3","A-6-4","A-6-5","A-6-6","A-6-7","A-6-8","A-6-9","A-6-10",
"A-7-1","A-7-2","A-7-3","A-7-4","A-7-5","A-7-6","A-7-7","A-7-8","A-7-9","A-7-10",
"A-8-1","A-8-2","A-8-3","A-8-4","A-8-5","A-8-6","A-8-7","A-8-8","A-8-9","A-8-10",
"A-9-1","A-9-2","A-9-3","A-9-4","A-9-5","A-9-6","A-9-7","A-9-8","A-9-9","A-9-10",
"A-10-1","A-10-2","A-10-3","A-10-4","A-10-5","A-10-6","A-10-7","A-10-8","A-10-9","A-10-10",
"A-11-1","A-11-2","A-11-3","A-11-4","A-11-5","A-11-6","A-11-7","A-11-8","A-11-9","A-11-10",
"A-12-1","A-12-2","A-12-3","A-12-4","A-12-5","A-12-6","A-12-7","A-12-8","A-12-9","A-12-10",
"A-13-1","A-13-2","A-13-3","A-13-4","A-13-5","A-13-6","A-13-7","A-13-8","A-13-9","A-13-10",
"A-14-1","A-14-2","A-14-3","A-14-4","A-14-5","A-14-6","A-14-7","A-14-8","A-14-9","A-14-10",
"B1-1-1","B1-1-2","B1-1-3","B1-1-4","B1-1-5","B1-1-6","B1-1-7","B1-1-8","B1-1-9","B1-1-10","B1-1-11","B1-1-12",
"B1-2-1","B1-2-2","B1-2-3","B1-2-4","B1-2-5","B1-2-6","B1-2-7","B1-2-8","B1-2-9","B1-2-10","B1-2-11","B1-2-12",
"B1-3-1","B1-3-2","B1-3-3","B1-3-4","B1-3-5","B1-3-6","B1-3-7","B1-3-8","B1-3-9","B1-3-10","B1-3-11","B1-3-12",
"B1-4-1","B1-4-2","B1-4-3","B1-4-4","B1-4-5","B1-4-6","B1-4-7","B1-4-8","B1-4-9","B1-4-10","B1-4-11","B1-4-12",
"B1-5-1","B1-5-2","B1-5-3","B1-5-4","B1-5-5","B1-5-6","B1-5-7","B1-5-8","B1-5-9","B1-5-10","B1-5-11","B1-5-12",
"B1-6-1","B1-6-2","B1-6-3","B1-6-4","B1-6-5","B1-6-6","B1-6-7","B1-6-8","B1-6-9","B1-6-10","B1-6-11","B1-6-12",
"B1-7-1","B1-7-2","B1-7-3","B1-7-4","B1-7-5","B1-7-6","B1-7-7","B1-7-8","B1-7-9","B1-7-10","B1-7-11","B1-7-12",
"B1-8-1","B1-8-2","B1-8-3","B1-8-4","B1-8-5","B1-8-6","B1-8-7","B1-8-8","B1-8-9","B1-8-10","B1-8-11","B1-8-12",
"B1-9-1","B1-9-2","B1-9-3","B1-9-4","B1-9-5","B1-9-6","B1-9-7","B1-9-8","B1-9-9","B1-9-10","B1-9-11","B1-9-12",
"B1-10-1","B1-10-2","B1-10-3","B1-10-4","B1-10-5","B1-10-6","B1-10-7","B1-10-8","B1-10-9","B1-10-10","B1-10-11","B1-10-12",
"B1-11-1","B1-11-2","B1-11-3","B1-11-4","B1-11-5","B1-11-6","B1-11-7","B1-11-8","B1-11-9","B1-11-10","B1-11-11","B1-11-12",
"B1-12-1","B1-12-2","B1-12-3","B1-12-4","B1-12-5","B1-12-6","B1-12-7","B1-12-8","B1-12-9","B1-12-10","B1-12-11","B1-12-12",
"B1-G-1","B1-G-2","B1-G-3","B1-G-4","B1-G-5","B1-G-6","B1-G-7","B1-G-8","B1-G-9","B1-G-10","B1-G-11","B1-G-12",
"B2-1-1","B2-1-2","B2-1-3","B2-1-4","B2-1-5","B2-1-6","B2-1-7","B2-1-8","B2-1-9","B2-1-10","B2-1-11","B2-1-12",
"B2-2-1","B2-2-2","B2-2-3","B2-2-4","B2-2-5","B2-2-6","B2-2-7","B2-2-8","B2-2-9","B2-2-10","B2-2-11","B2-2-12",
"B2-3-1","B2-3-2","B2-3-3","B2-3-4","B2-3-5","B2-3-6","B2-3-7","B2-3-8","B2-3-9","B2-3-10","B2-3-11","B2-3-12",
"B2-4-1","B2-4-2","B2-4-3","B2-4-4","B2-4-5","B2-4-6","B2-4-7","B2-4-8","B2-4-9","B2-4-10","B2-4-11","B2-4-12",
"B2-5-1","B2-5-2","B2-5-3","B2-5-4","B2-5-5","B2-5-6","B2-5-7","B2-5-8","B2-5-9","B2-5-10","B2-5-11","B2-5-12",
"B2-6-1","B2-6-2","B2-6-3","B2-6-4","B2-6-5","B2-6-6","B2-6-7","B2-6-8","B2-6-9","B2-6-10","B2-6-11","B2-6-12",
"B2-7-1","B2-7-2","B2-7-3","B2-7-4","B2-7-5","B2-7-6","B2-7-7","B2-7-8","B2-7-9","B2-7-10","B2-7-11","B2-7-12",
"B2-8-1","B2-8-2","B2-8-3","B2-8-4","B2-8-5","B2-8-6","B2-8-7","B2-8-8","B2-8-9","B2-8-10","B2-8-11","B2-8-12",
"B2-9-1","B2-9-2","B2-9-3","B2-9-4","B2-9-5","B2-9-6","B2-9-7","B2-9-8","B2-9-9","B2-9-10","B2-9-11","B2-9-12",
"B2-10-1","B2-10-2","B2-10-3","B2-10-4","B2-10-5","B2-10-6","B2-10-7","B2-10-8","B2-10-9","B2-10-10","B2-10-11","B2-10-12",
"B2-11-1","B2-11-2","B2-11-3","B2-11-4","B2-11-5","B2-11-6","B2-11-7","B2-11-8","B2-11-9","B2-11-10","B2-11-11","B2-11-12",
"B2-12-1","B2-12-2","B2-12-3","B2-12-4","B2-12-5","B2-12-6","B2-12-7","B2-12-8","B2-12-9","B2-12-10","B2-12-11","B2-12-12",
"B2-13-1","B2-13-2","B2-13-3","B2-13-4","B2-13-5","B2-13-6","B2-13-7","B2-13-8","B2-13-9","B2-13-10","B2-13-11","B2-13-12",
"B2-14-1","B2-14-2","B2-14-3","B2-14-4","B2-14-5","B2-14-6","B2-14-7","B2-14-8","B2-14-9","B2-14-10","B2-14-11","B2-14-12",
"B2-15-1","B2-15-2","B2-15-3","B2-15-4","B2-15-5","B2-15-6","B2-15-7","B2-15-8","B2-15-9","B2-15-10","B2-15-11","B2-15-12",
"B2-G-1","B2-G-2","B2-G-3","B2-G-4","B2-G-5","B2-G-6","B2-G-7","B2-G-8","B2-G-9","B2-G-10","B2-G-11","B2-G-12",
"B3-1-1","B3-1-2","B3-1-3","B3-1-4","B3-1-5","B3-1-6","B3-1-7","B3-1-8","B3-1-9","B3-1-10","B3-1-11","B3-1-12",
"B3-2-1","B3-2-2","B3-2-3","B3-2-4","B3-2-5","B3-2-6","B3-2-7","B3-2-8","B3-2-9","B3-2-10","B3-2-11","B3-2-12",
"B3-3-1","B3-3-2","B3-3-3","B3-3-4","B3-3-5","B3-3-6","B3-3-7","B3-3-8","B3-3-9","B3-3-10","B3-3-11","B3-3-12",
"B3-4-1","B3-4-2","B3-4-3","B3-4-4","B3-4-5","B3-4-6","B3-4-7","B3-4-8","B3-4-9","B3-4-10","B3-4-11","B3-4-12",
"B3-5-1","B3-5-2","B3-5-3","B3-5-4","B3-5-5","B3-5-6","B3-5-7","B3-5-8","B3-5-9","B3-5-10","B3-5-11","B3-5-12",
"B3-6-1","B3-6-2","B3-6-3","B3-6-4","B3-6-5","B3-6-6","B3-6-7","B3-6-8","B3-6-9","B3-6-10","B3-6-11","B3-6-12",
"B3-7-1","B3-7-2","B3-7-3","B3-7-4","B3-7-5","B3-7-6","B3-7-7","B3-7-8","B3-7-9","B3-7-10","B3-7-11","B3-7-12",
"B3-8-1","B3-8-2","B3-8-3","B3-8-4","B3-8-5","B3-8-6","B3-8-7","B3-8-8","B3-8-9","B3-8-10","B3-8-11","B3-8-12",
"B3-9-1","B3-9-2","B3-9-3","B3-9-4","B3-9-5","B3-9-6","B3-9-7","B3-9-8","B3-9-9","B3-9-10","B3-9-11","B3-9-12",
"B3-10-1","B3-10-2","B3-10-3","B3-10-4","B3-10-5","B3-10-6","B3-10-7","B3-10-8","B3-10-9","B3-10-10","B3-10-11","B3-10-12",
"B3-11-1","B3-11-2","B3-11-3","B3-11-4","B3-11-5","B3-11-6","B3-11-7","B3-11-8","B3-11-9","B3-11-10","B3-11-11","B3-11-12",
"B3-12-1","B3-12-2","B3-12-3","B3-12-4","B3-12-5","B3-12-6","B3-12-7","B3-12-8","B3-12-9","B3-12-10","B3-12-11","B3-12-12",
"B3-13-1","B3-13-2","B3-13-3","B3-13-4","B3-13-5","B3-13-6","B3-13-7","B3-13-8","B3-13-9","B3-13-10","B3-13-11","B3-13-12",
"B3-14-1","B3-14-2","B3-14-3","B3-14-4","B3-14-5","B3-14-6","B3-14-7","B3-14-8","B3-14-9","B3-14-10","B3-14-11","B3-14-12",
"B3-15-1","B3-15-2","B3-15-3","B3-15-4","B3-15-5","B3-15-6","B3-15-7","B3-15-8","B3-15-9","B3-15-10","B3-15-11","B3-15-12",
"B3-16-1","B3-16-2","B3-16-3","B3-16-4","B3-16-5","B3-16-6","B3-16-7","B3-16-8","B3-16-9","B3-16-10","B3-16-11","B3-16-12",
"B3-17-1","B3-17-2","B3-17-3","B3-17-4","B3-17-5","B3-17-6","B3-17-7","B3-17-8","B3-17-9","B3-17-10","B3-17-11","B3-17-12",
"B3-G-1","B3-G-2","B3-G-3","B3-G-4","B3-G-5","B3-G-6","B3-G-7","B3-G-8","B3-G-9","B3-G-10","B3-G-11","B3-G-12"
];

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
  // accessibility: announce to assistive tech
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  el.textContent = message;
  document.body.appendChild(el);
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

/* ---------- duplicate submission check ---------- */
/*
 * Transaction-based dedupe + create response
 * This creates a small dedupe key document (collection: 'dedupeKeys') and
 * the response document in the same transaction using deterministic ids.
 * This keeps reads to a minimum (one read for the dedupe key) and guarantees
 * uniqueness even under concurrent attempts.
 */
function _shortId(){ return Math.random().toString(36).slice(2,9); }

async function createResponseWithDedupe(payload){
  // Use Cloud Function (callable) to perform server-side transaction (avoids client permission issues)
  if (!window.__FIREBASE_APP) throw new Error('Firebase app not available');

  // Normalize ETA/ETD to ISO strings (callable serializes JSON cleanly)
  const safePayload = Object.assign({}, payload);
  try { if (safePayload.eta && safePayload.eta.toDate) safePayload.eta = safePayload.eta.toDate().toISOString(); } catch(e) {}
  try { if (safePayload.etd && safePayload.etd.toDate) safePayload.etd = safePayload.etd.toDate().toISOString(); } catch(e) {}
  if (!etaDate || isNaN(etaDate.getTime())) throw new Error('Invalid eta date');
  const yy = etaDate.getFullYear();
  const mm = String(etaDate.getMonth()+1).padStart(2,'0');
  const dd = String(etaDate.getDate()).padStart(2,'0');
  const dateKey = `${yy}-${mm}-${dd}`;

  // normalized phone or fallback to name hash
  const phoneNorm = (payload.visitorPhone || '').replace(/[^0-9+]/g,'');
  const nameKey = payload.visitorName ? String(payload.visitorName).trim().toLowerCase().replace(/\s+/g,'_').slice(0,64) : '';
  const dedupeKey = `dedupe-${dateKey}_${(payload.hostUnit||'').replace(/\s+/g,'')}_${phoneNorm || nameKey || _shortId()}`;

  const funcs = getFunctions(window.__FIREBASE_APP);
  const fn = httpsCallable(funcs, 'createResponseWithDedupe');
  try {
    const res = await fn({ payload: safePayload });
    if (res && res.data && res.data.success) return res.data.id;
    throw new Error('function_failed');
  } catch (err) {
    // firebase functions throws HttpsError with code property
    const code = err && err.code ? err.code : (err && err.message ? err.message : 'server_error');
    if (String(code).toLowerCase().includes('already-exists') || String(err).toLowerCase().includes('duplicate')) {
      const e = new Error('duplicate'); e.code = 'DUPLICATE'; throw e;
    }
    throw err;
  }
}

/* ---------- vehicle helpers ---------- */
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
  input.setAttribute('aria-label','Nombor kenderaan');
  input.style.flex = '1';
  input.style.padding = '8px';
  input.style.borderRadius = '8px';
  input.style.border = '1px solid var(--input-border, #e5e7eb)';
  input.style.background = 'var(--card, #fff)';
  input.style.color = 'var(--form-text, #111)';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'vehicle-remove btn-ghost';
  removeBtn.textContent = '−';
  removeBtn.title = 'Keluarkan baris';
  removeBtn.style.padding = '8px 10px';
  removeBtn.style.borderRadius = '8px';
  removeBtn.style.cursor = 'pointer';
  removeBtn.setAttribute('aria-label','Keluarkan nombor kenderaan');
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

/* ---------- autocomplete improved: grouped results + limits ---------- */
let currentSuggestions = [];
let focusedIndex = -1;

const LIMIT_SEARCH = Infinity;      // no max total suggestions
const LIMIT_PER_GROUP = Infinity;   // no max items per group
const GROUP_KEY_REGEX = /^([A-Z0-9]+-\d{1,3})/; // group key extractor

function normQuery(q){
  return (q || '').trim().toUpperCase().replace(/\s+/g,'').replace(/[_\.\/\\]/g,'-');
}

function matchUnitsGrouped(prefix){
  const p = normQuery(prefix);
  if (!p) return {};
  const groups = Object.create(null);
  let total = 0;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!u) continue;
    if (!u.toUpperCase().startsWith(p)) continue;
    const m = u.match(GROUP_KEY_REGEX);
    const g = m ? m[1] : u.split('-').slice(0,2).join('-');
    groups[g] = groups[g] || [];
    groups[g].push(u);
    total++;
  }
  return groups;
}

function flattenGroupsForRender(groups){
  const out = [];
  Object.keys(groups).forEach(gk => {
    out.push({ type: 'header', key: gk });
    groups[gk].forEach(it => out.push({ type: 'item', value: it }));
  });
  return out;
}

function createHeaderNode(text) {
  const d = document.createElement('div');
  d.className = 'autocomplete-item autocomplete-header';
  d.textContent = text;
  d.style.fontWeight = '700';
  d.style.padding = '6px 10px';
  d.setAttribute('aria-disabled','true');
  d.tabIndex = -1;
  return d;
}
function createItemNode(text, index) {
  const div = document.createElement('div');
  div.className = 'autocomplete-item';
  div.role = 'option';
  div.setAttribute('data-value', text);
  div.setAttribute('data-index', index);
  // set stable id for aria-activedescendant
  div.id = `unit-suggestion-${index}`;
  div.tabIndex = -1;
  div.textContent = text;
  return div;
}

function openSuggestionsGrouped(prefix, wrapperEl, inputEl) {
  const container = wrapperEl.querySelector('#unitSuggestions');
  container.innerHTML = '';
  const groups = matchUnitsGrouped(prefix);
  const flattened = flattenGroupsForRender(groups);

  if (flattened.length === 0) {
    container.innerHTML = '<div class="autocomplete-empty">Tiada padanan</div>';
    container.hidden = false;
    currentSuggestions = [];
    focusedIndex = -1;
    return;
  }

  let selectableIndex = 0;
  flattened.forEach((node) => {
    if (node.type === 'header') {
      container.appendChild(createHeaderNode(node.key));
    } else {
      container.appendChild(createItemNode(node.value, selectableIndex));
      selectableIndex++;
    }
  });

  container.hidden = false;
  // indicate to assistive tech we'll open
  if (inputEl) inputEl.setAttribute('aria-expanded', 'true');
  currentSuggestions = Array.from(container.querySelectorAll('.autocomplete-item[role="option"]')).map(el => el.getAttribute('data-value'));
  container.querySelectorAll('.autocomplete-item').forEach(el => el.setAttribute('aria-selected','false'));
  focusedIndex = -1;
}

function closeSuggestions(wrapperEl) {
  const container = wrapperEl.querySelector('#unitSuggestions');
  if (!container) return;
  container.hidden = true;
  container.innerHTML = '';
  currentSuggestions = [];
  focusedIndex = -1;
  // reset aria on input
  const inputEl = wrapperEl.querySelector('input');
  if (inputEl) {
    inputEl.setAttribute('aria-expanded', 'false');
    inputEl.removeAttribute('aria-activedescendant');
  }
}

function selectSuggestionByIndex(idx, inputEl, wrapperEl) {
  if (idx < 0 || idx >= currentSuggestions.length) return;
  const val = currentSuggestions[idx];
  inputEl.value = val;
  closeSuggestions(wrapperEl);
  inputEl.focus();
}

function navSetAriaSelected(listEl, focusedIdx) {
  const options = listEl.querySelectorAll('.autocomplete-item[role="option"]');
  options.forEach((el, idx) => el.setAttribute('aria-selected', idx === focusedIdx ? 'true' : 'false'));
  if (focusedIdx >= 0 && options[focusedIdx]) options[focusedIdx].scrollIntoView({block:'nearest'});
  // set aria-activedescendant on input if available
  const wrap = listEl.closest('.autocomplete-wrap');
  if (wrap) {
    const input = wrap.querySelector('input');
    if (input) {
      if (focusedIdx >= 0 && options[focusedIdx]) {
        input.setAttribute('aria-activedescendant', options[focusedIdx].id);
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }
  }
}

/* ---------- normalization & pattern check ---------- */
function normalizeUnitInput(raw) {
  if (!raw) return '';
  let s = raw.trim().toUpperCase();
  s = s.replace(/\s+/g, '').replace(/[_\.\/\\]/g, '-').replace(/-{2,}/g,'-');
  const m = s.match(/^([A-Z]{1,2})(\d{1,3})(\d{1,2})$/);
  if (m) s = `${m[1]}-${parseInt(m[2],10)}-${m[3]}`;
  return s;
}
function isPatternValidUnit(val) {
  if (!val) return false;
  // Accept forms like:
  //  - A-12-03  (blocks with digits)
  //  - B1-G-1   (blocks where middle segment can be letters like 'G')
  //  - B1-G     (group/prefix form)
  // Allow both two-part and three-part segments, each containing letters/digits.
  return /^[A-Z0-9]+-[A-Z0-9]+(?:-[A-Z0-9]+)?$/.test(val);
}

/* ---------- subcategory/company/etd logic ---------- */
const companyCategories = new Set(['Kontraktor','Penghantaran Barang','Pindah Rumah']);
// For certain categories ETD (tarikh keluar) isn't applicable — include Pelawat Khas
const categoriesEtdDisabled = new Set(['Kontraktor','Penghantaran Barang','Pindah Rumah', 'Pelawat Khas']);

const subCategoryMap = {
  'Penghantaran Barang': [
    { value: 'Penghantaran Masuk', label: 'Penghantaran Masuk' },
    { value: 'Penghantaran Keluar', label: 'Penghantaran Keluar' }
  ],
  'Pindah Rumah': [
    { value: 'Pindah Masuk', label: 'Pindah Masuk' },
    { value: 'Pindah Keluar', label: 'Pindah Keluar' }
  ],
  'Kontraktor': [
    { value: 'Renovasi', label: 'Renovasi' },
    { value: 'Telekomunikasi', label: 'Telekomunikasi' },
    { value: 'Kerja Servis', label: 'Kerja Servis' },
    { value: 'Kawalan Serangga Perosak', label: 'Kawalan Serangga Perosak' },
    { value: 'Kerja Pembaikan', label: 'Kerja Pembaikan' },
    { value: 'Pemeriksaan', label: 'Pemeriksaan' }
  ]
};

const subCategoryHelpMap = {
  'Penghantaran Masuk': 'Penghantaran masuk ke premis — nyatakan pihak penghantar dan penerima; pastikan masa muat turun dicatat.',
  'Penghantaran Keluar': 'Penghantaran keluar dari premis — nyatakan penerima di luar dan butiran kenderaan jika ada.',
  'Pindah Masuk': 'Kemasukan barangan pindah ke unit; sila nyatakan anggaran jumlah barangan dan nombor lori jika ada.',
  'Pindah Keluar': 'Pengeluaran barangan pindah dari unit; rekod nombor lori dan masa anggaran.',
  'Renovasi': 'Kerja-kerja pengubahsuaian (contoh: cat, tukar jubin). Pastikan kontraktor bawa dokumen kelulusan dan senarai pekerja.',
  'Telekomunikasi': 'Kerja pemasangan/servis telekomunikasi. Sertakan nombor projek/PO dan waktu kerja jangkaan.',
  'Kerja Servis': 'Servis berkala seperti penyelenggaraan lif, AC, atau sistem mekanikal. Nyatakan alat yang dibawa jika perlu.',
  'Kawalan Serangga Perosak': 'Rawatan kawalan perosak. Pastikan kawasan yang terlibat dan langkah keselamatan diberi tahu.',
  'Kerja Pembaikan': 'Pembaikan kecil/struktur. Nyatakan skop kerja ringkas dan akses yang diperlukan.',
  'Pemeriksaan': 'Pemeriksaan keselamatan/inspeksi; sertakan pihak yang melakukan pemeriksaan dan tujuan pemeriksaan.'
};

function setCompanyFieldState(show) {
  const companyWrap = document.getElementById('companyWrap');
  const companyInput = document.getElementById('companyName');
  if (!companyWrap || !companyInput) return;
  if (show) {
    companyWrap.classList.remove('hidden');
    try { companyWrap.style.removeProperty('display'); } catch(e) { companyWrap.style.display = ''; }
    companyInput.required = true;
    companyInput.disabled = false;
    companyInput.removeAttribute('aria-hidden');
    try { companyInput.tabIndex = 0; } catch(e) {}
  } else {
    companyWrap.classList.add('hidden');
    // enforce hiding with inline !important so other CSS can't override
    try { companyWrap.style.setProperty('display', 'none', 'important'); } catch(e) { companyWrap.style.display = 'none'; }
    companyInput.required = false;
    companyInput.disabled = true;
    companyInput.value = '';
    companyInput.setAttribute('aria-hidden','true');
    try { companyInput.tabIndex = -1; } catch(e) {}
  }
}

function updateSubCategoryForCategory(cat) {
  const wrap = document.getElementById('subCategoryWrap');
  const select = document.getElementById('subCategory');
  const helpWrap = document.getElementById('subCategoryHelpWrap');
  const helpEl = document.getElementById('subCategoryHelp');
  if (!wrap || !select) return;

  select.innerHTML = '<option value="">— Pilih —</option>';
  select.required = false;
  select.disabled = true;
  try { select.tabIndex = -1; } catch(e) {}
  wrap.classList.add('hidden');
  try { wrap.style.setProperty('display','none','important'); } catch(e) { wrap.style.display = 'none'; }
  wrap.setAttribute('aria-hidden','true');

  if (helpEl) { helpEl.textContent = ''; }
  if (helpWrap) { helpWrap.classList.add('hidden'); helpWrap.setAttribute('aria-hidden','true'); try { helpWrap.style.setProperty('display','none','important'); } catch(e) { helpWrap.style.display = 'none'; } }

    if (subCategoryMap[cat]) {
      subCategoryMap[cat].forEach(opt => { 
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      select.appendChild(o);
    });
      wrap.classList.remove('hidden');
      wrap.removeAttribute('aria-hidden');
      // remove inline hiding to ensure visible again
      try { wrap.style.removeProperty('display'); } catch(e) { wrap.style.display = ''; }
    select.disabled = false;
    select.removeAttribute('aria-hidden');
    try { select.tabIndex = 0; } catch(e) {}
    select.required = true;
    select.removeEventListener('change', showSubCategoryHelp);
    select.addEventListener('change', showSubCategoryHelp);
    showSubCategoryHelp();
  }
}

function showSubCategoryHelp() {
  const select = document.getElementById('subCategory');
  const val = select?.value || '';
  const helpWrap = document.getElementById('subCategoryHelpWrap');
  const helpEl = document.getElementById('subCategoryHelp');
  if (!helpEl || !helpWrap) return;

  if (val && subCategoryHelpMap[val]) {
    helpEl.textContent = subCategoryHelpMap[val];
    helpWrap.classList.remove('hidden');
    helpWrap.removeAttribute('aria-hidden');
    try { helpWrap.style.removeProperty('display'); } catch(e) { helpWrap.style.display = ''; }
  } else {
    helpEl.textContent = '';
    helpWrap.classList.add('hidden');
    helpWrap.setAttribute('aria-hidden','true');
    try { helpWrap.style.setProperty('display','none','important'); } catch(e) { helpWrap.style.display = 'none'; }
  }
}

/* ---------- WhatsApp quick-send helpers (admin link) ---------- */
function normalizeForWaLink(raw){
  if (!raw) return null;
  let p = String(raw).trim().replace(/[\s\-().]/g,'');
  if (!p) return null;
  if (p.startsWith('+')) p = p.replace(/^\+/, '');
  else if (p.startsWith('0')) p = '6' + p.replace(/^0+/, '');
  return p; // e.g., 60123456789
}

function sendWhatsAppToAdmin(payload){
  const adminNumber = '601172248614'; // updated admin number (Malaysia) without plus
  
  // Format date to local timezone (dd/mm/yyyy) instead of UTC
  const formatLocalDate = (ts) => {
    if (!ts) return '-';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };
  
  const etaText = payload.eta ? formatLocalDate(payload.eta) : '-';
  const etdText = payload.etd ? formatLocalDate(payload.etd) : '-';

  const lines = [
    'Pendaftaran Pelawat Baru',
    `Unit: ${payload.hostUnit || '-'}`,
    `Nama penghuni: ${payload.hostName || '-'}`,
    `Nama pelawat: ${payload.visitorName || '-'}`,
    `Nombor telefon pelawat: ${payload.visitorPhone || '-'}`,
    `Tarikh masuk: ${etaText}`,
    `Tarikh keluar: ${etdText}`,
    `Kenderaan: ${ (payload.vehicleNumbers && payload.vehicleNumbers.length) ? payload.vehicleNumbers.join('; ') : (payload.vehicleNo || '-') }`,
    `Kategori: ${payload.category || '-'}`,
  ];
  const text = encodeURIComponent(lines.join('\n'));
  const waUrl = `https://wa.me/${adminNumber}?text=${text}`;
  window.open(waUrl, '_blank');
}

/* ---------- main init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('hostUnit');
  const wrapper = input?.closest('.autocomplete-wrap');
  const listEl = document.getElementById('unitSuggestions');
  const confirmAgreeEl = document.getElementById('confirmAgree');

  // input handlers
  input?.addEventListener('input', (e) => {
    const v = e.target.value || '';
    const q = normQuery(v);
    if (!q) { closeSuggestions(wrapper); return; }
    openSuggestionsGrouped(q, wrapper, input);
  });

  // keyboard navigation
  input?.addEventListener('keydown', (e) => {
    if (!listEl || listEl.hidden) return;
    const options = listEl.querySelectorAll('.autocomplete-item[role="option"]');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIndex = Math.min(focusedIndex + 1, options.length - 1);
      navSetAriaSelected(listEl, focusedIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIndex = Math.max(focusedIndex - 1, 0);
      navSetAriaSelected(listEl, focusedIndex);
    } else if (e.key === 'Enter') {
      if (focusedIndex >= 0 && options[focusedIndex]) {
        e.preventDefault();
        selectSuggestionByIndex(focusedIndex, input, wrapper);
      }
    } else if (e.key === 'Escape') {
      closeSuggestions(wrapper);
    }
  });

  // click on suggestion (delegation)
  listEl?.addEventListener('click', (ev) => {
    const item = ev.target.closest('.autocomplete-item[role="option"]');
    if (!item) return;
    const idx = parseInt(item.getAttribute('data-index'), 10);
    selectSuggestionByIndex(idx, input, wrapper);
  });

  // blur: close after short delay to allow click
  input?.addEventListener('blur', () => setTimeout(()=> closeSuggestions(wrapper), 150));

  // normalization on blur
  input?.addEventListener('blur', (e) => {
    const norm = normalizeUnitInput(e.target.value || '');
    e.target.value = norm;
    if (norm && !isPatternValidUnit(norm)) {
      input.setCustomValidity('Format tidak sah. Gunakan contohnya A-12-03.');
      showStatus('Unit rumah: format tidak sah. Gunakan contoh A-12-03.', false);
    } else {
      input.setCustomValidity('');
      if (norm && !units.includes(norm)) {
        showStatus('Unit tidak ditemui dalam senarai; pastikan ia betul.', true);
      } else {
        showStatus('', true);
      }
    }
  });

  // ensure light theme only (dark mode removed)
  document.documentElement.classList.remove('dark');

  (async () => {
    try { await waitForFirestore(); } catch (err) {
      console.error('Firestore init failed', err);
      showStatus('Initialisasi Firestore gagal. Sila hubungi pentadbir.', false);
      return;
    }

    const form = document.getElementById('visitorForm');
    const clearBtn = document.getElementById('clearBtn');
    const categoryEl = document.getElementById('category');
    const subCategoryEl = document.getElementById('subCategory');
    const stayOverEl = document.getElementById('stayOver');
    const stayOverWrap = document.getElementById('stayOverWrap');
    const etaEl = document.getElementById('eta');
    const etdEl = document.getElementById('etd');

    const companyWrap = document.getElementById('companyWrap');
    const companyInput = document.getElementById('companyName');

    const vehicleSingleWrap = document.getElementById('vehicleSingleWrap');
    const vehicleMultiWrap = document.getElementById('vehicleMultiWrap');
    const vehicleList = document.getElementById('vehicleList');
    const addVehicleBtn = document.getElementById('addVehicleBtn');

    if (!form) { console.error('visitorForm missing'); return; }

    function updateVehicleControlsForCategory(cat) {
      if (!vehicleSingleWrap || !vehicleMultiWrap || !addVehicleBtn || !vehicleList) return;
      if (cat === 'Pelawat Khas') {
        vehicleSingleWrap.classList.add('hidden');
        vehicleMultiWrap.classList.remove('hidden');
        addVehicleBtn.disabled = false;
        addVehicleBtn.classList.remove('btn-disabled');
        if (!vehicleList.querySelector('.vehicle-row')) {
          vehicleList.innerHTML = '';
          vehicleList.appendChild(createVehicleRow(''));
        }
      } else {
        vehicleSingleWrap.classList.remove('hidden');
        vehicleMultiWrap.classList.add('hidden');
        addVehicleBtn.disabled = true;
        addVehicleBtn.classList.add('btn-disabled');
        vehicleList && (vehicleList.innerHTML = '');
      }
    }

    // update ETD (tarikh keluar) visibility & state based on category and stayOver
    function updateEtdState(cat) {
      if (!etdEl || !etaEl) return;
      // when category is empty/default, ETD is not applicable -> hide
      if (!cat) {
        const etdWrap = document.getElementById('etdWrap');
        if (etdWrap) { etdWrap.classList.add('hidden'); try { etdWrap.style.setProperty('display','none','important'); } catch(e){ etdWrap.style.display = 'none'; } etdWrap.setAttribute('aria-hidden','true'); }
        try { etdEl.tabIndex = -1; } catch(e) {}
        etdEl.disabled = true; etdEl.value = ''; etdEl.min = ''; etdEl.max = '';
        return;
      }
      const etdWrap = document.getElementById('etdWrap');
      if (categoriesEtdDisabled.has(cat)) {
        // category-level rule: ETD not applicable
        etdEl.disabled = true; etdEl.value = ''; etdEl.min = ''; etdEl.max = '';
        if (etdWrap) { etdWrap.classList.add('hidden'); try { etdWrap.style.setProperty('display','none','important'); } catch(e){ etdWrap.style.display = 'none'; } etdWrap.setAttribute('aria-hidden','true'); }
        try { etdEl.tabIndex = -1; } catch(e) {}
        return;
      }
      if (cat === 'Pelawat') {
        const stay = stayOverEl?.value || 'No';
        if (stay === 'Yes') {
          etdEl.disabled = false;
          if (etdWrap) { etdWrap.classList.remove('hidden'); etdWrap.removeAttribute('aria-hidden'); try { etdWrap.style.removeProperty('display'); } catch(e){ etdWrap.style.display = ''; } }
          try { etdEl.tabIndex = 0; } catch(e) {}
          const etaVal = etaEl.value;
          if (etaVal) {
            const etaDate = dateFromInputDateOnly(etaVal);
            if (etaDate) {
              const maxDate = new Date(etaDate); maxDate.setDate(maxDate.getDate() + 3);
              const toIso = d => d.toISOString().slice(0,10);
              etdEl.min = toIso(etaDate); etdEl.max = toIso(maxDate);
            }
          }
        } else {
          // user chose Tidak Bermalam (No) -> hide and disable ETD
          etdEl.disabled = true; etdEl.value = ''; etdEl.min = ''; etdEl.max = '';
          if (etdWrap) { etdWrap.classList.add('hidden'); try { etdWrap.style.setProperty('display','none','important'); } catch(e){ etdWrap.style.display = 'none'; } etdWrap.setAttribute('aria-hidden','true'); }
          try { etdEl.tabIndex = -1; } catch(e) {}
        }
        return;
      }
      etdEl.disabled = false;
      if (etdWrap) { etdWrap.classList.remove('hidden'); etdWrap.removeAttribute('aria-hidden'); try { etdWrap.style.removeProperty('display'); } catch(e){ etdWrap.style.display = ''; } }
      try { etdEl.tabIndex = 0; } catch(e) {}
      const etaVal = etaEl.value;
      if (etaVal) {
        const etaDate = dateFromInputDateOnly(etaVal);
        if (etaDate) {
          const maxDate = new Date(etaDate); maxDate.setDate(maxDate.getDate() + 3);
          const toIso = d => d.toISOString().slice(0,10);
          etdEl.min = toIso(etaDate); etdEl.max = toIso(maxDate);
          if (etdEl.value) {
            const cur = dateFromInputDateOnly(etdEl.value);
            if (!cur || cur < etaDate || cur > maxDate) etdEl.value = '';
          }
        }
      } else { etdEl.min = ''; etdEl.max = ''; }
    }

    // hide and disable stayOver by default; only show when category === 'Pelawat'
    if (stayOverEl) {
      stayOverEl.disabled = true;
      try { stayOverEl.tabIndex = -1; } catch(e) {}
    }
    if (stayOverWrap) { stayOverWrap.classList.add('hidden'); try { stayOverWrap.style.setProperty('display','none','important'); } catch(e) { stayOverWrap.style.display ='none'; } stayOverWrap.setAttribute('aria-hidden','true'); }
    if (companyWrap && companyInput) { companyWrap.classList.add('hidden'); companyInput.disabled = true; companyInput.setAttribute('aria-hidden','true'); }
    if (vehicleMultiWrap) vehicleMultiWrap.classList.add('hidden');
    if (vehicleSingleWrap) vehicleSingleWrap.classList.remove('hidden');
    if (vehicleList) vehicleList.innerHTML = '';
    if (addVehicleBtn) { addVehicleBtn.disabled = true; addVehicleBtn.classList.add('btn-disabled'); }

    categoryEl?.addEventListener('change', (ev) => {
      const v = ev.target.value?.trim() || '';

      // If empty/default -> hide sub-category and company (and stayOver). For Pelawat Khas, we still need ETA (tarikh masuk) but ETD not applicable.
      if (!v) {
        // ensure sub-category select is cleared and disabled when not applicable
        const subWrap = document.getElementById('subCategoryWrap');
        const subSel = document.getElementById('subCategory');
        if (subSel) {
          subSel.innerHTML = '<option value="">— Pilih —</option>';
          subSel.disabled = true;
          subSel.required = false;
          subSel.setAttribute('aria-hidden', 'true');
          try { subSel.tabIndex = -1; } catch(e) {}
        }
        if (subWrap) { subWrap.classList.add('hidden'); subWrap.setAttribute('aria-hidden', 'true'); try { subWrap.style.setProperty('display','none','important'); } catch(e) { subWrap.style.display = 'none'; } }
        const subHelp = document.getElementById('subCategoryHelpWrap');
        if (subHelp) { subHelp.classList.add('hidden'); subHelp.setAttribute('aria-hidden', 'true'); try { subHelp.style.setProperty('display','none','important'); } catch(e) { subHelp.style.display = 'none'; } }
        // hide/disable company input
        setCompanyFieldState(false);
        // hide stayOver
        if (stayOverWrap) { try { stayOverWrap.style.setProperty('display','none','important'); } catch(e) { stayOverWrap.style.display='none'; } stayOverWrap.classList.add('hidden'); stayOverWrap.setAttribute('aria-hidden','true'); }
        if (stayOverEl) { stayOverEl.disabled = true; try { stayOverEl.tabIndex = -1; } catch(e) {} }
        // hide ETA / ETD when category is default or not applicable
        const etaWrapEl = document.getElementById('etaWrap');
        if (etaWrapEl) { try { etaWrapEl.style.setProperty('display','none','important'); } catch(e) { etaWrapEl.style.display = 'none'; } etaWrapEl.classList.add('hidden'); etaWrapEl.setAttribute('aria-hidden','true'); }
        if (etaEl) { etaEl.disabled = true; etaEl.value = ''; try { etaEl.tabIndex = -1; } catch(e) {} etaEl.required = false; }
        const etdWrapEl = document.getElementById('etdWrap');
        if (etdWrapEl) { try { etdWrapEl.style.setProperty('display','none','important'); } catch(e) { etdWrapEl.style.display = 'none'; } etdWrapEl.classList.add('hidden'); etdWrapEl.setAttribute('aria-hidden','true'); }
        if (etdEl) { etdEl.disabled = true; etdEl.value = ''; etdEl.min = ''; etdEl.max = ''; try { etdEl.tabIndex = -1; } catch(e) {} }
      } else if (v === 'Pelawat') {
        // Pelawat: hide sub-category and company (stayOver is applicable)
        const subWrap = document.getElementById('subCategoryWrap');
        const subSel = document.getElementById('subCategory');
        if (subSel) {
          subSel.innerHTML = '<option value="">— Pilih —</option>';
          subSel.disabled = true;
          subSel.required = false;
          subSel.setAttribute('aria-hidden', 'true');
          try { subSel.tabIndex = -1; } catch(e){}
        }
        if (subWrap) { subWrap.classList.add('hidden'); try { subWrap.style.setProperty('display','none','important'); } catch(e) { subWrap.style.display='none'; } subWrap.setAttribute('aria-hidden','true'); }
        setCompanyFieldState(false);
        // show stayOver
        if (stayOverWrap) { stayOverWrap.classList.remove('hidden'); stayOverWrap.removeAttribute('aria-hidden'); try { stayOverWrap.style.removeProperty('display'); } catch(e) { stayOverWrap.style.display = ''; } }
        if (stayOverEl) { stayOverEl.disabled = false; try { stayOverEl.tabIndex = 0; } catch(e) {} }
        // show ETA for Pelawat
        const etaWrapEl2 = document.getElementById('etaWrap');
        if (etaWrapEl2) { etaWrapEl2.classList.remove('hidden'); etaWrapEl2.removeAttribute('aria-hidden'); try { etaWrapEl2.style.removeProperty('display'); } catch(e) { etaWrapEl2.style.display=''; } }
        if (etaEl) { etaEl.disabled = false; try { etaEl.tabIndex = 0; } catch(e) {} etaEl.required = true; }
        // ETD visibility will be handled by updateEtdState (depends on stayOver)
      } else if (v === 'Pelawat Khas') {
        // Pelawat Khas: show ETA (required), hide ETD (not applicable)
        const subWrap = document.getElementById('subCategoryWrap');
        const subSel = document.getElementById('subCategory');
        if (subSel) {
          subSel.innerHTML = '<option value="">— Pilih —</option>';
          subSel.disabled = true;
          subSel.required = false;
          subSel.setAttribute('aria-hidden', 'true');
          try { subSel.tabIndex = -1; } catch(e){}
        }
        if (subWrap) { subWrap.classList.add('hidden'); try { subWrap.style.setProperty('display','none','important'); } catch(e) { subWrap.style.display='none'; } subWrap.setAttribute('aria-hidden','true'); }
        setCompanyFieldState(false);
        // show ETA; ensure required
        const etaWrapPK = document.getElementById('etaWrap');
        if (etaWrapPK) { etaWrapPK.classList.remove('hidden'); etaWrapPK.removeAttribute('aria-hidden'); try { etaWrapPK.style.removeProperty('display'); } catch(e) { etaWrapPK.style.display = ''; } }
        if (etaEl) { etaEl.disabled = false; try { etaEl.tabIndex = 0; } catch(e) {} etaEl.required = true; }
        // hide ETD explicitly (Pelawat Khas not overnight)
        const etdWrapPK = document.getElementById('etdWrap');
        if (etdWrapPK) { try { etdWrapPK.style.setProperty('display','none','important'); } catch(e) { etdWrapPK.style.display = 'none'; } etdWrapPK.classList.add('hidden'); etdWrapPK.setAttribute('aria-hidden','true'); }
        if (etdEl) { etdEl.disabled = true; etdEl.value = ''; etdEl.min = ''; etdEl.max = ''; try { etdEl.tabIndex = -1; } catch(e) {} }
      } else {
        // for other categories, populate sub-category (if available) and show company when required
        updateSubCategoryForCategory(v);
        setCompanyFieldState(companyCategories.has(v));
        // hide stayOver for non-Pelawat categories
        if (stayOverWrap) { try { stayOverWrap.style.setProperty('display','none','important'); } catch(e) { stayOverWrap.style.display='none'; } stayOverWrap.classList.add('hidden'); stayOverWrap.setAttribute('aria-hidden','true'); }
        if (stayOverEl) { stayOverEl.disabled = true; try { stayOverEl.tabIndex = -1; } catch(e) {} }
        // show ETA for other categories
        const etaWrapEl3 = document.getElementById('etaWrap');
        if (etaWrapEl3) { etaWrapEl3.classList.remove('hidden'); etaWrapEl3.removeAttribute('aria-hidden'); try { etaWrapEl3.style.removeProperty('display'); } catch(e) { etaWrapEl3.style.display=''; } }
        if (etaEl) { etaEl.disabled = false; try { etaEl.tabIndex = 0; } catch(e) {} etaEl.required = true; }
      }

      if (stayOverEl) { /* stayOver logic preserved from before */ }
      updateVehicleControlsForCategory(v);
      updateEtdState(v);
    });

    subCategoryEl?.addEventListener('change', showSubCategoryHelp);
    stayOverEl?.addEventListener('change', () => { const cat = categoryEl?.value?.trim() || ''; updateEtdState(cat); });
    addVehicleBtn?.addEventListener('click', () => { if (addVehicleBtn.disabled) return; if (!vehicleList) return; vehicleList.appendChild(createVehicleRow('')); });

    etaEl?.addEventListener('change', () => {
      const etaVal = etaEl.value;
      if (!etaVal) { if (etdEl) { etdEl.value = ''; etdEl.min = ''; etdEl.max = ''; } return; }
      const etaDate = dateFromInputDateOnly(etaVal);
      if (!etaDate) return;
      const maxDate = new Date(etaDate); maxDate.setDate(maxDate.getDate() + 3);
      const toIso = d => d.toISOString().slice(0,10);
      if (etdEl) { etdEl.min = toIso(etaDate); etdEl.max = toIso(maxDate); const cat = categoryEl?.value?.trim() || ''; updateEtdState(cat); }
    });

    const initCat = categoryEl?.value?.trim() || '';
    // If initial category is empty/default or Pelawat or Pelawat Khas, hide both sub-category and company
    if (!initCat || initCat === 'Pelawat' || initCat === 'Pelawat Khas') {
      // hide sub-category and helper
      const subWrapInit = document.getElementById('subCategoryWrap');
      const subSelInit = document.getElementById('subCategory');
      if (subSelInit) { subSelInit.innerHTML = '<option value="">— Pilih —</option>'; subSelInit.disabled = true; subSelInit.required = false; subSelInit.setAttribute('aria-hidden','true'); }
      if (subWrapInit) { subWrapInit.classList.add('hidden'); subWrapInit.setAttribute('aria-hidden','true'); try { subWrapInit.style.setProperty('display','none','important'); } catch(e) { subWrapInit.style.display = 'none'; } }
      const subHelpInit = document.getElementById('subCategoryHelpWrap');
      if (subHelpInit) { subHelpInit.classList.add('hidden'); subHelpInit.setAttribute('aria-hidden','true'); try { subHelpInit.style.setProperty('display','none','important'); } catch(e) { subHelpInit.style.display = 'none'; } }

      // hide company
      setCompanyFieldState(false);
      // ensure Bermalam is hidden unless initCat is Pelawat
      if (initCat === 'Pelawat') {
        if (stayOverWrap) { stayOverWrap.classList.remove('hidden'); stayOverWrap.removeAttribute('aria-hidden'); try { stayOverWrap.style.removeProperty('display'); } catch(e) { stayOverWrap.style.display=''; } }
        if (stayOverEl) { stayOverEl.disabled = false; try { stayOverEl.tabIndex = 0; } catch(e) {} }
      } else {
        if (stayOverWrap) { try { stayOverWrap.style.setProperty('display','none','important'); } catch(e) { stayOverWrap.style.display='none'; } stayOverWrap.classList.add('hidden'); stayOverWrap.setAttribute('aria-hidden','true'); }
        if (stayOverEl) { stayOverEl.disabled = true; try { stayOverEl.tabIndex = -1; } catch(e) {} }
      }
      // handle ETA/ETD initial visibility depending on initial category
      if (!initCat) {
        // initial empty -> hide both
        const etaWrapInit = document.getElementById('etaWrap');
        if (etaWrapInit) { try { etaWrapInit.style.setProperty('display','none','important'); } catch(e) { etaWrapInit.style.display='none'; } etaWrapInit.classList.add('hidden'); etaWrapInit.setAttribute('aria-hidden','true'); }
        if (etaEl) { etaEl.disabled = true; etaEl.value = ''; try { etaEl.tabIndex = -1; } catch(e) {} etaEl.required = false; }
        const etdWrapInit = document.getElementById('etdWrap');
        if (etdWrapInit) { try { etdWrapInit.style.setProperty('display','none','important'); } catch(e) { etdWrapInit.style.display='none'; } etdWrapInit.classList.add('hidden'); etdWrapInit.setAttribute('aria-hidden','true'); }
        if (etdEl) { etdEl.disabled = true; etdEl.value = ''; etdEl.min = ''; etdEl.max = ''; try { etdEl.tabIndex = -1; } catch(e) {} }
      } else if (initCat === 'Pelawat Khas') {
        // Pelawat Khas initial -> show ETA required, hide ETD
        const etaWrapInitPK = document.getElementById('etaWrap');
        if (etaWrapInitPK) { etaWrapInitPK.classList.remove('hidden'); etaWrapInitPK.removeAttribute('aria-hidden'); try { etaWrapInitPK.style.removeProperty('display'); } catch(e) { etaWrapInitPK.style.display=''; } }
        if (etaEl) { etaEl.disabled = false; try { etaEl.tabIndex = 0; } catch(e) {} etaEl.required = true; }
        const etdWrapInitPK = document.getElementById('etdWrap');
        if (etdWrapInitPK) { try { etdWrapInitPK.style.setProperty('display','none','important'); } catch(e) { etdWrapInitPK.style.display='none'; } etdWrapInitPK.classList.add('hidden'); etdWrapInitPK.setAttribute('aria-hidden','true'); }
        if (etdEl) { etdEl.disabled = true; etdEl.value = ''; etdEl.min = ''; etdEl.max = ''; try { etdEl.tabIndex = -1; } catch(e) {} }
      } else if (initCat === 'Pelawat') {
        // Pelawat -> show ETA and stayOver handled above
        const etaWrapInit2 = document.getElementById('etaWrap');
        if (etaWrapInit2) { etaWrapInit2.classList.remove('hidden'); etaWrapInit2.removeAttribute('aria-hidden'); try { etaWrapInit2.style.removeProperty('display'); } catch(e) { etaWrapInit2.style.display=''; } }
        if (etaEl) { etaEl.disabled = false; try { etaEl.tabIndex = 0; } catch(e) {} etaEl.required = true; }
      } else {
        // other non-empty category -> eta visible and required
        const etaWrapInit3 = document.getElementById('etaWrap');
        if (etaWrapInit3) { etaWrapInit3.classList.remove('hidden'); etaWrapInit3.removeAttribute('aria-hidden'); try { etaWrapInit3.style.removeProperty('display'); } catch(e) { etaWrapInit3.style.display=''; } }
        if (etaEl) { etaEl.disabled = false; try { etaEl.tabIndex = 0; } catch(e) {} etaEl.required = true; }
      }
    } else {
      setCompanyFieldState(companyCategories.has(initCat));
      updateSubCategoryForCategory(initCat);
    }
    updateVehicleControlsForCategory(initCat);
    updateEtdState(initCat);

    const submitBtn = document.getElementById('submitBtn');

    // submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      showStatus('Memproses...', true);

      const rawUnit = document.getElementById('hostUnit')?.value || '';
      const hostUnit = normalizeUnitInput(rawUnit);

      const hostName = document.getElementById('hostName')?.value.trim() || '';
      const hostPhone = document.getElementById('hostPhone')?.value.trim() || '';

      const category = categoryEl?.value || '';
      const subCategory = subCategoryEl?.value || '';
      const entryDetails = document.getElementById('entryDetails')?.value.trim() || '';
      const companyName = document.getElementById('companyName')?.value.trim() || '';
      const visitorName = document.getElementById('visitorName')?.value.trim() || '';
      const visitorPhone = document.getElementById('visitorPhone')?.value.trim() || '';
      const stayOver = document.getElementById('stayOver')?.value || 'No';
      const etaVal = document.getElementById('eta')?.value || '';
      const etdVal = document.getElementById('etd')?.value || '';
      const vehicleType = document.getElementById('vehicleType')?.value || '';

      // basic validation
      if (!hostUnit) { showStatus('Sila masukkan Unit rumah.', false); toast('Sila masukkan Unit rumah', false); return; }
      if (!isPatternValidUnit(hostUnit)) { showStatus('Format Unit tidak sah. Gunakan contoh A-12-03.', false); toast('Format Unit tidak sah', false); return; }
      if (!hostName) { showStatus('Sila lengkapkan Butiran Penghuni (Nama).', false); toast('Sila lengkapkan Nama penghuni', false); return; }
      if (!category) { showStatus('Sila pilih Kategori.', false); toast('Sila pilih kategori', false); return; }
      if (subCategoryMap[category] && !subCategory) { showStatus('Sila pilih pilihan bagi kategori ini.', false); toast('Sila pilih pilihan bagi kategori ini', false); return; }
      if (companyCategories.has(category) && !companyName) { showStatus('Sila masukkan Nama syarikat.', false); toast('Sila masukkan Nama syarikat', false); return; }
      if (!visitorName) { showStatus('Sila masukkan Nama Pelawat.', false); toast('Sila masukkan Nama Pelawat', false); return; }
      if (!etaVal) { showStatus('Sila pilih Tarikh masuk.', false); toast('Sila pilih Tarikh masuk', false); return; }
      if (!validatePhone(visitorPhone)) { showStatus('Nombor telefon pelawat tidak sah.', false); toast('Nombor telefon pelawat tidak sah', false); return; }
      if (hostPhone && !validatePhone(hostPhone)) { showStatus('Nombor telefon penghuni tidak sah.', false); toast('Nombor telefon penghuni tidak sah', false); return; }

      const etaDate = dateFromInputDateOnly(etaVal);
      const etdDate = etdVal ? dateFromInputDateOnly(etdVal) : null;
      if (!etaDate) { showStatus('Tarikh masuk tidak sah.', false); toast('Tarikh masuk tidak sah', false); return; }
      if (etdVal && !etdDate) { showStatus('Tarikh keluar tidak sah.', false); toast('Tarikh keluar tidak sah', false); return; }
      if (etdDate) {
        const max = new Date(etaDate); max.setDate(max.getDate() + 3);
        if (etdDate < etaDate || etdDate > max) { showStatus('Tarikh keluar mesti antara Tarikh masuk hingga 3 hari selepas Tarikh masuk.', false); toast('Tarikh keluar mesti antara Tarikh masuk hingga 3 hari selepas Tarikh masuk', false); return; }
      }

      // agreement checkbox
      if (!(confirmAgreeEl && confirmAgreeEl.checked)) {
        if (confirmAgreeEl) confirmAgreeEl.focus();
        showStatus('Sila tandakan "Saya setuju" untuk meneruskan.', false);
        toast('Sila tandakan "Saya setuju" sebelum hantar', false);
        return;
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

      const unitFound = units.includes(hostUnit);

      const payload = {
        hostUnit,
        hostUnitFound: unitFound,
        hostName,
        hostPhone: hostPhone || '',
        category,
        subCategory,
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
        subCategoryHelp: subCategoryHelpMap[subCategory] || '',
        status: 'Pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // disable submit to prevent double click / double submit
      if (submitBtn) { submitBtn.disabled = true; submitBtn.classList.add('btn-disabled'); }

      try {
        // attempt create with server-side dedupe transaction
        // create response (atomic) and dedupe key inside a transaction to avoid duplicates
        await createResponseWithDedupe(payload);

        // QUICK WA: open admin WhatsApp with prefilled summary (user must press Send)
        try { sendWhatsAppToAdmin(payload); } catch(e) { console.warn('WA open failed', e); }

        showStatus('Pendaftaran berjaya. Terima kasih.', true);
        toast('Pendaftaran berjaya', true);
        form.reset();
        closeSuggestions(wrapper);
        if (confirmAgreeEl) confirmAgreeEl.checked = false;
        setCompanyFieldState(false);
        updateSubCategoryForCategory('');
        if (vehicleMultiWrap) vehicleMultiWrap.classList.add('hidden');
        if (vehicleSingleWrap) vehicleSingleWrap.classList.remove('hidden');
        if (vehicleList) vehicleList.innerHTML = '';
        if (addVehicleBtn) { addVehicleBtn.disabled = true; addVehicleBtn.classList.add('btn-disabled'); }
        if (stayOverEl) { stayOverEl.disabled = true; stayOverEl.value = 'No'; }
        // hide ETA and ETD after successful submit (form reset -> default state)
        const etaWrapAfter = document.getElementById('etaWrap');
        if (etaWrapAfter) { try { etaWrapAfter.style.setProperty('display','none','important'); } catch(e) { etaWrapAfter.style.display='none'; } etaWrapAfter.classList.add('hidden'); etaWrapAfter.setAttribute('aria-hidden','true'); }
        if (etaEl) { etaEl.disabled = true; etaEl.value = ''; try { etaEl.tabIndex = -1; } catch(e) {} etaEl.required = false; }
        if (etdEl) { etdEl.min = ''; etdEl.max = ''; etdEl.value = ''; etdEl.disabled = true; try { etdEl.tabIndex = -1; } catch(e) {} }
      } catch (err) {
        console.error('visitor add error', err);
        // handle duplicate returned from transaction
        if (err && (err.code === 'DUPLICATE' || String(err).toLowerCase().includes('duplicate'))) {
          showStatus('Pendaftaran serupa telah wujud untuk tarikh ini — tidak dihantar.', false);
          toast('Rekod serupa wujud untuk tarikh ini — tidak dihantar', false);
        } else {
          showStatus('Gagal hantar. Sila cuba lagi atau hubungi pentadbir.', false);
          toast('Gagal hantar. Sila cuba lagi', false);
        }
      } finally {
        // always re-enable submit btn after attempt
        if (submitBtn) { submitBtn.disabled = false; submitBtn.classList.remove('btn-disabled'); }
      }
    });

    // clear handler
    clearBtn?.addEventListener('click', () => {
      form.reset();
      showStatus('', true);
      closeSuggestions(wrapper);
      if (confirmAgreeEl) confirmAgreeEl.checked = false;
      setCompanyFieldState(false);
      updateSubCategoryForCategory('');
      if (vehicleMultiWrap) vehicleMultiWrap.classList.add('hidden');
      if (vehicleSingleWrap) vehicleSingleWrap.classList.remove('hidden');
      if (vehicleList) vehicleList.innerHTML = '';
      if (addVehicleBtn) { addVehicleBtn.disabled = true; addVehicleBtn.classList.add('btn-disabled'); }
      if (stayOverEl) { stayOverEl.disabled = true; stayOverEl.value = 'No'; }
      // hide ETA and ETD when form cleared
      const etaWrapClear = document.getElementById('etaWrap');
      if (etaWrapClear) { try { etaWrapClear.style.setProperty('display','none','important'); } catch(e) { etaWrapClear.style.display='none'; } etaWrapClear.classList.add('hidden'); etaWrapClear.setAttribute('aria-hidden','true'); }
      if (etaEl) { etaEl.disabled = true; etaEl.value = ''; try { etaEl.tabIndex = -1; } catch(e) {} etaEl.required = false; }
      if (etdEl) { etdEl.min = ''; etdEl.max = ''; etdEl.value = ''; etdEl.disabled = true; try { etdEl.tabIndex = -1; } catch(e) {} }
    });
  })();
});
