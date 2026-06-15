/**
 * @fileoverview Dashboard page — main landing page after authentication.
 * Displays an overview of the user's carbon footprint metrics.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@context/AuthContext';
import { getCarbonCategory, formatEmissions } from '@utils/carbonCalc.js';

/** Placeholder monthly CO₂ data for demonstration (will be replaced by Firestore data) */
const PLACEHOLDER_STATS = {
  monthlyKgCO2e: 142.5,
  commuteKg: 48.3,
  utilityKg: 78.2,
  previousMonthKg: 165.1,
};

/**
 * Dashboard page component.
 * Shows carbon footprint summary, quick-action cards, and progress toward goal.
 *
 * @returns {React.ReactElement}
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const stats = PLACEHOLDER_STATS;

  const category = useMemo(() => getCarbonCategory(stats.monthlyKgCO2e), [stats.monthlyKgCO2e]);
  const totalFormatted = useMemo(() => formatEmissions(stats.monthlyKgCO2e), [stats.monthlyKgCO2e]);
  const deltaKg = useMemo(
    () => stats.monthlyKgCO2e - stats.previousMonthKg,
    [stats.monthlyKgCO2e, stats.previousMonthKg]
  );
  const deltaPercent = useMemo(
    () => (deltaKg / stats.previousMonthKg) * 100,
    [deltaKg, stats.previousMonthKg]
  );
  const goalProgress = useMemo(
    () => Math.min(100, Math.round((stats.monthlyKgCO2e / 200) * 100)),
    [stats.monthlyKgCO2e]
  );

  const globalAvg = 400;
  const isBelowAvg = stats.monthlyKgCO2e < globalAvg;
  const avgComparisonPercent = Math.abs(Math.round(((globalAvg - stats.monthlyKgCO2e) / globalAvg) * 100));

  return (
    <section aria-labelledby="dashboard-heading">
      {/* ── Page heading ── */}
      <div className="mb-6">
        <h1 id="dashboard-heading" className="gradient-text" style={{ fontSize: 'var(--text-3xl)', fontWeight: 'var(--font-extrabold)' }}>
          Welcome back, {user?.displayName || 'Eco Warrior'} 🌿
        </h1>
        <p className="text-muted mt-4" style={{ fontSize: 'var(--text-base)' }}>
          Here&apos;s your carbon footprint overview for this month.
        </p>
      </div>

      {/* ── Above-the-fold comparison banner ── */}
      <div 
        className="card mb-6" 
        style={{ 
          background: isBelowAvg ? 'hsla(142,71%,15%,0.3)' : 'hsla(0,71%,15%,0.3)',
          border: `1px solid ${isBelowAvg ? 'var(--color-success-600)' : 'var(--color-danger-600)'}`,
          padding: 'var(--space-4)',
          borderRadius: 'var(--border-radius-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)'
        }}
      >
        <span style={{ fontSize: 'var(--text-2xl)' }}>{isBelowAvg ? '🌟' : '⚠️'}</span>
        <div>
          <p style={{ fontWeight: 'var(--font-semibold)', margin: 0 }}>
            {isBelowAvg 
              ? `Great job! Your current footprint is ${avgComparisonPercent}% below the global average.` 
              : `Heads up! Your current footprint is ${avgComparisonPercent}% above the global average.`
            }
          </p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0 }}>
            Global average benchmark: {globalAvg} kg CO₂e/month. Keep tracking to stay on target!
          </p>
        </div>
      </div>

      {/* ── Hero stat card ── */}
      <div
        className="card gradient-hero mb-6"
        style={{
          background: 'linear-gradient(135deg, hsla(166,76%,27%,0.4), hsla(217,91%,55%,0.1))',
          border: '1px solid var(--glass-border)',
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-1)' }}>
              Monthly Carbon Footprint
            </p>
            <div className="flex items-center gap-4">
              <p
                className="stat-value gradient-text"
                aria-label={`${totalFormatted.value} ${totalFormatted.unit} this month`}
              >
                {totalFormatted.value}
                <span style={{ fontSize: 'var(--text-2xl)', marginLeft: 'var(--space-2)' }}>
                  {totalFormatted.unit}
                </span>
              </p>
            </div>
          </div>
          <span className={`badge ${category.colorClass}`} aria-label={`Carbon level: ${category.label}`}>
            {category.label}
          </span>
        </div>

        <p
          className={`stat-delta stat-delta--${deltaKg < 0 ? 'positive' : 'negative'}`}
          aria-label={`${Math.abs(deltaPercent).toFixed(1)}% ${deltaKg < 0 ? 'decrease' : 'increase'} from last month`}
        >
          <span aria-hidden="true">{deltaKg < 0 ? '▼' : '▲'}</span>
          {Math.abs(deltaPercent).toFixed(1)}% vs last month
        </p>

        {/* Goal progress */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Monthly Goal (200 kg CO₂e)
            </p>
            <p className="text-sm font-semibold">{goalProgress}%</p>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuenow={goalProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${goalProgress}% of monthly carbon goal used`}
          >
            <div
              className="progress-bar"
              style={{
                width: `${goalProgress}%`,
                background: goalProgress > 80
                  ? 'linear-gradient(90deg, var(--color-warning-500), var(--color-danger-500))'
                  : undefined,
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Gamification / Streak Card ── */}
      <div
        className="card mb-6"
        style={{
          background: 'linear-gradient(135deg, hsla(142,71%,15%,0.15), hsla(166,76%,15%,0.1))',
          border: '1px solid var(--color-success-600)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          padding: 'var(--space-5)',
        }}
        role="region"
        aria-label="Gamification and Streaks"
      >
        <h2
          style={{
            fontSize: 'var(--text-lg)',
            fontWeight: 'var(--font-bold)',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            color: 'var(--color-success-400)',
          }}
        >
          🔥 Carbon Reduction Streak
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '0 0 var(--space-1) 0' }}>
              Current Streak
            </p>
            <p
              className="gradient-text"
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 'var(--font-extrabold)',
                margin: 0,
              }}
            >
              5 days
            </p>
          </div>
          <div style={{ width: '1px', height: '40px', background: 'var(--border-subtle)' }} />
          <div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '0 0 var(--space-1) 0' }}>
              Best Streak
            </p>
            <p style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', margin: 0, color: 'var(--text-primary)' }}>
              12 days 🏆
            </p>
          </div>
          <div style={{ width: '1px', height: '40px', background: 'var(--border-subtle)' }} />
          <div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '0 0 var(--space-1) 0' }}>
              Total CO₂ Saved
            </p>
            <p style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', margin: 0, color: 'var(--color-brand-300)' }}>
              22.4 kg 🌿
            </p>
          </div>
        </div>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>
          Track daily or scan utility bills to keep your green streak alive and earn badges!
        </p>
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 mb-6" role="list" aria-label="Emissions breakdown">
        <div className="card stat-card" role="listitem">
          <p className="text-sm text-muted">🚗 Commute Emissions</p>
          <p className="stat-value" aria-label={`${stats.commuteKg} kilograms CO2 equivalent from commuting`}>
            {stats.commuteKg}
            <span style={{ fontSize: 'var(--text-lg)', color: 'var(--text-secondary)', marginLeft: 'var(--space-2)' }}>
              kg
            </span>
          </p>
          <Link to="/commute" className="btn btn--ghost btn--sm" aria-label="Go to commute tracker to update">
            Update →
          </Link>
        </div>

        <div className="card stat-card" role="listitem">
          <p className="text-sm text-muted">⚡ Utility Emissions</p>
          <p className="stat-value" aria-label={`${stats.utilityKg} kilograms CO2 equivalent from utilities`}>
            {stats.utilityKg}
            <span style={{ fontSize: 'var(--text-lg)', color: 'var(--text-secondary)', marginLeft: 'var(--space-2)' }}>
              kg
            </span>
          </p>
          <Link to="/scan" className="btn btn--ghost btn--sm" aria-label="Go to bill scanner to update utility data">
            Scan Bill →
          </Link>
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div className="card">
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)' }}>
          Quick Actions
        </h2>
        <div className="grid grid-cols-3">
          <Link to="/commute" className="btn btn--secondary" aria-label="Calculate commute carbon emissions">
            🚗 Track Commute
          </Link>
          <Link to="/scan" className="btn btn--secondary" aria-label="Scan utility bill for energy usage">
            📄 Scan Bill
          </Link>
          <Link to="/insights" className="btn btn--primary" aria-label="Get AI-powered eco insights">
            🌿 Get AI Insights
          </Link>
        </div>
      </div>
    </section>
  );
}
