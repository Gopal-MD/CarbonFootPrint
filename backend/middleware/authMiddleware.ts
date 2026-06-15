/**
 * @fileoverview Firebase Authentication middleware for Express routes.
 *
 * Verifies the Firebase ID token from the `Authorization: Bearer <token>` header.
 * On success, attaches `req.user` with decoded token claims.
 * On failure, responds with 401 Unauthorized immediately.
 *
 * Usage:
 * ```js
 * import { requireAuth } from './middleware/authMiddleware.js';
 * router.get('/protected', requireAuth, handler);
 * ```
 *
 * @module middleware/authMiddleware
 */

import { Request, Response, NextFunction } from 'express';
import { getAuth, Auth } from 'firebase-admin/auth';
import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import logger from '../utils/logger.js';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser | null;
}

/**
 * Lazily initializes Firebase Admin and returns the Auth instance.
 * Safe to call multiple times — returns singleton.
 *
 * @returns Firebase Auth instance.
 */
function getAdminAuth(): Auth {
  if (getApps().length === 0) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getAuth(getApp());
}

/**
 * Express middleware that enforces Firebase Authentication.
 * Extracts and verifies the Bearer token from the Authorization header.
 * Attaches decoded token to `req.user` on success.
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void | Response> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required. Provide a valid Firebase ID token in the Authorization header.',
      statusCode: 401,
    });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const adminAuth = getAdminAuth();
    const decodedToken = await adminAuth.verifyIdToken(idToken, true); // checkRevoked=true

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      name: decodedToken.name,
    };

    logger.debug(`[AuthMiddleware] Authenticated user: ${decodedToken.uid.substring(0, 8)}...`);
    return next();
  } catch (error: any) {
    logger.warn(`[AuthMiddleware] Token verification failed: ${error.code || error.message}`);

    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        success: false,
        error: 'TOKEN_EXPIRED',
        message: 'Firebase ID token has expired. Please refresh your session.',
        statusCode: 401,
      });
    }

    if (error.code === 'auth/id-token-revoked') {
      return res.status(401).json({
        success: false,
        error: 'TOKEN_REVOKED',
        message: 'Session has been revoked. Please sign in again.',
        statusCode: 401,
      });
    }

    return res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Invalid Firebase ID token.',
      statusCode: 401,
    });
  }
}

/**
 * Optional authentication middleware — attaches `req.user` if token present,
 * but does NOT block the request if no token is provided.
 * Useful for endpoints that serve both authenticated and anonymous users.
 */
export async function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  try {
    const adminAuth = getAdminAuth();
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      name: decodedToken.name,
    };
  } catch {
    req.user = null;
  }

  return next();
}
