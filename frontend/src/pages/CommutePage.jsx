/**
 * @fileoverview Commute Carbon Calculator — full Google Maps integration.
 *
 * Allows users to calculate CO₂ emissions for their daily commute by
 * entering origin/destination addresses and selecting a travel mode.
 * Calls the backend /api/commute endpoint which uses Google Maps Directions API.
 *
 * Features:
 * - Address autocomplete input with visual feedback
 * - Transport mode selector with emission factor badges
 * - Animated result card with CO₂ breakdown
 * - One-click save to Firestore via backend
 * - Full keyboard accessibility (WCAG 2.1 AA)
 */

import React, { useState, useCallback, useRef, useId } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@context/AuthContext.jsx';

// ── Emission factor labels per mode ──────────────────────────────────────────
const TRAVEL_MODES = [
  { value: 'DRIVING',   label: '🚗 Driving',    badge: '~0.21 kg/km', color: 'danger' },
  { value: 'TRANSIT',   label: '🚌 Transit',    badge: '~0.089 kg/km', color: 'warning' },
  { value: 'BICYCLING', label: '🚴 Cycling',    badge: '~0.005 kg/km', color: 'success' },
  { value: 'WALKING',   label: '🚶 Walking',    badge: '~0 kg/km',     color: 'success' },
];

// ── Small helper: render markdown-lite bold/italic ────────────────────────────
function Highlight({ children }) {
  return (
    <span style={{ color: 'var(--color-brand-300)', fontWeight: 'var(--font-semibold)' }}>
      {children}
    </span>
  );
}

// ── Emission result card ──────────────────────────────────────────────────────
function ResultCard({ result, onSave, saving }) {
  const { distanceKm, durationMin, kgCO2e, mode, comparisonDriving } = result;

  const savingsKg =
    comparisonDriving != null && kgCO2e != null
      ? (comparisonDriving - kgCO2e).toFixed(2)
      : null;

  return (
    <div
      className="card"
      role="region"
      aria-label="Commute calculation result"
      style={{
        background: 'linear-gradient(135deg, hsla(166,76%,20%,0.3), hsla(217,91%,20%,0.15))',
        border: '1px solid var(--glass-border)',
        animation: 'fadeInUp 0.4s ease-out',
      }}
    >
      <h2
        style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 'var(--font-bold)',
          marginBottom: 'var(--space-5)',
        }}
      >
        🌿 Commute Results
      </h2>

      {/* Main stats row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-6)',
        }}
      >
        <div
          className="card"
          style={{ textAlign: 'center', padding: 'var(--space-4)', background: 'var(--bg-tertiary)' }}
        >
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>
            Distance
          </p>
          <p
            className="gradient-text"
            style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)' }}
          >
            {distanceKm}
            <span style={{ fontSize: 'var(--text-sm)', marginLeft: '4px' }}>km</span>
          </p>
        </div>
        <div
          className="card"
          style={{ textAlign: 'center', padding: 'var(--space-4)', background: 'var(--bg-tertiary)' }}
        >
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>
            Duration
          </p>
          <p
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 'var(--font-bold)',
              color: 'var(--color-accent-400)',
            }}
          >
            {durationMin}
            <span style={{ fontSize: 'var(--text-sm)', marginLeft: '4px' }}>min</span>
          </p>
        </div>
        <div
          className="card"
          style={{ textAlign: 'center', padding: 'var(--space-4)', background: 'var(--bg-tertiary)' }}
        >
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>
            CO₂ Emitted
          </p>
          <p
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 'var(--font-bold)',
              color:
                kgCO2e < 1
                  ? 'var(--color-success-400)'
                  : kgCO2e < 3
                  ? 'var(--color-warning-400)'
                  : 'var(--color-danger-400)',
            }}
          >
            {kgCO2e}
            <span style={{ fontSize: 'var(--text-sm)', marginLeft: '4px' }}>kg</span>
          </p>
        </div>
      </div>

      {/* Savings banner */}
      {savingsKg != null && parseFloat(savingsKg) > 0 && (
        <div
          style={{
            background: 'hsla(142,71%,20%,0.4)',
            border: '1px solid hsla(142,71%,40%,0.4)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-3) var(--space-4)',
            marginBottom: 'var(--space-5)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
          }}
          role="status"
          aria-live="polite"
        >
          <span style={{ fontSize: 'var(--text-xl)' }}>🌍</span>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-success-400)' }}>
            Choosing <Highlight>{TRAVEL_MODES.find((m) => m.value === mode)?.label || mode}</Highlight> saves{' '}
            <Highlight>{savingsKg} kg CO₂</Highlight> compared to driving alone today.
          </p>
        </div>
      )}

      {/* Mode badge */}
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-5)' }}>
        Mode: <strong>{TRAVEL_MODES.find((m) => m.value === mode)?.label || mode}</strong>
      </p>

      {/* Save button */}
      <button
        type="button"
        className="btn btn--primary"
        style={{ width: '100%' }}
        onClick={onSave}
        disabled={saving}
        aria-busy={saving}
        aria-label="Save this commute result to your history"
      >
        {saving ? (
          <>
            <span
              style={{
                display: 'inline-block',
                width: '16px',
                height: '16px',
                border: '2px solid currentColor',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                marginRight: 'var(--space-2)',
              }}
              aria-hidden="true"
            />
            Saving...
          </>
        ) : (
          '💾 Save to My History'
        )}
      </button>
    </div>
  );
}

