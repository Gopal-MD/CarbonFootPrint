import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for backend unit and integration tests.
 *
 * Coverage targets (CI will fail below these thresholds):
 * - Lines:      ≥80%
 * - Functions:  ≥80%
 * - Branches:   ≥75%
 * - Statements: ≥80%
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 80,
        functions: 85,
        branches: 75,
        statements: 80,
      },
      exclude: [
        'node_modules/',
        'tests/',
        'types/',
        '*.config.*',
        'dist/',
        'check-deployment.js',
        'test-live-apis.js',
        'test-live-bundle.js',
        // Exclude openapi.ts from coverage (large static config)
        'utils/openapi.ts',
        // Exclude server.ts (starts listening and handles process signals)
        'server.ts',
      ],
    },
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    testTimeout: 15000,
  },
});
