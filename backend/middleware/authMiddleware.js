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

import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import logger from '../utils/logger.js';

/**
 * Lazily initializes Firebase Admin and returns the Auth instance.
 * Safe to call multiple times — returns singleton.
 *
 * @returns {import('firebase-admin/auth').Auth}
 */
function getAdminAuth() {
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
 *
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next function.
 * @returns {Promise<void>}
 *
 * @example
 * // Protect all routes in a router:
 * router.use(requireAuth);
 *
 * // Access decoded user in handler:
 * const { uid, email } = req.user;
 */
export async function requireAuth(req, res, next) {
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

    /**
     * @typedef {object} AuthenticatedUser
     * @property {string} uid - Firebase UID.
     * @property {string} email - User's email.
     * @property {boolean} emailVerified - Whether email is verified.
     * @property {string} [name] - Display name if set.
     */
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      name: decodedToken.name,
    };

    logger.debug(`[AuthMiddleware] Authenticated user: ${decodedToken.uid.substring(0, 8)}...`);
    return next();
  } catch (error) {
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
 *
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Express next function.
 * @returns {Promise<void>}
 */
export async function optionalAuth(req, res, next) {
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
