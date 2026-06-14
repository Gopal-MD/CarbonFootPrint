/**
 * @fileoverview Root application component.
 * Implements lazy-loaded routes for optimal code splitting, a global
 * AuthProvider for Firebase authentication state, and an accessible
 * loading boundary with aria-live announcements.
 */

import React, { Suspense, lazy, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@context/AuthContext.jsx';
import AppShell from '@components/layout/AppShell.jsx';
import LoadingSpinner from '@components/ui/LoadingSpinner.jsx';
import { announce } from '@utils/ariaAnnouncer.js';

// ── Lazy-loaded page components (code splitting) ─────────────────────────────
const DashboardPage = lazy(() => import('@pages/DashboardPage.jsx'));
const CommutePage = lazy(() => import('@pages/CommutePage.jsx'));
const ScanPage = lazy(() => import('@pages/ScanPage.jsx'));
const InsightsPage = lazy(() => import('@pages/InsightsPage.jsx'));
const AuthPage = lazy(() => import('@pages/AuthPage.jsx'));
const NotFoundPage = lazy(() => import('@pages/NotFoundPage.jsx'));

// ── Accessible Suspense Fallback ─────────────────────────────────────────────
/**
 * Renders a full-screen loading spinner while a lazy page chunk is being fetched.
 * Announces loading state to screen readers via the aria-live region.
 *
 * @param {object} props
 * @param {string} props.pageName - Human-readable name of the page being loaded.
 * @returns {React.ReactElement}
 */
function PageLoader({ pageName }) {
  React.useEffect(() => {
    announce(`Loading ${pageName} page...`);
  }, [pageName]);

  return (
    <div
      className="page-loader"
      role="status"
      aria-label={`Loading ${pageName} page`}
    >
      <LoadingSpinner size="lg" label={`Loading ${pageName}...`} />
    </div>
  );
}

PageLoader.propTypes = {
  pageName: (props, propName) => {
    if (typeof props[propName] !== 'string') {
      return new Error(`pageName must be a string`);
    }
    return null;
  },
};

// ── Protected Route ──────────────────────────────────────────────────────────
/**
 * Redirects unauthenticated users to /auth.
 * Renders children once authentication state is confirmed.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @returns {React.ReactElement}
 */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <PageLoader pageName="Authenticating" />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return children;
}

ProtectedRoute.propTypes = {
  children: (props, propName) => {
    if (!props[propName]) {
      return new Error('children is required for ProtectedRoute');
    }
    return null;
  },
};

// ── Route configuration ──────────────────────────────────────────────────────
/**
 * Application router. All pages are lazily loaded behind a Suspense boundary.
 * Protected routes require Firebase authentication.
 *
 * @returns {React.ReactElement}
 */
function AppRoutes() {
  const makeLoader = useCallback(
    (name) => <PageLoader pageName={name} />,
    []
  );

  return (
    <Routes>
      {/* Public route */}
      <Route
        path="/auth"
        element={
          <Suspense fallback={makeLoader('Sign In')}>
            <AuthPage />
          </Suspense>
        }
      />

      {/* Protected routes wrapped in AppShell (nav + sidebar) */}
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={
            <Suspense fallback={makeLoader('Dashboard')}>
              <DashboardPage />
            </Suspense>
          }
        />
        <Route
          path="/commute"
          element={
            <Suspense fallback={makeLoader('Commute Tracker')}>
              <CommutePage />
            </Suspense>
          }
        />
        <Route
          path="/scan"
          element={
            <Suspense fallback={makeLoader('Bill Scanner')}>
              <ScanPage />
            </Suspense>
          }
        />
        <Route
          path="/insights"
          element={
            <Suspense fallback={makeLoader('Eco Insights')}>
              <InsightsPage />
            </Suspense>
          }
        />
      </Route>

      {/* 404 */}
      <Route
        path="*"
        element={
          <Suspense fallback={makeLoader('404')}>
            <NotFoundPage />
          </Suspense>
        }
      />
    </Routes>
  );
}

// ── Root App Component ───────────────────────────────────────────────────────
/**
 * Root application component.
 * Provides authentication context to the entire application tree.
 *
 * @returns {React.ReactElement}
 */
export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
