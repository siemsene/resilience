import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onIdTokenChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL, prepareInstructorAuth } from '../firebase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isInstructor: boolean;
  instructorStatus: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string, institution: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>(null!);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isInstructor, setIsInstructor] = useState(false);
  const [instructorStatus, setInstructorStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const unsub = onIdTokenChanged(auth, async (u) => {
      if (cancelled) {
        return;
      }

      setLoading(true);
      setUser(u);

      try {
        if (!u || u.isAnonymous) {
          setIsAdmin(false);
          setIsInstructor(false);
          setInstructorStatus(null);
          return;
        }

        const normalizedEmail = u.email?.toLowerCase() || '';
        const admin = normalizedEmail.length > 0 && normalizedEmail === ADMIN_EMAIL.toLowerCase();
        setIsAdmin(admin);

        if (admin) {
          setIsInstructor(false);
          setInstructorStatus(null);
          return;
        }

        const instructorDoc = await getDoc(doc(db, 'instructors', u.uid));
        const nextStatus = instructorDoc.exists()
          ? ((instructorDoc.data() as { status?: string }).status ?? null)
          : null;
        let tokenResult = await u.getIdTokenResult();
        let role = typeof tokenResult.claims.role === 'string' ? tokenResult.claims.role : null;

        if (nextStatus === 'approved' && role !== 'instructor') {
          tokenResult = await u.getIdTokenResult(true);
          role = typeof tokenResult.claims.role === 'string' ? tokenResult.claims.role : null;
        }

        if (cancelled) {
          return;
        }

        setInstructorStatus(nextStatus);
        setIsInstructor(role === 'instructor');
      } catch {
        if (cancelled) {
          return;
        }
        setIsAdmin(false);
        setIsInstructor(false);
        setInstructorStatus(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    await prepareInstructorAuth();
    await signInWithEmailAndPassword(auth, email, password);
  };

  const register = async (email: string, password: string, displayName: string, institution: string) => {
    await prepareInstructorAuth();
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'instructors', cred.user.uid), {
      uid: cred.user.uid,
      email,
      displayName,
      institution,
      status: 'pending',
      appliedAt: Date.now(),
    });
  };

  const signOut = async () => {
    await fbSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isInstructor, instructorStatus, signIn, register, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
