/**
 * @fileoverview Accessible loading spinner component.
 * Communicates loading state visually and to assistive technologies.
 */

import React from 'react';

/**
 * @typedef {'sm'|'md'|'lg'} SpinnerSize
 */

/**
 * Renders an animated loading spinner with an accessible label.
 *
 * @param {object} props
 * @param {SpinnerSize} [props.size='md'] - Spinner size variant.
 * @param {string} [props.label='Loading...'] - Screen-reader text describing the loading state.
 * @param {string} [props.className] - Additional CSS class names.
 * @returns {React.ReactElement}
 */
export default function LoadingSpinner({ size = 'md', label = 'Loading...', className = '' }) {
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

LoadingSpinner.propTypes = {
  size: (props, propName) => {
    const valid = ['sm', 'md', 'lg'];
    if (props[propName] && !valid.includes(props[propName])) {
      return new Error(`size must be one of: ${valid.join(', ')}`);
    }
    return null;
  },
  label: (props, propName) => {
    if (props[propName] && typeof props[propName] !== 'string') {
      return new Error('label must be a string');
    }
    return null;
  },
  className: (props, propName) => {
    if (props[propName] && typeof props[propName] !== 'string') {
      return new Error('className must be a string');
    }
    return null;
  },
};
