/**
 * @fileoverview Firebase Authentication Context.
 * Provides auth state (user, loading, error) to the entire React tree.
 * Uses a single onAuthStateChanged listener to prevent memory leaks.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../firebase.js';

/**
 * @typedef {object} AuthContextValue
 * @property {import('firebase/auth').User|null} user - The currently authenticated user.
 * @property {boolean} loading - True while auth state is being resolved.
 * @property {string|null} error - Last auth error message, or null.
 * @property {Function} signIn - Signs in with email and password.
 * @property {Function} signUp - Creates a new account with email and password.
 * @property {Function} signInWithGoogle - Signs in with Google OAuth popup.
 * @property {Function} logOut - Signs out the current user.
 * @property {Function} resetPassword - Sends a password reset email.
 * @property {Function} clearError - Clears the current error state.
 */

const AuthContext = createContext(/** @type {AuthContextValue|null} */ (null));
const googleProvider = new GoogleAuthProvider();

/**
 * Provides Firebase authentication state and methods to child components.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @returns {React.ReactElement}
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(/** @type {import('firebase/auth').User|null} */ (null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(/** @type {string|null} */ (null));

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

  /** @type {Function} */
  const clearError = useCallback(() => setError(null), []);

  /**
   * Signs in an existing user with email and password.
   *
   * @param {string} email
   * @param {string} password
   * @returns {Promise<import('firebase/auth').UserCredential>}
   */
  const signIn = useCallback(async (email, password) => {
    setError(null);
    try {
      return await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  /**
   * Creates a new user account with email and password.
   *
   * @param {string} email
   * @param {string} password
   * @param {string} [displayName]
   * @returns {Promise<import('firebase/auth').UserCredential>}
   */
  const signUp = useCallback(async (email, password, displayName) => {
    setError(null);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        await updateProfile(credential.user, { displayName });
      }
      return credential;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  /**
   * Signs in via Google OAuth popup.
   *
   * @returns {Promise<import('firebase/auth').UserCredential>}
   */
  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      return await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  /**
   * Signs out the current user.
   *
   * @returns {Promise<void>}
   */
  const logOut = useCallback(async () => {
    setError(null);
    try {
      await signOut(auth);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  /**
   * Sends a password reset email to the given address.
   *
   * @param {string} email
   * @returns {Promise<void>}
   */
  const resetPassword = useCallback(async (email) => {
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const value = {
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

AuthProvider.propTypes = {
  children: (props, propName) => {
    if (!props[propName]) {
      return new Error('AuthProvider requires children');
    }
    return null;
  },
};

/**
 * Custom hook to consume the AuthContext.
 * Must be used within an AuthProvider tree.
 *
 * @returns {AuthContextValue}
 * @throws {Error} If used outside of AuthProvider.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return context;
}
