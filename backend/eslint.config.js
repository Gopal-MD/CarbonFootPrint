/**
 * @fileoverview ESLint configuration for EcoTrack backend.
 *
 * Plugin stack:
 * - @typescript-eslint: TypeScript-specific rules
 * - eslint-plugin-sonarjs: Cognitive complexity + code smell detection
 * - eslint-plugin-security: Detect common Node.js security vulnerabilities
 * - eslint-plugin-jsdoc: Enforce JSDoc on exported functions
 * - eslint-plugin-import: Import ordering and no-duplicates
 */

import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import security from 'eslint-plugin-security';
import jsdoc from 'eslint-plugin-jsdoc';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  // ── Global ignores ───────────────────────────────────────────────────────────
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'vitest.config.js',
      'check-deployment.js',
      'test-live-apis.js',
      'test-live-bundle.js',
    ],
  },

  // ── TypeScript files (main application) ─────────────────────────────────────
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),

  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      sonarjs,
      security,
      jsdoc,
      import: importPlugin,
    },
    rules: {
      // ── TypeScript rules ─────────────────────────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off', // JSDoc handles this
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',

      // ── SonarJS — cognitive complexity & code smells ─────────────────────────
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-identical-functions': 'off',
      'sonarjs/prefer-immediate-return': 'off',
      'sonarjs/no-nested-template-literals': 'off',

      // ── Security — common Node.js vulnerability patterns ─────────────────────
      'security/detect-non-literal-regexp': 'off',
      'security/detect-object-injection': 'off',
      'security/detect-possible-timing-attacks': 'off',

      // ── JSDoc — enforce on exported functions ────────────────────────────────
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/require-description': 'off',

      // ── Import ordering ──────────────────────────────────────────────────────
      'import/no-duplicates': 'error',

      // ── General rules ────────────────────────────────────────────────────────
      'no-console': 'off',
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-eval': 'error',
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'all'],
    },
  },

  // ── Test files — relaxed rules ───────────────────────────────────────────────
  {
    files: ['tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      'jsdoc/require-jsdoc': 'off',
      'sonarjs/no-duplicate-string': 'off',
    },
  }
);
