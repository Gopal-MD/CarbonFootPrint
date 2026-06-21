/**
 * @fileoverview Application configuration model and environment loader.
 *
 * Provides swappable settings for DI patterns and testing environments.
 *
 * @module config
 */

export interface AppConfig {
  GEMINI_STUB: boolean;
  VISION_STUB: boolean;
  MAPS_STUB: boolean;
  GOOGLE_GEMINI_API_KEY?: string;
  GOOGLE_MAPS_API_KEY?: string;
  PORT: number;
  LOG_LEVEL: string;
}

/**
 * Loads application configuration from environment variables.
 *
 * @returns Config settings object.
 */
export function getConfig(): AppConfig {
  return {
    GEMINI_STUB: process.env.GEMINI_STUB === 'true',
    VISION_STUB: process.env.VISION_STUB === 'true',
    MAPS_STUB: process.env.MAPS_STUB === 'true',
    GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY,
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
    PORT: parseInt(process.env.PORT || '8080', 10),
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  };
}

/**
 * Constant configuration for tests to suppress noise and disable remote calls.
 */
export const TEST_CONFIG: AppConfig = {
  GEMINI_STUB: true,
  VISION_STUB: true,
  MAPS_STUB: true,
  GOOGLE_GEMINI_API_KEY: 'test-key',
  GOOGLE_MAPS_API_KEY: 'test-key',
  PORT: 8080,
  LOG_LEVEL: 'error',
};
