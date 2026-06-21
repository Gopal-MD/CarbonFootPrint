/**
 * @fileoverview Centralized error handling middleware.
 *
 * Converts all thrown errors into consistent, structured JSON error responses.
 * Extracted from server.ts for testability and single-responsibility compliance.
 *
 * Error precedence:
 * 1. CORS errors → 403
 * 2. JSON parse failures → 400
 * 3. Payload too large → 413
 * 4. Errors with explicit statusCode/status → use that code
 * 5. Everything else → 500
 *
 * @module middleware/errorHandler
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';
import { isProduction } from '../utils/validateEnv.js';

/**
 * Shape of application errors that carry extra context.
 */
export interface AppError extends Error {
  /** HTTP status code to return (preferred over status). */
  statusCode?: number;
  /** HTTP status code (fallback, e.g. from http-errors). */
  status?: number;
  /** Express body-parser error type (e.g. 'entity.parse.failed'). */
  type?: string;
  /** Whether the error occurred after all retry attempts were exhausted. */
  retriesExhausted?: boolean;
  /** Name of the operation that produced this error. */
  operationName?: string;
}

/**
 * Express 4-argument error handling middleware.
 * Must be registered AFTER all routes in server.ts.
 *
 * @param err - The thrown error, possibly enriched with AppError fields.
 * @param req - Incoming request (used for logging context).
 * @param res - Express response object.
 * @param _next - Next middleware (unused; required by Express error handler signature).
 * @returns JSON error response.
 */
export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void | Response {
  // Log with full context
  logger.error('[GlobalErrorHandler]', {
    message: err.message,
    stack: isProduction() ? undefined : err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    retriesExhausted: err.retriesExhausted,
    operationName: err.operationName,
  });

  // ── CORS errors ──────────────────────────────────────────────────────────────
  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({
      success: false,
      error: 'CORS_ERROR',
      message: err.message,
      statusCode: 403,
    });
  }

  // ── Malformed JSON body ──────────────────────────────────────────────────────
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'INVALID_JSON',
      message: 'Request body contains invalid JSON.',
      statusCode: 400,
    });
  }

  // ── Request body too large ───────────────────────────────────────────────────
  if (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413) {
    return res.status(413).json({
      success: false,
      error: 'PAYLOAD_TOO_LARGE',
      message: 'Request body exceeds the maximum allowed size of 15 MB.',
      statusCode: 413,
    });
  }

  // ── Generic / unknown error ──────────────────────────────────────────────────
  const statusCode = err.statusCode ?? err.status ?? 500;
  return res.status(statusCode).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: isProduction()
      ? 'An unexpected error occurred. Please try again later.'
      : err.message,
    statusCode,
  });
}
