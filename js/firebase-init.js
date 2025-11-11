<script type="module">
  // ===== REPLACE these values with your Firebase web app config =====
  // Get them from Firebase Console → Project settings → Your apps (Web)
  const firebaseConfig = {
    apiKey: "AIzaSyDxN4OAFzzsQ9clUG9RqewWZ6hJ4HIWLMc",
    authDomain: "banjariavisitor.firebaseapp.com",
    projectId: "banjariavisitor",
    storageBucket: "banjariavisitor.firebasestorage.app",
    messagingSenderId: "82057315329",
    appId: "1:82057315329:web:7ad070a5a4fc6ecac82c00"
  };
  // ==================================================================

  import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
  import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
  import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

  window.__FIREBASE_APP = initializeApp(firebaseConfig);
  window.__FIRESTORE = getFirestore(window.__FIREBASE_APP);
  window.__AUTH = getAuth(window.__FIREBASE_APP);
</script>
