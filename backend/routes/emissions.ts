/**
 * @fileoverview Emissions CRUD route.
 * Handles creating and retrieving user emission records in Firestore.
 * All routes require a valid Firebase ID token — userId is derived from
 * the verified token (req.user.uid), never from client-supplied body/query params.
 * @module routes/emissions
 */

import { Router, Response, NextFunction } from 'express';
import { body, query, validationResult } from 'express-validator';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { BaseDB } from '../services/BaseDB.js';
import { sendSuccess, sendError, sendValidationError } from '../utils/apiResponse.js';
import type { EmissionRecord } from '../../shared/types/index.js';
import type { FirestoreFilter } from '../types/eco_types.js';
import logger from '../utils/logger.js';

export const emissionsRouter = Router();

// ── Domain-specific DB subclass ───────────────────────────────────────────────
class EmissionsDB extends BaseDB {
  /**
   * Adds a new emission record for a user.
   *
   * @param userId - Firebase UID (from verified token).
   * @param record - Emission data.
   * @returns Document ID on success.
   */
  async addRecord(userId: string, record: Omit<EmissionRecord, 'id'>): Promise<{ id: string }> {
    return this.addDoc<EmissionRecord>(`users/${userId}/emissions`, record as EmissionRecord);
  }

  /**
   * Retrieves paginated emission records for a user.
   *
   * @param userId - Firebase UID (from verified token).
   * @param options - Query options.
   * @returns List of emission records.
   */
  async getRecords(userId: string, options: { category?: string; limit?: number } = {}): Promise<EmissionRecord[]> {
    const filters: FirestoreFilter[] = [];
    if (options.category) {
      filters.push(['category', '==', options.category]);
    }
    return this.queryCollection<EmissionRecord>(`users/${userId}/emissions`, filters, {
      orderBy: 'createdAt',
      orderDirection: 'desc',
      limit: options.limit ?? 20,
    });
  }
}

const emissionsDB = new EmissionsDB();

/**
 * POST /api/emissions
 * Saves a new emission record to Firestore for the authenticated user.
 * Requires Authorization: Bearer <firebase-id-token>
 */
/**
 * Save a new carbon emission record for the authenticated user.
 *
 * **Purpose:** Persist a manual or calculated emission event to Firestore.
 * Used by all other endpoints (commute, scan) to save their computed results,
 * and directly by the frontend for food/other category manual entries.
 *
 * **Access Control:**
 * - Requires Firebase ID token verification (via `requireAuth`)
 * - `userId` written to Firestore is always `req.user.uid` from the verified token
 * - Any `req.body.userId` that mismatches the token UID is rejected with 403
 * - Firestore security rules provide a second enforcement layer
 *
 * **Behavior:**
 * 1. Validate `category`, `kgCO2e` (0–100,000), `date` (ISO 8601), `metadata` (optional)
 * 2. Verify Firebase ID token → extract `userId`
 * 3. Write to `users/{userId}/emissions` (auto-generated document ID)
 * 4. Return the new document ID
 *
 * **Error Cases:**
 * - `422`: Invalid category, negative kgCO2e, non-ISO date
 * - `401`: Missing or expired Firebase ID token
 * - `403`: `req.body.userId` mismatches verified token UID
 * - `500`: Firestore write failure
 *
 * @route POST /api/emissions
 * @access Private (Firebase ID token required)
 *
 * @example
 * POST /api/emissions
 * Authorization: Bearer <firebase-id-token>
 * Content-Type: application/json
 *
 * {
 *   "category": "food",
 *   "kgCO2e": 2.4,
 *   "date": "2026-06-20",
 *   "metadata": { "description": "Beef burger meal" }
 * }
 *
 * // Success (201)
 * {
 *   "success": true,
 *   "data": { "id": "xyz789" },
 *   "message": "Emission record saved successfully",
 *   "statusCode": 201
 * }
 */
