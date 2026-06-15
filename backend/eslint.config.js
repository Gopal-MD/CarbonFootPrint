import js from '@eslint/js';

export default [
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
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'readonly',
        module: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'http'] }],
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-eval': 'error',
    },
  },
];
