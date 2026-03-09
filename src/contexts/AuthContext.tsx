import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db, ADMIN_EMAIL } from '../firebase';

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
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Check admin
        const admin = u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
        setIsAdmin(admin);

        // Check instructor status
        if (!admin) {
          const instructorDoc = await getDoc(doc(db, 'instructors', u.uid));
          if (instructorDoc.exists()) {
            const data = instructorDoc.data();
            setInstructorStatus(data.status);
            setIsInstructor(data.status === 'approved');
          } else {
            setInstructorStatus(null);
            setIsInstructor(false);
          }
        } else {
          setIsInstructor(false);
          setInstructorStatus(null);
        }
      } else {
        setIsAdmin(false);
        setIsInstructor(false);
        setInstructorStatus(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const register = async (email: string, password: string, displayName: string, institution: string) => {
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
