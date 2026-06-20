/**
 * @fileoverview Standardized API response helpers.
 *
 * Provides typed helper functions for consistent JSON response envelopes
 * across all Express route handlers. Eliminates ad-hoc response construction.
 *
 * @module utils/apiResponse
 */

import { Response } from 'express';
import type { Result, ValidationError } from 'express-validator';

/** Options for the sendSuccess helper. */
export interface SuccessOptions {
  message?: string;
  statusCode?: number;
}

/** A normalized field-level validation error returned in 422 responses. */
export interface ValidationErrorDetail {
  field: string;
  message: string;
}

/**
 * Sends a standardized success response.
 *
 * @param res - Express response object.
 * @param data - The response payload (any JSON-serializable value).
 * @param options - Response options.
 * @returns The Express Response.
 */
export function sendSuccess(res: Response, data: unknown, options: SuccessOptions = {}): Response {
  const { message, statusCode = 200 } = options;
  return res.status(statusCode).json({
    success: true,
    data,
    ...(message && { message }),
    statusCode,
  });
}

/**
 * Sends a standardized error response.
 *
 * @param res - Express response object.
 * @param error - Error type identifier (e.g., 'VALIDATION_ERROR').
 * @param message - Human-readable error description.
 * @param statusCode - HTTP status code.
 * @param details - Field-level error details.
 * @returns The Express Response.
 */
export function sendError(
  res: Response,
  error: string,
  message: string,
  statusCode = 500,
  details?: ValidationErrorDetail[]
): Response {
  return res.status(statusCode).json({
    success: false,
    error,
    message,
    ...(details && { details }),
    statusCode,
  });
}

/**
 * Sends a 422 Unprocessable Entity response from express-validator errors.
 *
 * @param res - Express response.
 * @param validationResult - Result from validationResult(req).
 * @param context - Context label for the error message.
 * @returns The Express Response.
 */
export function sendValidationError(
  res: Response,
  validationResult: Result<ValidationError>,
  context = 'Input'
): Response {
  const details: ValidationErrorDetail[] = validationResult.array().map((e: ValidationError) => ({
    field: ('path' in e ? e.path : '') || ('param' in e ? (e as { param?: string }).param : '') || 'unknown',
    message: e.msg as string,
  }));

  return sendError(
    res,
    'VALIDATION_ERROR',
    `Invalid ${context} — see details for field-level errors.`,
    422,
    details
  );
}
