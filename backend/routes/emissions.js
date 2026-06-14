/**
 * @fileoverview Emissions CRUD route.
 * Handles creating and retrieving user emission records in Firestore.
 * @module routes/emissions
 */

import { Router } from 'express';
import { body, query, validationResult } from 'express-validator';
import { BaseDB } from '../services/BaseDB.js';
import logger from '../utils/logger.js';

export const emissionsRouter = Router();

// ── Domain-specific DB subclass ───────────────────────────────────────────────
/**
 * Emissions-specific Firestore operations.
 * @extends BaseDB
 */
class EmissionsDB extends BaseDB {
  /**
   * Adds a new emission record for a user.
   *
   * @param {string} userId - Firebase UID.
   * @param {Omit<import('../types/eco_types.js').EmissionRecord, 'id'|'createdAt'>} record - Emission data.
   * @returns {Promise<{id: string}>}
   */
  async addRecord(userId, record) {
    return this.addDoc(`users/${userId}/emissions`, record);
  }

  /**
   * Retrieves paginated emission records for a user.
   *
   * @param {string} userId - Firebase UID.
   * @param {object} [options={}] - Query options.
   * @param {string} [options.category] - Filter by emission category.
   * @param {number} [options.limit=20] - Maximum records to return.
   * @returns {Promise<import('../types/eco_types.js').EmissionRecord[]>}
   */
  async getRecords(userId, options = {}) {
    const filters = [];
    if (options.category) {
      filters.push(['category', '==', options.category]);
    }
    return this.queryCollection(`users/${userId}/emissions`, filters, {
      orderBy: 'createdAt',
      orderDirection: 'desc',
      limit: options.limit || 20,
    });
  }
}

const emissionsDB = new EmissionsDB();

/**
 * POST /api/emissions
 * Saves a new emission record to Firestore.
 */
emissionsRouter.post(
  '/',
  [
    body('userId').trim().notEmpty().isLength({ max: 128 }),
    body('category').isIn(['commute', 'utility', 'food', 'other']),
    body('kgCO2e').isFloat({ min: 0, max: 100000 }),
    body('date').isISO8601().withMessage('date must be a valid ISO 8601 date'),
    body('metadata').optional().isObject(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid emission record',
          details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
          statusCode: 422,
        });
      }

      const { userId, category, kgCO2e, date, metadata = {} } = req.body;
      logger.info(`[EmissionsRoute] Adding ${category} record for user ${userId.substring(0, 8)}`);

      const result = await emissionsDB.addRecord(userId, { userId, category, kgCO2e, date, metadata });

      return res.status(201).json({
        success: true,
        data: { id: result.id },
        message: 'Emission record saved successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/emissions
 * Retrieves emission records for a user.
 */
emissionsRouter.get(
  '/',
  [
    query('userId').trim().notEmpty().isLength({ max: 128 }),
    query('category').optional().isIn(['commute', 'utility', 'food', 'other']),
    query('limit').optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
          statusCode: 422,
        });
      }

      const { userId, category, limit } = req.query;
      const records = await emissionsDB.getRecords(userId, {
        category,
        limit: limit ? parseInt(limit, 10) : 20,
      });

      return res.status(200).json({
        success: true,
        data: records,
        meta: { count: records.length },
      });
    } catch (error) {
      next(error);
    }
  }
);
