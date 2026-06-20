/**
 * @fileoverview Commute carbon calculation route.
 * Calculates CO₂ emissions for a commute using the Google Maps Directions API.
 *
 * @module routes/commute
 */

import { Router, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { getMapsService } from '../services/MapsService.js';
import { BaseDB } from '../services/BaseDB.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { sendSuccess, sendError, sendValidationError } from '../utils/apiResponse.js';
import type { EmissionRecord } from '../../shared/types/index.js';
import logger from '../utils/logger.js';

export const commuteRouter = Router();

// ── Emissions DB subclass ─────────────────────────────────────────────────────
class CommuteEmissionsDB extends BaseDB {
  /**
   * Saves a commute emission record to Firestore.
   *
   * @param userId - Firebase UID (derived from verified token).
   * @param record - Emission record data.
   * @returns Document ID on success.
   */
  async save(userId: string, record: Omit<EmissionRecord, 'id' | 'userId'>): Promise<{ id: string }> {
    return this.addDoc<EmissionRecord>(`users/${userId}/emissions`, { ...record, userId, category: 'commute' } as EmissionRecord);
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
  body('saveRecord')
    .optional()
    .isBoolean()
    .withMessage('saveRecord must be a boolean')
    .toBoolean(),
];

// ── POST /api/commute ─────────────────────────────────────────────────────────
commuteRouter.post('/', requireAuth, validateCommuteInput, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void | Response> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendValidationError(res, errors, 'Commute Input');
    }

    // userId is always derived from the verified Firebase token — never from req.body
    if (!req.user) {
      return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
    }
    const userId = req.user.uid;

    if (req.body.userId && req.body.userId !== userId) {
      logger.warn(`[CommuteRoute] Cross-user access attempt: token=${userId.substring(0, 8)} body=${String(req.body.userId).substring(0, 8)}`);
      return sendError(res, 'FORBIDDEN', 'You are not authorized to access or modify records for another user.', 403);
    }

    const { origin, destination, travelMode, trips = 1, saveRecord = false } = req.body;

    const mapsService = getMapsService();

    logger.info(`[CommuteRoute] Calculating ${travelMode} route: ${origin} → ${destination}`);

    const result = await mapsService.calculateCommuteEmissions({
      origin,
      destination,
      travelMode,
      trips,
    });

    // Optionally persist to Firestore
    let savedId: string | null = null;
    if (saveRecord) {
      const saved = await commuteDB.save(userId, {
        category: 'commute',
        kgCO2e: result.kgCO2e,
        date: new Date().toISOString().split('T')[0],
        metadata: {
          origin: result.originAddress,
          destination: result.destinationAddress,
          travelMode: result.travelMode,
          distanceKm: result.distanceKm,
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
  } catch (error: unknown) {
    // Provide user-friendly messages for common Maps API errors
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('No route found')) {
      return sendError(res, 'NO_ROUTE_FOUND', message, 404);
    }
    if (message.includes('OVER_DAILY_LIMIT') || message.includes('OVER_QUERY_LIMIT')) {
      return sendError(res, 'MAPS_QUOTA_EXCEEDED', 'Maps API quota exceeded. Please try again tomorrow.', 429);
    }
    next(error);
  }
});

// ── GET /api/commute/modes ────────────────────────────────────────────────────
commuteRouter.get('/modes', (_req: AuthenticatedRequest, res: Response) => {
  return sendSuccess(res, [
    { id: 'DRIVING', label: 'Driving', icon: '🚗', kgPerKm: 0.17046, description: 'Average petrol car (DEFRA 2023)' },
    { id: 'TRANSIT', label: 'Public Transit', icon: '🚌', kgPerKm: 0.03549, description: 'UK rail average' },
    { id: 'BICYCLING', label: 'Cycling', icon: '🚲', kgPerKm: 0.0, description: 'Zero direct emissions' },
    { id: 'WALKING', label: 'Walking', icon: '🚶', kgPerKm: 0.0, description: 'Zero direct emissions' },
  ]);
});
