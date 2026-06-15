/**
 * @fileoverview Authentication page — sign in and sign up.
 * Implements email/password and Google OAuth flows with full accessibility.
 */

import { useState, useCallback, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@context/AuthContext';
import LoadingSpinner from '@components/ui/LoadingSpinner';

/**
 * Authentication page with toggle between sign-in and sign-up modes.
 *
 * @returns {React.ReactElement}
 */
export default function AuthPage() {
  const { signIn, signUp, signInWithGoogle, error, clearError } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState(/** @type {'signin'|'signup'} */ ('signin'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleToggleMode = useCallback(() => {
    setMode((prev) => (prev === 'signin' ? 'signup' : 'signin'));
    clearError();
    setLocalError('');
  }, [clearError]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setLocalError('');
      clearError();

      if (!email.trim() || !password) {
        setLocalError('Email and password are required.');
        return;
      }

      if (password.length < 8) {
        setLocalError('Password must be at least 8 characters.');
        return;
      }

      setLoading(true);
      try {
        if (mode === 'signin') {
          await signIn(email.trim(), password);
        } else {
          await signUp(email.trim(), password, displayName.trim() || undefined);
        }
        navigate('/', { replace: true });
      } catch {
        // Error is set in AuthContext
      } finally {
        setLoading(false);
      }
    },
    [email, password, displayName, mode, signIn, signUp, navigate, clearError]
  );

  const handleGoogleSignIn = useCallback(async () => {
    setLocalError('');
    clearError();
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate('/', { replace: true });
    } catch {
      // Error is set in AuthContext
    } finally {
      setLoading(false);
    }
  }, [signInWithGoogle, navigate, clearError]);

  const displayError = localError || error;

  return (
    <main
      className="flex items-center justify-center gradient-hero"
      style={{ minHeight: '100vh', padding: 'var(--space-8)' }}
      aria-labelledby="auth-heading"
    >
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Brand */}
        <div className="text-center mb-6">
          <span style={{ fontSize: '3rem', display: 'block', marginBottom: 'var(--space-3)' }} aria-hidden="true">
            🌍
          </span>
          <h1 id="auth-heading" className="gradient-text" style={{ fontSize: 'var(--text-3xl)', fontWeight: 'var(--font-extrabold)' }}>
            EcoTrack
          </h1>
          <p className="text-muted mt-4">
            {mode === 'signin'
              ? 'Sign in to track your carbon footprint'
              : 'Create your account to get started'}
          </p>
        </div>

        <div className="card">
          {/* Error message */}
          {displayError && (
            <div
              role="alert"
              aria-live="assertive"
              className="form-error"
              style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'hsla(0,84%,55%,0.1)',
                border: '1px solid var(--color-danger-500)',
                borderRadius: 'var(--radius-lg)',
                marginBottom: 'var(--space-4)',
                fontSize: 'var(--text-sm)',
              }}
            >
              ⚠️ {displayError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate aria-label={mode === 'signin' ? 'Sign in form' : 'Sign up form'}>
            <div className="flex flex-col gap-4">
              {mode === 'signup' && (
                <div className="form-group">
                  <label htmlFor="displayName" className="form-label">
                    Display Name
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    className="form-input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name (optional)"
                    autoComplete="name"
                    aria-label="Display name (optional)"
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="email" className="form-label">
                  Email Address <span aria-hidden="true">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete={mode === 'signin' ? 'email' : 'email'}
                  aria-required="true"
                  aria-describedby={displayError ? 'auth-error' : undefined}
                />
              </div>

              <div className="form-group">
                <label htmlFor="password" className="form-label">
                  Password <span aria-hidden="true">*</span>
                </label>
                <input
                  id="password"
                  type="password"
                  className="form-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
                  required
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  aria-required="true"
                  minLength={mode === 'signup' ? 8 : undefined}
                />
                {mode === 'signup' && (
                  <p className="form-help" id="password-help">Minimum 8 characters required.</p>
                )}
              </div>

              <button
                type="submit"
                className="btn btn--primary btn--full btn--lg"
                disabled={loading}
                aria-busy={loading}
                aria-label={loading ? 'Please wait...' : (mode === 'signin' ? 'Sign in to EcoTrack' : 'Create account')}
              >
                {loading ? <LoadingSpinner size="sm" label="Signing in..." /> : (mode === 'signin' ? 'Sign In' : 'Create Account')}
              </button>
            </div>
          </form>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-4)',
              margin: 'var(--space-6) 0',
            }}
            role="separator"
            aria-label="Or"
          >
            <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>or</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
          </div>

          <button
            onClick={handleGoogleSignIn}
            className="btn btn--secondary btn--full"
            disabled={loading}
            aria-label="Continue with Google account"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
              <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z" />
              <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z" />
              <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18z" />
              <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.31z" />
            </svg>
            Continue with Google
          </button>

          <p className="text-center text-sm text-muted mt-6">
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={handleToggleMode}
              className="btn btn--ghost btn--sm"
              aria-label={mode === 'signin' ? 'Switch to sign up' : 'Switch to sign in'}
            >
              {mode === 'signin' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}
