/**
 * @fileoverview Firebase Authentication Context.
 * Provides auth state (user, loading, error) to the entire React tree.
 * Uses a single onAuthStateChanged listener to prevent memory leaks.
 */

import { createContext, useContext, useEffect, useState, useCallback, ReactNode, ReactElement } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  User,
  UserCredential,
} from 'firebase/auth';
import { auth } from '../firebase.js';

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<UserCredential>;
  signUp: (email: string, password: string, displayName?: string) => Promise<UserCredential>;
  signInWithGoogle: () => Promise<UserCredential>;
  logOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const googleProvider = new GoogleAuthProvider();

/**
 * Provides Firebase authentication state and methods to child components.
 */
export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to Firebase auth state once on mount
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        setUser(firebaseUser);
        setLoading(false);
      },
      (err) => {
        console.error('[AuthContext] onAuthStateChanged error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return unsubscribe; // Cleanup listener on unmount
  }, []);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Signs in an existing user with email and password.
   */
  const signIn = useCallback(async (email: string, password: string): Promise<UserCredential> => {
    setError(null);
    try {
      return await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  /**
   * Creates a new user account with email and password.
   */
  const signUp = useCallback(async (email: string, password: string, displayName?: string): Promise<UserCredential> => {
    setError(null);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        await updateProfile(credential.user, { displayName });
      }
      return credential;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  /**
   * Signs in via Google OAuth popup.
   */
  const signInWithGoogle = useCallback(async (): Promise<UserCredential> => {
    setError(null);
    try {
      return await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  /**
   * Signs out the current user.
   */
  const logOut = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      await signOut(auth);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  /**
   * Sends a password reset email to the given address.
   */
  const resetPassword = useCallback(async (email: string): Promise<void> => {
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    error,
    signIn,
    signUp,
    signInWithGoogle,
    logOut,
    resetPassword,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Custom hook to consume the AuthContext.
 * Must be used within an AuthProvider tree.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return context;
}
