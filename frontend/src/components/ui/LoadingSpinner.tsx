/**
 * @fileoverview Accessible loading spinner component.
 * Communicates loading state visually and to assistive technologies.
 */



/**
 * @typedef {'sm'|'md'|'lg'} SpinnerSize
 */

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

/**
 * Renders an animated loading spinner with an accessible label.
 *
 * @returns {React.ReactElement}
 */
export default function LoadingSpinner({ size = 'md', label = 'Loading...', className = '' }: LoadingSpinnerProps) {
  return (
    <div
      className={`flex flex-col items-center gap-4 ${className}`}
      role="status"
      aria-label={label}
    >
      <div className={`spinner spinner--${size}`} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      {size === 'lg' && (
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-muted)',
            animation: 'pulse 2s ease-in-out infinite',
          }}
          aria-hidden="true"
        >
          {label}
        </p>
      )}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