emissionsRouter.post(
  '/',
  requireAuth,
  [
    body('category').isIn(['commute', 'utility', 'food', 'other']),
    body('kgCO2e').isFloat({ min: 0, max: 100000 }),
    body('date').isISO8601().withMessage('date must be a valid ISO 8601 date'),
    body('metadata').optional().isObject(),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendValidationError(res, errors, 'emission record');
      }

      // userId always comes from the verified Firebase token
      if (!req.user) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }
      const userId = req.user.uid;

      if (req.body.userId && req.body.userId !== userId) {
        logger.warn(`[EmissionsRoute] Cross-user access attempt: token=${userId.substring(0, 8)} body=${String(req.body.userId).substring(0, 8)}`);
        return sendError(res, 'FORBIDDEN', 'You are not authorized to access or modify records for another user.', 403);
      }

      const { category, kgCO2e, date, metadata = {} } = req.body;
      logger.info(`[EmissionsRoute] Adding ${category} record for user ${userId.substring(0, 8)}`);

      const result = await emissionsDB.addRecord(userId, { userId, category, kgCO2e, date, metadata });

      return sendSuccess(res, { id: result.id }, { statusCode: 201, message: 'Emission record saved successfully' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/emissions
 * Retrieves emission records for the authenticated user only.
 * Requires Authorization: Bearer <firebase-id-token>
 * If a userId query param is provided and doesn't match the token, returns 403.
 */
/**
 * Retrieve paginated emission records for the authenticated user.
 *
 * **Purpose:** Return the user's historical emission records, optionally
 * filtered by category, for display in the dashboard and chart visualizations.
 *
 * **Access Control:**
 * - Requires Firebase ID token verification (via `requireAuth`)
 * - Records returned are always scoped to `req.user.uid` from the verified token
 * - Any `req.query.userId` that mismatches the token UID is rejected with 403
 * - Prevents enumeration attacks: users cannot query another user's records
 *
 * **Behavior:**
 * 1. Validate optional `category` and `limit` query params
 * 2. Verify Firebase ID token → extract `userId`
 * 3. Query `users/{userId}/emissions` ordered by `createdAt` descending
 * 4. Return paginated array (default limit: 20, max: 100)
 *
 * **Error Cases:**
 * - `422`: Invalid category enum value or non-integer limit
 * - `401`: Missing or expired Firebase ID token
 * - `403`: `req.query.userId` mismatches verified token UID
 * - `500`: Firestore query failure
 *
 * @route GET /api/emissions
 * @access Private (Firebase ID token required)
 *
 * @example
 * GET /api/emissions?category=commute&limit=10
 * Authorization: Bearer <firebase-id-token>
 *
 * // Success (200)
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "id": "abc123",
 *       "userId": "uid_...",
 *       "category": "commute",
 *       "kgCO2e": 4.82,
 *       "date": "2026-06-20",
 *       "createdAt": "2026-06-20T10:30:00.000Z",
 *       "metadata": { "travelMode": "DRIVING", "distanceKm": 28.3 }
 *     }
 *   ],
 *   "statusCode": 200
 * }
 */
emissionsRouter.get(
  '/',
  requireAuth,
  [
    query('category').optional().isIn(['commute', 'utility', 'food', 'other']),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendValidationError(res, errors, 'query parameters');
      }

      // userId always comes from the verified Firebase token
      if (!req.user) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }
      const userId = req.user.uid;

      // Guard against cross-user access: if client sends userId, it must match token
      if (req.query.userId && req.query.userId !== userId) {
        logger.warn(`[EmissionsRoute] Cross-user access attempt: token=${userId.substring(0, 8)} query=${String(req.query.userId).substring(0, 8)}`);
        return sendError(res, 'FORBIDDEN', 'You are not authorized to access another user\'s records.', 403);
      }

      const category = req.query.category as string | undefined;
      const limit = req.query.limit as string | undefined;
      const records = await emissionsDB.getRecords(userId, {
        category,
        limit: limit ? parseInt(limit, 10) : 20,
      });

      return sendSuccess(res, records);
    } catch (error) {
      next(error);
    }
  }
);
