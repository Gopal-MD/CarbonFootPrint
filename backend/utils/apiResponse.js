/**
 * @fileoverview Standardized API response helpers.
 *
 * Provides typed helper functions for consistent JSON response envelopes
 * across all Express route handlers. Eliminates ad-hoc response construction.
 *
 * @module utils/apiResponse
 */

/**
 * Sends a standardized success response.
 *
 * @param {import('express').Response} res - Express response object.
 * @param {*} data - The response payload.
 * @param {object} [options={}] - Response options.
 * @param {string} [options.message] - Optional human-readable message.
 * @param {number} [options.statusCode=200] - HTTP status code.
 * @returns {import('express').Response}
 *
 * @example
 * return sendSuccess(res, { distanceKm: 12.5, kgCO2e: 2.13 });
 * return sendSuccess(res, { id: newDoc.id }, { statusCode: 201, message: 'Record saved' });
 */
export function sendSuccess(res, data, options = {}) {
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
 * @param {import('express').Response} res - Express response object.
 * @param {string} error - Error type identifier (e.g., 'VALIDATION_ERROR').
 * @param {string} message - Human-readable error description.
 * @param {number} [statusCode=500] - HTTP status code.
 * @param {Array<{field: string, message: string}>} [details] - Field-level error details.
 * @returns {import('express').Response}
 *
 * @example
 * return sendError(res, 'NOT_FOUND', 'Record not found', 404);
 * return sendError(res, 'VALIDATION_ERROR', 'Invalid input', 422, errors.array());
 */
export function sendError(res, error, message, statusCode = 500, details) {
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
 * @param {import('express').Response} res - Express response.
 * @param {import('express-validator').Result} validationResult - Result from validationResult(req).
 * @param {string} [context='Input'] - Context label for the error message.
 * @returns {import('express').Response}
 */
export function sendValidationError(res, validationResult, context = 'Input') {
  return sendError(
    res,
    'VALIDATION_ERROR',
    `Invalid ${context} — see details for field-level errors.`,
    422,
    validationResult.array().map((e) => ({ field: e.path || e.param, message: e.msg }))
  );
}
