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
import { EmissionRecord } from '../../shared/types/index.js';
import { WhereFilterOp } from 'firebase-admin/firestore';
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
  async addRecord(userId: string, record: any): Promise<{ id: string }> {
    return this.addDoc(`users/${userId}/emissions`, record);
  }

  /**
   * Retrieves paginated emission records for a user.
   *
   * @param userId - Firebase UID (from verified token).
   * @param options - Query options.
   * @returns List of emission records.
   */
  async getRecords(userId: string, options: { category?: string; limit?: number } = {}): Promise<EmissionRecord[]> {
    const filters: Array<[string, WhereFilterOp, any]> = [];
    if (options.category) {
      filters.push(['category', '==', options.category]);
    }
    return this.queryCollection(`users/${userId}/emissions`, filters, {
      orderBy: 'createdAt',
      orderDirection: 'desc',
      limit: options.limit || 20,
    }) as Promise<EmissionRecord[]>;
  }
}

const emissionsDB = new EmissionsDB();

/**
 * POST /api/emissions
 * Saves a new emission record to Firestore for the authenticated user.
 * Requires Authorization: Bearer <firebase-id-token>
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
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
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
emissionsRouter.get(
  '/',
  requireAuth,
  [
    query('category').optional().isIn(['commute', 'utility', 'food', 'other']),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
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
