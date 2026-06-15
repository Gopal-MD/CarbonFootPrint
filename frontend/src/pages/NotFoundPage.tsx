/**
 * @fileoverview 404 Not Found page.
 */


import { Link } from 'react-router-dom';

/**
 * @returns {React.ReactElement}
 */
export default function NotFoundPage() {
  return (
    <main
      className="flex flex-col items-center justify-center gradient-hero"
      style={{ minHeight: '100vh', gap: 'var(--space-6)', textAlign: 'center', padding: 'var(--space-8)' }}
      aria-labelledby="notfound-heading"
    >
      <span style={{ fontSize: '6rem' }} aria-hidden="true">🌿</span>
      <h1 id="notfound-heading" style={{ fontSize: 'var(--text-5xl)', fontWeight: 'var(--font-extrabold)' }}>
        404
      </h1>
      <p className="text-muted" style={{ fontSize: 'var(--text-lg)', maxWidth: '400px' }}>
        This page doesn&apos;t exist. Let&apos;s get you back on your eco journey.
      </p>
      <Link to="/" className="btn btn--primary btn--lg" aria-label="Return to EcoTrack Dashboard">
        Go to Dashboard
      </Link>
    </main>
  );
}
