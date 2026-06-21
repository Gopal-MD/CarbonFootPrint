/**
 * @fileoverview Structured logging utility using Winston.
 *
 * Provides a singleton logger instance configured for the application environment:
 * - Development: colorized, human-readable console output
 * - Production: structured JSON output (compatible with Cloud Logging)
 *
 * @module utils/logger
 */

import { createLogger, format, transports } from 'winston';

const { combine, timestamp, errors, json, colorize, printf, splat } = format;

/**
 * Custom log format for development: colorized with timestamp and stack traces.
 */
const developmentFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  splat(),
  printf((info) => {
    const level = typeof info.level === 'string' ? info.level : '';
    const message = typeof info.message === 'string' ? info.message : '';
    const ts = typeof info.timestamp === 'string' ? info.timestamp : '';
    const stack = typeof info.stack === 'string' ? info.stack : '';

    const meta: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(info)) {
      if (key !== 'level' && key !== 'message' && key !== 'timestamp' && key !== 'stack') {
        meta[key] = val;
      }
    }
    const metaStr = Object.keys(meta).length > 0 ? `\n${JSON.stringify(meta, null, 2)}` : '';
    const stackStr = stack ? `\n${stack}` : '';
    return `${ts} [${level}] ${message}${metaStr}${stackStr}`;
  })
);

/**
 * Production log format: structured JSON for Cloud Logging ingestion.
 * Maps Winston levels to Google Cloud severity levels.
 */
const productionFormat = combine(
  timestamp(),
  errors({ stack: true }),
  splat(),
  json(),
  // Map Winston level to Cloud Logging severity
  format((info) => {
    const severityMap: Record<string, string> = {
      error: 'ERROR',
      warn: 'WARNING',
      info: 'INFO',
      http: 'INFO',
      verbose: 'DEBUG',
      debug: 'DEBUG',
      silly: 'DEBUG',
    };
    info.severity = severityMap[info.level] || 'DEFAULT';
    return info;
  })()
);

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Winston logger instance.
 *
 * Usage:
 * ```js
 * import logger from './utils/logger.js';
 * logger.info('Server started on port %d', port);
 * logger.error('Database connection failed', { error: err.message });
 * logger.warn('Rate limit reached for IP %s', ip);
 * ```
 *
 * @type {import('winston').Logger}
 */
const logger = createLogger({
  level: isProduction ? 'info' : 'debug',
  format: isProduction ? productionFormat : developmentFormat,
  transports: [
    new transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
  exitOnError: false,
});

/**
 * Creates a child logger with a fixed module prefix for easier log filtering.
 *
 * @param {string} moduleName - Name of the module (e.g., 'AIServiceManager').
 * @returns {import('winston').Logger} Child logger with module context.
 *
 * @example
 * const log = createModuleLogger('AIServiceManager');
 * log.info('Gemini request sent'); // → "[AIServiceManager] Gemini request sent"
 */
export function createModuleLogger(moduleName: string) {
  return logger.child({ module: moduleName });
}

export default logger;
