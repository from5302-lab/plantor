"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { ADMIN_EMAIL } from "@/data/site";

// ID → 내부 이메일 변환 (사용자에게 노출 안 됨)
export function idToEmail(id: string) {
  return `${id.toLowerCase()}@plantor.app`;
}

// ID 유효성 검사: 영문 소문자 + 숫자, 6~15자
export function validateId(id: string): string | null {
  if (id.length < 6) return "아이디는 6자 이상이어야 해요.";
  if (id.length > 15) return "아이디는 15자 이하여야 해요.";
  if (!/^[a-z0-9]+$/.test(id)) return "아이디는 영문 소문자와 숫자만 사용할 수 있어요.";
  if (!/[a-z]/.test(id)) return "아이디에 영문 소문자가 1자 이상 포함되어야 해요.";
  return null;
}

type Role = "parent" | "student" | "admin" | null;

type AuthState = {
  user: User | null;
  role: Role;
  hasAiPackage: boolean;
  aiPackageEndDate: string | null;
  loading: boolean;
  signIn: (id: string, password: string) => Promise<void>;
  signUp: (
    id: string,
    password: string,
    displayName: string,
    role: "parent" | "student",
  ) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  role: null,
  hasAiPackage: false,
  aiPackageEndDate: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [aiPackageEndDate, setAiPackageEndDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const today = new Date().toLocaleDateString("sv-SE");
  const hasAiPackage = !!aiPackageEndDate && aiPackageEndDate >= today;

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const snap = await getDoc(doc(db, "users", u.uid));
          const data = snap.data();
          const role = data?.role as Role | undefined;
          // Firestore role 우선, 없으면 구글 어드민 이메일로 폴백
          if (role) {
            setRole(role);
          } else if (u.email === ADMIN_EMAIL) {
            setRole("admin");
          } else {
            setRole("parent");
          }
          setAiPackageEndDate(data?.aiPackageEndDate ?? null);
        } catch {
          setRole(u.email === ADMIN_EMAIL ? "admin" : "parent");
          setAiPackageEndDate(null);
        }
      } else {
        setRole(null);
        setAiPackageEndDate(null);
      }
      setLoading(false);
    });
  }, []);

  async function signIn(id: string, password: string) {
    await signInWithEmailAndPassword(auth, idToEmail(id), password);
  }

  async function signUp(
    id: string,
    password: string,
    displayName: string,
    role: "parent" | "student",
  ) {
    const email = idToEmail(id);
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    await setDoc(doc(db, "users", cred.user.uid), {
      name: displayName,
      plantor_id: id.toLowerCase(),
      role,
      createdAt: serverTimestamp(),
    });
  }

  async function signOut() {
    await fbSignOut(auth);
    setRole(null);
  }

  return (
    <AuthContext.Provider value={{ user, role, hasAiPackage, aiPackageEndDate, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
