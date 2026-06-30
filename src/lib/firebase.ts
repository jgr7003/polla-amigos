import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
  projectId: "polla-amigos-2026-sb",
  appId: "1:315457424089:web:c46aecfb416412ec98ccc8",
  storageBucket: "polla-amigos-2026-sb.firebasestorage.app",
  apiKey: "AIzaSyCCFy6fLQxany27tLD9KhlHhpTjDycg_2g",
  authDomain: "polla-amigos-2026-sb.firebaseapp.com",
  messagingSenderId: "315457424089",
};

// Initialize Firebase for SSR compatibility
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// Conexión opcional al Firebase Emulator Suite local (desarrollo con Docker).
// Activar con NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true. Solo en el navegador y
// una sola vez (getApps().length === 1 garantiza que es la inicialización).
if (
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true" &&
  typeof window !== "undefined" &&
  getApps().length === 1
) {
  const host = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST || "localhost";
  connectFirestoreEmulator(db, host, 8082);
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
}

export { app, auth, db };
