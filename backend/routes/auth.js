/**
 * @fileoverview Auth route — Firebase ID token verification.
 * @module routes/auth
 */

import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import logger from '../utils/logger.js';

export const authRouter = Router();

/**
 * POST /api/auth/verify
 * Verifies a Firebase ID token and returns decoded user claims.
 * Used by the frontend to establish a trusted server-side session.
 *
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Express next middleware.
 * @returns {Promise<void>}
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
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid auth request',
          details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
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
    } catch (error) {
      // Firebase auth errors have specific codes
      if (error.code === 'auth/id-token-expired') {
        return res.status(401).json({
          success: false,
          error: 'TOKEN_EXPIRED',
          message: 'Firebase ID token has expired. Please sign in again.',
          statusCode: 401,
        });
      }
      if (error.code === 'auth/id-token-revoked') {
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
