import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for backend unit and integration tests.
 *
 * Coverage targets (CI will fail below these thresholds):
 * - Lines:      ≥90%
 * - Functions:  ≥90%
 * - Branches:   ≥80%
 * - Statements: ≥90%
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
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90,
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
        // Exclude DTO and interface files — type-only, no runtime logic
        'dto/',
        'interfaces/',
      ],
    },
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    testTimeout: 15000,
  },
});
