/**
 * @fileoverview Standardized API response helpers.
 *
 * Provides typed helper functions for consistent JSON response envelopes
 * across all Express route handlers. Eliminates ad-hoc response construction.
 *
 * @module utils/apiResponse
 */

import { Response } from 'express';
import { Result } from 'express-validator';

export interface SuccessOptions {
  message?: string;
  statusCode?: number;
}

/**
 * Sends a standardized success response.
 *
 * @param res - Express response object.
 * @param data - The response payload.
 * @param options - Response options.
 * @returns The Express Response.
 */
export function sendSuccess(res: Response, data: any, options: SuccessOptions = {}): Response {
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
export function sendError(res: Response, error: string, message: string, statusCode = 500, details?: any[]): Response {
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
export function sendValidationError(res: Response, validationResult: Result<any>, context = 'Input'): Response {
  return sendError(
    res,
    'VALIDATION_ERROR',
    `Invalid ${context} — see details for field-level errors.`,
    422,
    validationResult.array().map((e: any) => ({ field: e.path || e.param, message: e.msg }))
  );
}
