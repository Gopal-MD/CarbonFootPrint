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
 * POST /api/auth/verify
 * Verifies a Firebase ID token and returns decoded user claims.
 * Used by the frontend to establish a trusted server-side session.
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
