import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyD7C6ED0_eq2bu-rjXnSHu-zkYulI8yEFg",
  authDomain: "dz7-manager-a1c9b.firebaseapp.com",
  projectId: "dz7-manager-a1c9b",
  storageBucket: "dz7-manager-a1c9b.firebasestorage.app",
  messagingSenderId: "630585156738",
  appId: "1:630585156738:web:0ff1d924b2434243a3409b",
  measurementId: "G-8HDL0MS97H",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
let db;
try {
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    useFetchStreams: false,
  });
} catch (err) {
  db = getFirestore(app);
}

export { db };
export default app;
