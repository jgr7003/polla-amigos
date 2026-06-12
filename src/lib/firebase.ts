import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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

export { app, auth, db };
