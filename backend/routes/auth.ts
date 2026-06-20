/**
 * @fileoverview Auth route — Firebase ID token verification.
 * @module routes/auth
 */

import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { getAuth } from 'firebase-admin/auth';
import logger from '../utils/logger.js';

export const authRouter = Router();

/**
 * Verify a Firebase ID token and return decoded user claims.
 *
 * **Purpose:** Used by the frontend immediately after Firebase client-side
 * authentication to validate the token server-side and establish a trusted
 * session. Returns normalized user claims for the frontend to store.
 *
 * **Why this endpoint exists:** Firebase Authentication tokens are verified
 * client-side by default, but server-side verification (Firebase Admin SDK)
 * is the only way to ensure the token hasn't been revoked and to access
 * server-side claims. This endpoint bridges that gap.
 *
 * **Access Control:**
 * - Public endpoint — accepts any Firebase ID token
 * - Token is verified with `checkRevoked: true` (detects sign-outs)
 * - Expired or revoked tokens are rejected with structured 401 errors
 *
 * **Behavior:**
 * 1. Validate `idToken` field (required, string, ≥100 chars)
 * 2. Call Firebase Admin SDK `verifyIdToken(idToken, checkRevoked=true)`
 * 3. On success: return normalized user claims object
 * 4. On failure: return structured 401 with specific error code
 *
 * **Error Cases:**
 * - `422`: Missing or malformed `idToken` field
 * - `401/TOKEN_EXPIRED`: Token has expired; client should refresh
 * - `401/TOKEN_REVOKED`: Token was revoked (sign-out); client must re-authenticate
 * - `401/INVALID_TOKEN`: Generic verification failure
 *
 * @route POST /api/auth/verify
 * @access Public
 *
 * @example
 * POST /api/auth/verify
 * Content-Type: application/json
 *
 * { "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ij..." }
 *
 * // Success (200)
 * {
 *   "success": true,
 *   "data": {
 *     "uid": "abc123uid",
 *     "email": "user@example.com",
 *     "emailVerified": true,
 *     "displayName": "Gopal M"
 *   }
 * }
 *
 * // Token expired (401)
 * {
 *   "success": false,
 *   "error": "TOKEN_EXPIRED",
 *   "message": "Firebase ID token has expired. Please sign in again.",
 *   "statusCode": 401
 * }
 */
authRouter.post(
  '/verify',
  [
    body('idToken')
      .notEmpty()
      .withMessage('idToken is required')
      .isString()
      .isLength({ min: 100 })
      .withMessage('idToken appears to be invalid (too short)'),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid auth request',
          details: errors.array().map((e) => ({
            field: e.type === 'field' ? e.path : e.type,
            message: e.msg,
          })),
          statusCode: 422,
        });
      }

      const { idToken } = req.body;

      const adminAuth = getAuth();
      const decodedToken = await adminAuth.verifyIdToken(idToken, true); // checkRevoked=true

      logger.info(`[AuthRoute] Token verified for uid: ${decodedToken.uid.substring(0, 8)}...`);

      return res.status(200).json({
        success: true,
        data: {
          uid: decodedToken.uid,
          email: decodedToken.email,
          emailVerified: decodedToken.email_verified,
          displayName: decodedToken.name,
        },
      });
    } catch (error: unknown) {
      // Firebase auth errors have specific codes
      const firebaseCode = (error && typeof error === 'object' && 'code' in error)
        ? String((error as { code: unknown }).code)
        : null;
      if (firebaseCode === 'auth/id-token-expired') {
        return res.status(401).json({
          success: false,
          error: 'TOKEN_EXPIRED',
          message: 'Firebase ID token has expired. Please sign in again.',
          statusCode: 401,
        });
      }
      if (firebaseCode === 'auth/id-token-revoked') {
        return res.status(401).json({
          success: false,
          error: 'TOKEN_REVOKED',
          message: 'Firebase ID token has been revoked. Please sign in again.',
          statusCode: 401,
        });
      }
      next(error);
    }
  }
);
