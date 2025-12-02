const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Dedupe time window (minutes) - server will treat any existing dedupe key younger than
// this window as a duplicate and prevent additional submissions. Default is 5 minutes.
const DEDUPE_WINDOW_MIN = Number(process.env.DEDUPE_WINDOW_MIN) || 1;
const DEDUPE_WINDOW_MS = DEDUPE_WINDOW_MIN * 60 * 1000;

function isoDateOnlyKey(d) {
  if (!d) return null;
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2,'0');
  const dd = String(dt.getDate()).padStart(2,'0');
  return `${yy}-${mm}-${dd}`;
}

function shortId() { return Math.random().toString(36).slice(2,9); }

exports.createResponseWithDedupe = functions.https.onCall(async (data, context) => {
  // data.payload should contain the response payload (ETA/ETD as ISO strings or date values accepted)
  const payload = (data && data.payload) ? data.payload : data;
  if (!payload) throw new functions.https.HttpsError('invalid-argument', 'Missing payload');

  // parse ETA date for dedupe grouping
  let etaDate;
  try { etaDate = payload.eta ? new Date(payload.eta) : null; } catch(e) { etaDate = null; }
  if (!etaDate || isNaN(etaDate.getTime())) throw new functions.https.HttpsError('invalid-argument', 'Invalid ETA');

  const dateKey = isoDateOnlyKey(etaDate);
  const phoneNorm = (payload.visitorPhone || '').replace(/[^0-9+]/g, '');
  const nameKey = payload.visitorName ? String(payload.visitorName).trim().toLowerCase().replace(/\s+/g,'_').slice(0,64) : '';
  const dedupeKey = `dedupe-${dateKey}_${(payload.hostUnit || '').replace(/\s+/g,'')}_${phoneNorm || nameKey || shortId()}`;

  // deterministic id for response
  const responseId = `resp-${Date.now()}-${shortId()}`;

  const dedupeRef = db.doc(`dedupeKeys/${dedupeKey}`);
  const respRef = db.doc(`responses/${responseId}`);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(dedupeRef);
      if (snap.exists) {
        // If a dedupe key exists, check its createdAt. If it was created within
        // the configured dedupe window, treat as a duplicate. Otherwise allow
        // the new submission and overwrite the dedupe key atomically.
        try {
          const existing = snap.data();
          const existingTs = existing && existing.createdAt && existing.createdAt.toDate ? existing.createdAt.toDate() : (existing && existing.createdAt ? new Date(existing.createdAt) : null);
          if (existingTs) {
            const age = Date.now() - existingTs.getTime();
            if (age < DEDUPE_WINDOW_MS) {
              throw new functions.https.HttpsError('already-exists', 'Duplicate');
            }
            // else fall through and overwrite dedupe key (allow submission)
          }
        } catch (e) {
          // If anything goes wrong checking timestamp, be conservative: treat as duplicate
          if (e instanceof functions.https.HttpsError) throw e;
          throw new functions.https.HttpsError('already-exists', 'Duplicate');
        }
      }

      tx.set(dedupeRef, {
        responseId,
        hostUnit: payload.hostUnit || '',
        visitorPhone: payload.visitorPhone || '',
        visitorName: payload.visitorName || '',
        etaDate: dateKey,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Ensure ETA/ETD fields are stored as Firestore Timestamps if they are valid dates
      const docPayload = Object.assign({}, payload);
      try {
        if (docPayload.eta) docPayload.eta = admin.firestore.Timestamp.fromDate(new Date(docPayload.eta));
      } catch (e) {}
      try {
        if (docPayload.etd) docPayload.etd = admin.firestore.Timestamp.fromDate(new Date(docPayload.etd));
      } catch (e) {}

      docPayload.createdAt = admin.firestore.FieldValue.serverTimestamp();
      docPayload.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      tx.set(respRef, docPayload);
    });

    return { success: true, id: responseId };
  } catch (err) {
    // Already-exists becomes a clear duplicate status
    if (err && err.code === 'already-exists') {
      throw new functions.https.HttpsError('already-exists', 'Duplicate');
    }
    console.error('createResponseWithDedupe error', err);
    // Include the underlying error message to aid diagnosing an 'internal' error from client logs.
    const serverMsg = err && err.message ? `Server error: ${err.message}` : 'Server error';
    throw new functions.https.HttpsError('internal', serverMsg);
  }
});
