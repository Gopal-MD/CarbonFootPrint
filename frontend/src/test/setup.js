/**
 * @fileoverview Vitest global test setup.
 * Configures jest-dom matchers and global mocks for Firebase and browser APIs.
 */

import '@testing-library/jest-dom';
import { vi } from 'vitest';

// ── Mock Firebase ──────────────────────────────────────────────────────────
vi.mock('../firebase.js', () => ({
  app: {},
  auth: {
    currentUser: null,
    onAuthStateChanged: vi.fn((callback) => {
      callback(null);
      return vi.fn(); // unsubscribe
    }),
  },
  db: {},
}));

// ── Mock window.matchMedia (not available in jsdom) ───────────────────────
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ── Mock IntersectionObserver ─────────────────────────────────────────────
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// ── Mock ResizeObserver ───────────────────────────────────────────────────
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// ── Mock scrollIntoView (not available in jsdom) ────────────────────────
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}

// ── Silence console.error for known React warnings in tests ──────────────
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render') ||
        args[0].includes('Warning: An update to') ||
        args[0].includes('act('))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
