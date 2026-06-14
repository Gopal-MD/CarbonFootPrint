/**
 * @fileoverview Firebase SDK initialization for the Carbon Footprint Platform.
 *
 * All Firebase configuration values are read from Vite environment variables
 * (prefixed VITE_) so they are never hardcoded. The app will throw a clear
 * error during development if required variables are missing.
 *
 * Exports:
 *  - {@link app}   — Firebase App instance
 *  - {@link auth}  — Firebase Authentication instance
 *  - {@link db}    — Firestore database instance
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

// ── Environment Variable Validation ─────────────────────────────────────────
const REQUIRED_ENV_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

const missingVars = REQUIRED_ENV_VARS.filter(
  (key) => !import.meta.env[key]
);

if (missingVars.length > 0) {
  throw new Error(
    `[Firebase] Missing required environment variables:\n  ${missingVars.join('\n  ')}\n` +
      `Copy frontend/.env.example to frontend/.env.local and fill in your Firebase config.`
  );
}

// ── Firebase Configuration ───────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// ── App Initialization (singleton — safe for HMR) ────────────────────────────
/**
 * Initialized Firebase App instance.
 * Uses singleton pattern to prevent duplicate app errors during hot module reload.
 *
 * @type {import('firebase/app').FirebaseApp}
 */
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// ── Service Instances ────────────────────────────────────────────────────────
/**
 * Firebase Authentication instance.
 * Configured to use the local emulator when VITE_USE_FIREBASE_EMULATOR=true.
 *
 * @type {import('firebase/auth').Auth}
 */
const auth = getAuth(app);

/**
 * Cloud Firestore database instance.
 * Configured to use the local emulator when VITE_USE_FIREBASE_EMULATOR=true.
 *
 * @type {import('firebase/firestore').Firestore}
 */
const db = getFirestore(app);

// ── Firebase Local Emulator Support ─────────────────────────────────────────
if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  // Only connect once (HMR guard)
  if (!auth._canInitEmulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
  try {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  } catch {
    // Emulator already connected — safe to ignore during HMR
  }
}

export { app, auth, db };