// ── Main CommutePage ─────────────────────────────────────────────────────────
/**
 * Commute Carbon Calculator page.
 * Integrates with Google Maps Directions API via backend proxy.
 *
 * @returns {React.ReactElement}
 */
export default function CommutePage() {
  const { user } = useAuth();
  const uid = useId();

  const [origin, setOrigin]         = useState('');
  const [destination, setDest]      = useState('');
  const [mode, setMode]             = useState('DRIVING');
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState('');
  const [saved, setSaved]           = useState(false);

  const resultRef = useRef(null);

  const handleCalculate = useCallback(
    async (e) => {
      e.preventDefault();
      setError('');
      setResult(null);
      setSaved(false);

      if (!origin.trim() || !destination.trim()) {
        setError('Please enter both origin and destination addresses.');
        return;
      }

      setLoading(true);
      try {
        const API = import.meta.env.VITE_API_BASE_URL || '';
        const token = await user.getIdToken();
        const resp = await fetch(`${API}/api/commute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ origin: origin.trim(), destination: destination.trim(), travelMode: mode }),
        });

        const json = await resp.json();
        if (!resp.ok || !json.success) {
          throw new Error(json.message || 'Failed to calculate commute emissions.');
        }
        setResult(json.data);
        // Scroll result into view after render
        setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
      } catch (err) {
        setError(err.message || 'Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [origin, destination, mode, user]
  );

  const handleSave = useCallback(async () => {
    if (!result) return;
    setSaving(true);
    try {
      const API = import.meta.env.VITE_API_BASE_URL || '';
      const token = await user.getIdToken();
      await fetch(`${API}/api/commute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          origin: origin.trim(),
          destination: destination.trim(),
          travelMode: mode,
          saveRecord: true,
          userId: user.uid,
        }),
      });
      setSaved(true);
    } catch {
      // Non-critical — show gentle error
      setError('Could not save result. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [result, origin, destination, mode, user]);

  const originId      = `${uid}-origin`;
  const destId        = `${uid}-dest`;
  const modeGroupId   = `${uid}-mode`;

  return (
    <section aria-labelledby="commute-heading">
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1
          id="commute-heading"
          className="gradient-text"
          style={{ fontSize: 'var(--text-3xl)', fontWeight: 'var(--font-extrabold)' }}
        >
          🚗 Commute Carbon Tracker
        </h1>
        <p className="text-muted" style={{ marginTop: 'var(--space-2)' }}>
          Enter your route and travel mode to calculate your daily CO₂ footprint.
          Powered by Google Maps Directions API.
        </p>
      </div>

      {/* ── Form card ── */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <form onSubmit={handleCalculate} noValidate aria-label="Commute calculator form">
          {/* Origin */}
          <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
            <label className="form-label" htmlFor={originId}>
              📍 Origin Address
            </label>
            <input
              id={originId}
              type="text"
              className="form-input"
              placeholder="e.g. 1600 Amphitheatre Parkway, Mountain View, CA"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              autoComplete="street-address"
              required
              aria-required="true"
              aria-describedby={error ? `${uid}-error` : undefined}
            />
          </div>

          {/* Destination */}
          <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
            <label className="form-label" htmlFor={destId}>
              🏁 Destination Address
            </label>
            <input
              id={destId}
              type="text"
              className="form-input"
              placeholder="e.g. San Francisco City Hall, CA"
              value={destination}
              onChange={(e) => setDest(e.target.value)}
              autoComplete="off"
              required
              aria-required="true"
            />
          </div>

          {/* Travel mode */}
          <fieldset style={{ border: 'none', padding: 0, margin: 0, marginBottom: 'var(--space-6)' }}>
            <legend
              id={modeGroupId}
              className="form-label"
              style={{ display: 'block', marginBottom: 'var(--space-3)' }}
            >
              🚦 Travel Mode
            </legend>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 'var(--space-3)',
              }}
              role="radiogroup"
              aria-labelledby={modeGroupId}
            >
              {TRAVEL_MODES.map(({ value, label, badge, color }) => {
                const modeId = `${uid}-mode-${value}`;
                const isSelected = mode === value;
                return (
                  <label
                    key={value}
                    htmlFor={modeId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-lg)',
                      border: isSelected
                        ? '2px solid var(--color-brand-400)'
                        : '2px solid var(--border-subtle)',
                      background: isSelected
                        ? 'hsla(166,76%,20%,0.3)'
                        : 'var(--bg-tertiary)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      userSelect: 'none',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <input
                        id={modeId}
                        type="radio"
                        name={`${uid}-travelmode`}
                        value={value}
                        checked={isSelected}
                        onChange={() => setMode(value)}
                        style={{ accentColor: 'var(--color-brand-400)' }}
                      />
                      <span style={{ fontWeight: isSelected ? 'var(--font-semibold)' : 'var(--font-normal)' }}>
                        {label}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background:
                          color === 'success'
                            ? 'hsla(142,71%,20%,0.5)'
                            : color === 'warning'
                            ? 'hsla(38,92%,20%,0.5)'
                            : 'hsla(0,84%,20%,0.5)',
                        color:
                          color === 'success'
                            ? 'var(--color-success-400)'
                            : color === 'warning'
                            ? 'var(--color-warning-400)'
                            : 'var(--color-danger-400)',
                      }}
                    >
                      {badge}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Error */}
          {error && (
            <div
              id={`${uid}-error`}
              role="alert"
              aria-live="assertive"
              style={{
                background: 'hsla(0,84%,20%,0.3)',
                border: '1px solid hsla(0,84%,55%,0.4)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3) var(--space-4)',
                marginBottom: 'var(--space-4)',
                color: 'var(--color-danger-400)',
                fontSize: 'var(--text-sm)',
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="btn btn--primary"
            style={{ width: '100%' }}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? (
              <>
                <span
                  style={{
                    display: 'inline-block',
                    width: '16px',
                    height: '16px',
                    border: '2px solid currentColor',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                    marginRight: 'var(--space-2)',
                    verticalAlign: 'middle',
                  }}
                  aria-hidden="true"
                />
                Calculating via Google Maps...
              </>
            ) : (
              '📍 Calculate Emissions'
            )}
          </button>
        </form>
      </div>

      {/* ── Result card ── */}
      <div ref={resultRef}>
        {result && (
          <>
            {saved && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  background: 'hsla(142,71%,20%,0.3)',
                  border: '1px solid var(--color-success-400)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3) var(--space-4)',
                  marginBottom: 'var(--space-4)',
                  color: 'var(--color-success-400)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                ✅ Saved to your history!
              </div>
            )}
            <ResultCard result={result} onSave={handleSave} saving={saving} />
          </>
        )}
      </div>

      {/* ── Emission factor info ── */}
      <div
        className="card"
        style={{
          marginTop: 'var(--space-6)',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <h2
          style={{
            fontSize: 'var(--text-base)',
            fontWeight: 'var(--font-semibold)',
            marginBottom: 'var(--space-3)',
            color: 'var(--text-secondary)',
          }}
        >
          ℹ️ Emission Factors (IPCC / EPA)
        </h2>
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          {[
            { mode: '🚗 Driving (petrol)',  factor: '0.210 kg CO₂e / km' },
            { mode: '🚌 Bus transit',       factor: '0.089 kg CO₂e / km' },
            { mode: '🚴 Cycling (e-bike)',  factor: '0.005 kg CO₂e / km' },
            { mode: '🚶 Walking',           factor: '0.000 kg CO₂e / km' },
          ].map(({ mode: m, factor }) => (
            <li
              key={m}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-muted)',
              }}
            >
              <span>{m}</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{factor}</span>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ marginTop: 'var(--space-6)' }}>
        <Link to="/" className="btn btn--ghost">
          ← Back to Dashboard
        </Link>
      </div>
    </section>
  );
}
