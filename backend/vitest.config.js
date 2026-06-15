import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for backend unit and integration tests.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      // NOTE: Thresholds will be raised to 80%+ in Step 4
      // once route, service, and integration tests are added.
      // Current Step 1 coverage: withRetry utility only.
      thresholds: {
        lines: 5,
        functions: 20,
        branches: 60,
        statements: 5,
      },
      exclude: [
        'node_modules/',
        'tests/',
        'types/',
        '*.config.*',
      ],
    },
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    testTimeout: 10000,
  },
});
