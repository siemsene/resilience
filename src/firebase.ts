import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  sendPasswordResetEmail,
  setPersistence,
  signInAnonymously,
} from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
if (import.meta.env.DEV) {
  // Use the explicit debug token if set in .env; otherwise let Firebase
  // generate one and log it to the browser console on first run.
  const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string })
    .FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken || true;
}
if (recaptchaSiteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectFunctionsEmulator(functions, 'localhost', 5001);
}

export async function prepareInstructorAuth() {
  await setPersistence(auth, browserLocalPersistence);
}

export async function ensurePlayerAuth() {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  await setPersistence(auth, browserSessionPersistence);
  const credential = await signInAnonymously(auth);
  return credential.user;
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email);
}

export const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || '';
