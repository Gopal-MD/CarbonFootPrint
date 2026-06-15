/**
 * @fileoverview Request ID middleware.
 *
 * Attaches a unique request ID to every incoming HTTP request.
 * The ID is sourced from the `X-Request-ID` header (if set by a load balancer
 * or client) or generated as a UUID v4 fallback.
 *
 * The ID is available as:
 * - `req.requestId` — for use in route handlers and services
 * - `X-Request-ID` response header — for client-side correlation
 *
 * @module middleware/requestId
 */

import { Request, Response, NextFunction } from 'express';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('RequestId');

export interface RequestWithId extends Request {
  requestId?: string;
}

/**
 * Generates a UUID v4 string using the Web Crypto API (built into Node 19+).
 * Falls back to a timestamp-based ID for older Node versions.
 *
 * @returns A unique request ID string.
 */
function generateRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Fallback for environments without crypto.randomUUID
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

/**
 * Validates that a provided X-Request-ID header is safe to echo back.
 * Prevents header injection by rejecting values with newlines or excessive length.
 *
 * @param id - The header value to validate.
 * @returns True if the ID is safe to use.
 */
function isValidRequestId(id: string): boolean {
  return typeof id === 'string' && id.length <= 128 && !/[\r\n]/.test(id);
}

/**
 * Express middleware that attaches a unique request ID to every request.
 */
export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'];
  const headerId = Array.isArray(incomingId) ? incomingId[0] : incomingId;
  const requestId = headerId && isValidRequestId(headerId)
    ? headerId
    : generateRequestId();

  // Attach to request for use in handlers and downstream logging
  req.requestId = requestId;

  // Echo back in response for client-side correlation
  res.setHeader('X-Request-ID', requestId);

  logger.debug(`Request ${requestId}: ${req.method} ${req.path}`);
  next();
}
