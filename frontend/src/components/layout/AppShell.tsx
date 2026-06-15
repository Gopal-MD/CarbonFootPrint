/**
 * @fileoverview AppShell layout component.
 * Provides the persistent sidebar navigation, header, and content area.
 * All routes rendered inside AppShell are protected (require auth).
 */

import { useCallback } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@context/AuthContext';

/** @type {Array<{path: string, label: string, icon: string, ariaLabel: string}>} */
const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: '📊', ariaLabel: 'Go to Dashboard' },
  { path: '/commute', label: 'Commute Tracker', icon: '🚗', ariaLabel: 'Go to Commute Tracker' },
  { path: '/scan', label: 'Bill Scanner', icon: '📄', ariaLabel: 'Go to Utility Bill Scanner' },
  { path: '/insights', label: 'Eco Insights', icon: '🌿', ariaLabel: 'Go to AI Eco Insights' },
];

/**
 * Application shell with persistent sidebar and sticky header.
 * Uses React Router's Outlet for nested route rendering.
 *
 * @returns {React.ReactElement}
 */
export default function AppShell() {
  const { user, logOut } = useAuth();
  const navigate = useNavigate();

  const handleLogOut = useCallback(async () => {
    try {
      await logOut();
      navigate('/auth', { replace: true });
    } catch {
      // Error is stored in AuthContext — no additional handling needed
    }
  }, [logOut, navigate]);

  return (
    <div className="app-shell">
      {/* Skip navigation link for keyboard users */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* ── Sidebar Navigation ── */}
      <nav className="app-sidebar" aria-label="Primary navigation">
        {/* Brand */}
        <div
          style={{
            padding: 'var(--space-6)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{ fontSize: '1.5rem' }} aria-hidden="true">
              🌍
            </span>
            <span
              className="gradient-text"
              style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)' }}
            >
              EcoTrack
            </span>
          </div>
          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              marginTop: 'var(--space-1)',
            }}
          >
            Carbon Footprint Platform
          </p>
        </div>

        {/* Nav links */}
        <ul
          style={{
            listStyle: 'none',
            padding: 'var(--space-4)',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
          }}
        >
          {NAV_ITEMS.map(({ path, label, icon, ariaLabel }) => (
            <li key={path}>
              <NavLink
                to={path}
                end={path === '/'}
                aria-label={ariaLabel}
                className={({ isActive }) =>
                  `nav-item${isActive ? ' nav-item--active' : ''}`
                }
              >
                <span aria-hidden="true">{icon}</span>
                {label}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* User section */}
        <div
          style={{
            padding: 'var(--space-4)',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          {user && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-2)',
                }}
              >
                <div
                  style={{
                    width: '2rem',
                    height: '2rem',
                    borderRadius: 'var(--radius-full)',
                    background: 'linear-gradient(135deg, var(--color-brand-500), var(--color-accent-500))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--font-bold)',
                    color: 'white',
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                >
                  {(user.displayName || user.email || 'U')[0].toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 'var(--font-medium)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {user.displayName || 'EcoUser'}
                  </p>
                  <p
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {user.email}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogOut}
                className="btn btn--secondary btn--sm btn--full"
                aria-label="Sign out of EcoTrack"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* ── Main Content Area ── */}
      <div className="app-main">
        <header className="app-header" role="banner">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            <h1
              style={{
                fontSize: 'var(--text-lg)',
                fontWeight: 'var(--font-semibold)',
                color: 'var(--text-primary)',
              }}
              id="page-heading"
            >
              Carbon Footprint Awareness Platform
            </h1>
            <span
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Powered by Google AI ✨
            </span>
          </div>
        </header>

        <main id="main-content" className="page-content" tabIndex={-1} aria-labelledby="page-heading">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
