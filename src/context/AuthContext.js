import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  addDoc,
} from "firebase/firestore";
import { initializeApp } from "firebase/app";

import { auth, db, firebaseConfig } from "../services/firebase";

const ADMIN_UID = "DvMXB4HGboO0QaypS3ZxhXYLitv1";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        setUser(firebaseUser);
        if (!firebaseUser) {
          setProfile(null);
          setLoading(false);
          return;
        }

        const profileRef = doc(db, "users", firebaseUser.uid);
        const profileSnap = await getDoc(profileRef);

        const isAdmin = firebaseUser.uid === ADMIN_UID;
        if (!profileSnap.exists()) {
          if (!isAdmin) {
            await signOut(auth);
            setProfile(null);
            setLoading(false);
            return;
          }
          const baseProfile = {
            nome: firebaseUser.displayName || "",
            email: firebaseUser.email || "",
            role: "admin",
            cargo: "Admin",
            primeiroAcesso: false,
            createdAt: serverTimestamp(),
          };
          await setDoc(profileRef, baseProfile);
          setProfile(baseProfile);
        } else {
          setProfile(profileSnap.data());
        }

        setLoading(false);
      } catch (err) {
        const message = String(err?.message || "").toLowerCase();
        if (err?.code === "cancelled" || message.includes("aborted a request")) {
          return;
        }
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);

  const logout = () => signOut(auth);

  const requestPasswordReset = async (email) => {
    await sendPasswordResetEmail(auth, email);
    const notificationsRef = collection(db, "notifications");
    await addDoc(notificationsRef, {
      type: "password_reset",
      email,
      status: "new",
      createdAt: serverTimestamp(),
    });
  };

  const completeFirstAccess = async (newPassword) => {
    if (!auth.currentUser) {
      throw new Error("Usuario nao autenticado.");
    }
    await updatePassword(auth.currentUser, newPassword);
    const profileRef = doc(db, "users", auth.currentUser.uid);
    await updateDoc(profileRef, { primeiroAcesso: false });
    setProfile((prev) => ({ ...prev, primeiroAcesso: false }));
  };

  const createUser = async ({ nome, email, senha, role, cargo }) => {
    const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
    const secondaryAuth = getAuth(secondaryApp);
    const result = await createUserWithEmailAndPassword(secondaryAuth, email, senha);

    const profileRef = doc(db, "users", result.user.uid);
    await setDoc(profileRef, {
      nome,
      email,
      role,
      cargo,
      primeiroAcesso: true,
      createdAt: serverTimestamp(),
    });

    await signOut(secondaryAuth);

    return result.user.uid;
  };

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      login,
      logout,
      requestPasswordReset,
      completeFirstAccess,
      createUser,
      isAdmin: profile?.role === "admin",
    }),
    [user, profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }
  return context;
}
