/**
 * ESLint Flat Config — Enterprise-grade rules for the Carbon Footprint Platform frontend.
 * Extends: eslint:recommended + react + react-hooks + jsx-a11y (strict)
 *
 * @see https://eslint.org/docs/latest/use/configure/configuration-files-new
 */

import js from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';

export default [
  // ── Global ignores ───────────────────────────────────────────────────────
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      '*.config.js',
      'vite.config.js',
      'test-live-*.js',
    ],
  },

  // ── Base JavaScript rules ────────────────────────────────────────────────
  js.configs.recommended,

  // ── React + Hooks + A11y rules ───────────────────────────────────────────
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'jsx-a11y': jsxA11yPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        FileReader: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        AbortController: 'readonly',
        File: 'readonly',
        requestAnimationFrame: 'readonly',
        // Vite env
        import: 'readonly',
      },
    },
    rules: {
      // ── React core ──────────────────────────────────────────────────────
      ...reactPlugin.configs.recommended.rules,
      'react/prop-types': 'error',
      'react/display-name': 'error',
      'react/no-array-index-key': 'warn',
      'react/no-danger': 'error',
      'react/no-deprecated': 'error',
      'react/self-closing-comp': 'error',
      'react/jsx-no-useless-fragment': 'error',
      'react/jsx-curly-brace-presence': ['error', { props: 'never', children: 'never' }],
      // React 18 — new JSX transform (no need to import React)
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',

      // ── React Hooks ─────────────────────────────────────────────────────
      ...reactHooksPlugin.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error', // Prevents cascading renders

      // ── Accessibility (WCAG 2.1 AA) ─────────────────────────────────────
      ...jsxA11yPlugin.configs.strict.rules,
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/interactive-supports-focus': 'error',
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/no-autofocus': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'error',

      // ── Code quality ─────────────────────────────────────────────────────
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
      'no-duplicate-imports': 'error',
      eqeqeq: ['error', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      curly: ['error', 'all'],
      'default-case': 'error',
      'no-fallthrough': 'error',
    },
  },

  // ── Test file overrides ──────────────────────────────────────────────────
  {
    files: ['src/**/*.{test,spec}.{js,jsx}', 'src/test/**/*.{js,jsx}'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
        global: 'readonly',
        File: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'react/prop-types': 'off',
    },
  },

  // ── Playwright E2E overrides ─────────────────────────────────────────────
  {
    files: ['playwright/**/*.{js,ts}'],
    languageOptions: {
      globals: {
        page: 'readonly',
        browser: 'readonly',
        context: 'readonly',
        window: 'readonly',
        document: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
];
