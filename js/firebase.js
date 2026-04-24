// ════════════════════════════════════════
// firebase.js — Firebase v10 Modular Setup
// type="module" — runs before all defer
// scripts. Exposes db, auth, FS helpers,
// and drives the auth-state boot sequence.
// ════════════════════════════════════════

import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';

import {
  getFirestore,
  collection, doc,
  getDoc, getDocs,
  setDoc, deleteDoc,
  query, where,
  onSnapshot,
  writeBatch,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// ─────────────────────────────────────────
// ⚠️  REPLACE WITH YOUR FIREBASE CONFIG
// Firebase Console → Project Settings →
// Your Apps → SDK Setup & Configuration
// ─────────────────────────────────────────
const firebaseConfig = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT_ID.firebaseapp.com',
  projectId:         'YOUR_PROJECT_ID',
  storageBucket:     'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
  appId:             'YOUR_APP_ID',
};

// ── Initialise ────────────────────────────
const app  = initializeApp(firebaseConfig);
const _db  = getFirestore(app);
const _auth = getAuth(app);

// ── Expose Firestore instance & functions ─
// All deferred scripts can access these via window.*
window.db = _db;
window.auth = _auth;

/** Bundled Firestore functions used across the app */
window.FS = {
  collection, doc,
  getDoc, getDocs,
  setDoc, deleteDoc,
  query, where,
  onSnapshot,
  writeBatch,
  serverTimestamp,
};

/** Shorthand: Firestore collection under the signed-in user */
window.userCol = (sub) =>
  collection(_db, 'users', window._uid, sub);

/** Shorthand: Firestore document under the signed-in user */
window.userDoc = (sub, id) =>
  doc(_db, 'users', window._uid, sub, id);

// ── Auth helpers (called from HTML / init.js) ─
window.googleSignIn = () =>
  signInWithPopup(_auth, new GoogleAuthProvider())
    .catch(err => {
      console.error('Sign-in error:', err);
      const msg = err.code === 'auth/popup-closed-by-user'
        ? 'Sign-in cancelled.'
        : 'Sign-in failed. Please try again.';
      document.getElementById('loginError').textContent = msg;
    });

window.authSignOut = () => signOut(_auth);

// ── Auth state driver ─────────────────────
// This fires after all deferred scripts have
// already executed, so bootApp / showLoginScreen
// are guaranteed to be defined.
window._uid = null;

onAuthStateChanged(_auth, async (user) => {
  if (user) {
    window._uid = user.uid;
    // bootApp is defined in init.js (deferred, already ran)
    await window.bootApp(user);
  } else {
    window._uid = null;
    // clearListeners is defined in db.js
    if (typeof clearListeners === 'function') clearListeners();
    window.showLoginScreen();
  }
});

// ════════════════════════════════════════
// FIRESTORE SECURITY RULES — READ THIS
// ════════════════════════════════════════
//
// In the Firebase Console → Firestore → Rules,
// set the following to restrict each user to
// their own data only:
//
// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {
//     match /users/{userId}/{document=**} {
//       allow read, write: if request.auth != null
//                          && request.auth.uid == userId;
//     }
//   }
// }
//
// This ensures:
// • Only authenticated users can read/write
// • A user can only access their own /users/{uid}/… data
// ════════════════════════════════════════
