/**
 * @fileoverview Root application component.
 * Implements lazy-loaded routes for optimal code splitting, a global
 * AuthProvider for Firebase authentication state, and an accessible
 * loading boundary with aria-live announcements.
 */

import { Suspense, lazy, useCallback, useEffect, ReactElement } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@context/AuthContext';
import AppShell from '@components/layout/AppShell';
import LoadingSpinner from '@components/ui/LoadingSpinner';
import { announce } from '@utils/ariaAnnouncer';

// ── Lazy-loaded page components (code splitting) ─────────────────────────────
const DashboardPage = lazy(() => import('@pages/DashboardPage'));
const CommutePage = lazy(() => import('@pages/CommutePage'));
const ScanPage = lazy(() => import('@pages/ScanPage'));
const InsightsPage = lazy(() => import('@pages/InsightsPage'));
const AuthPage = lazy(() => import('@pages/AuthPage'));
const NotFoundPage = lazy(() => import('@pages/NotFoundPage'));

// ── Accessible Suspense Fallback ─────────────────────────────────────────────
interface PageLoaderProps {
  pageName: string;
}

/**
 * Renders a full-screen loading spinner while a lazy page chunk is being fetched.
 * Announces loading state to screen readers via the aria-live region.
 *
 * @returns {React.ReactElement}
 */
function PageLoader({ pageName }: PageLoaderProps): ReactElement {
  useEffect(() => {
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

// ── Protected Route ──────────────────────────────────────────────────────────
interface ProtectedRouteProps {
  children: ReactElement;
}

/**
 * Redirects unauthenticated users to /auth.
 * Renders children once authentication state is confirmed.
 *
 * @returns {React.ReactElement}
 */
function ProtectedRoute({ children }: ProtectedRouteProps): ReactElement {
  const { user, loading } = useAuth();

  if (loading) {
    return <PageLoader pageName="Authenticating" />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return children;
}

// ── Route configuration ──────────────────────────────────────────────────────
/**
 * Application router. All pages are lazily loaded behind a Suspense boundary.
 * Protected routes require Firebase authentication.
 *
 * @returns {React.ReactElement}
 */
function AppRoutes() {
  const makeLoader = useCallback(
    (name: string) => <PageLoader pageName={name} />,
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
