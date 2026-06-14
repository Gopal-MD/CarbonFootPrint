/**
 * @fileoverview Commute carbon calculation route — full Google Maps implementation.
 * Calculates CO₂ emissions for a commute using the Google Maps Directions API.
 *
 * @module routes/commute
 */

import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { getMapsService } from '../services/MapsService.js';
import { BaseDB } from '../services/BaseDB.js';
import { sendSuccess, sendError, sendValidationError } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';

export const commuteRouter = Router();

// ── Emissions DB subclass ─────────────────────────────────────────────────────
/**
 * @extends BaseDB
 * @private
 */
class CommuteEmissionsDB extends BaseDB {
  /**
   * Saves a commute emission record to Firestore.
   *
   * @param {string} userId - Firebase UID.
   * @param {object} record - Emission record data.
   * @returns {Promise<{id: string}>}
   */
  async save(userId, record) {
    return this.addDoc(`users/${userId}/emissions`, { ...record, userId, category: 'commute' });
  }
}

const commuteDB = new CommuteEmissionsDB();

// ── Validation middleware ─────────────────────────────────────────────────────
const validateCommuteInput = [
  body('origin')
    .trim()
    .notEmpty()
    .withMessage('Origin address is required')
    .isLength({ max: 500 })
    .withMessage('Origin address must be 500 characters or fewer')
    .escape(),
  body('destination')
    .trim()
    .notEmpty()
    .withMessage('Destination address is required')
    .isLength({ max: 500 })
    .withMessage('Destination address must be 500 characters or fewer')
    .escape(),
  body('travelMode')
    .toUpperCase()
    .isIn(['DRIVING', 'TRANSIT', 'WALKING', 'BICYCLING'])
    .withMessage('travelMode must be one of: DRIVING, TRANSIT, WALKING, BICYCLING'),
  body('trips')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('trips must be an integer between 1 and 100')
    .toInt(),
  body('userId')
    .optional()
    .trim()
    .isLength({ max: 128 })
    .withMessage('userId too long'),
  body('saveRecord')
    .optional()
    .isBoolean()
    .withMessage('saveRecord must be a boolean')
    .toBoolean(),
];

// ── POST /api/commute ─────────────────────────────────────────────────────────
/**
 * POST /api/commute
 * Calculates carbon emissions for a commute using Google Maps Directions API.
 *
 * Request body:
 *   - origin: string — Starting address
 *   - destination: string — Ending address
 *   - travelMode: 'DRIVING'|'TRANSIT'|'WALKING'|'BICYCLING'
 *   - trips: number (optional, default 1) — Number of one-way trips
 *   - userId: string (optional) — Firebase UID; required if saveRecord=true
 *   - saveRecord: boolean (optional) — Whether to persist the record to Firestore
 *
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Express next middleware.
 * @returns {Promise<void>}
 */
commuteRouter.post('/', validateCommuteInput, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendValidationError(res, errors, 'Commute Input');
    }

    const { origin, destination, travelMode, trips = 1, userId, saveRecord = false } = req.body;

    // Guard: saving requires userId
    if (saveRecord && !userId) {
      return sendError(res, 'MISSING_USER_ID', 'userId is required when saveRecord is true.', 400);
    }

    const mapsService = getMapsService();

    logger.info(`[CommuteRoute] Calculating ${travelMode} route: ${origin} → ${destination}`);

    const result = await mapsService.calculateCommuteEmissions({
      origin,
      destination,
      travelMode,
      trips,
    });

    // Optionally persist to Firestore
    let savedId = null;
    if (saveRecord && userId) {
      const saved = await commuteDB.save(userId, {
        kgCO2e: result.kgCO2e,
        date: new Date().toISOString().split('T')[0],
        metadata: {
          origin: result.originAddress,
          destination: result.destinationAddress,
          travelMode: result.travelMode,
          distanceKm: result.distanceKm,
          trips,
        },
      });
      savedId = saved.id;
      logger.info(`[CommuteRoute] Saved emission record ${savedId} for user ${userId.substring(0, 8)}...`);
    }

    return sendSuccess(res, {
      ...result,
      trips,
      ...(savedId && { savedId }),
    });
  } catch (error) {
    // Provide user-friendly messages for common Maps API errors
    if (error.message.includes('No route found')) {
      return sendError(res, 'NO_ROUTE_FOUND', error.message, 404);
    }
    if (error.message.includes('OVER_DAILY_LIMIT') || error.message.includes('OVER_QUERY_LIMIT')) {
      return sendError(res, 'MAPS_QUOTA_EXCEEDED', 'Maps API quota exceeded. Please try again tomorrow.', 429);
    }
    next(error);
  }
});

// ── GET /api/commute/modes ────────────────────────────────────────────────────
/**
 * GET /api/commute/modes
 * Returns available travel modes with emission factor metadata.
 * Used by the frontend to populate the travel mode selector.
 *
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @returns {void}
 */
commuteRouter.get('/modes', (_req, res) => {
  return sendSuccess(res, [
    { id: 'DRIVING', label: 'Driving', icon: '🚗', kgPerKm: 0.17046, description: 'Average petrol car (DEFRA 2023)' },
    { id: 'TRANSIT', label: 'Public Transit', icon: '🚌', kgPerKm: 0.03549, description: 'UK rail average' },
    { id: 'BICYCLING', label: 'Cycling', icon: '🚲', kgPerKm: 0.0, description: 'Zero direct emissions' },
    { id: 'WALKING', label: 'Walking', icon: '🚶', kgPerKm: 0.0, description: 'Zero direct emissions' },
  ]);
});
