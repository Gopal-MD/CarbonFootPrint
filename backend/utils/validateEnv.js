/**
 * @fileoverview Environment variable validation utility.
 *
 * Validates that all required environment variables are present and non-empty.
 * Called at server startup with a fail-fast strategy — the process exits
 * immediately if any critical variable is missing, preventing partial
 * initialization with broken external services.
 *
 * @module utils/validateEnv
 */

/**
 * Required environment variable definitions.
 * Each entry specifies the variable name and a human-readable description
 * to include in the startup error message.
 *
 * @typedef {object} EnvVarDefinition
 * @property {string} name - Environment variable name.
 * @property {string} description - Human-readable description for error messages.
 */

/** @type {EnvVarDefinition[]} */
const REQUIRED_ENV_VARS = [
  {
    name: 'GOOGLE_GEMINI_API_KEY',
    description: 'Google Gemini API key (get from https://aistudio.google.com/app/apikey)',
  },
  {
    name: 'GOOGLE_MAPS_API_KEY',
    description: 'Google Maps API key with Directions API enabled',
  },
  {
    name: 'GOOGLE_CLOUD_PROJECT_ID',
    description: 'Google Cloud project ID for Vision API',
  },
  {
    name: 'FIREBASE_SERVICE_ACCOUNT_JSON',
    description: 'Firebase Admin service account JSON (from Firebase Console > Project Settings > Service Accounts)',
  },
];

/**
 * Validates all required environment variables are present and non-empty.
 * Throws a descriptive error and exits the process if any are missing.
 *
 * This function MUST be called before any other module initialization
 * (before Express, Firebase, or Google API clients are created).
 *
 * @returns {void}
 * @throws {Error} If one or more required environment variables are missing.
 *                 The error message lists all missing variables with descriptions.
 *
 * @example
 * // In server.js — first line before imports
 * import { validateEnv } from './utils/validateEnv.js';
 * validateEnv(); // Exits process if any required var is missing
 */
export function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter(
    ({ name }) => !process.env[name] || process.env[name].trim() === ''
  );

  if (missing.length === 0) {
    return; // All required variables present
  }

  const lines = missing.map(
    ({ name, description }) => `  • ${name}\n      → ${description}`
  );

  const errorMessage = [
    '',
    '╔══════════════════════════════════════════════════════════════════╗',
    '║     STARTUP FAILURE: Missing Required Environment Variables      ║',
    '╚══════════════════════════════════════════════════════════════════╝',
    '',
    'The following required environment variables are not set:',
    '',
    ...lines,
    '',
    'To fix: copy backend/.env.example to backend/.env and fill in the values.',
    '',
  ].join('\n');

  console.error(errorMessage);

  // Exit with non-zero code to signal failure to Cloud Run / container orchestrators
  process.exit(1);
}

/**
 * Returns the value of an environment variable, with an optional default.
 * Provides a typed, documented way to access env vars in application code.
 *
 * @param {string} name - Environment variable name.
 * @param {string} [defaultValue=''] - Default value if the variable is not set.
 * @returns {string} The variable's value or the default.
 *
 * @example
 * const port = getEnv('PORT', '8080');
 * const nodeEnv = getEnv('NODE_ENV', 'development');
 */
export function getEnv(name, defaultValue = '') {
  return process.env[name] ?? defaultValue;
}

/**
 * Returns true if the application is running in production mode.
 *
 * @returns {boolean}
 */
export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Returns true if a feature stub flag is enabled.
 * Used to bypass external APIs during local development/testing.
 *
 * @param {'MAPS'|'GEMINI'|'VISION'} service - The service name.
 * @returns {boolean}
 */
export function isStubEnabled(service) {
  return process.env[`${service}_STUB`] === 'true';
}
