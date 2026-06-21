/**
 * @fileoverview Commute carbon calculation route.
 * Calculates CO₂ emissions for a commute using the Google Maps Directions API.
 *
 * @module routes/commute
 */

import { Router, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { getMapsService } from '../services/MapsService.js';
import { sendSuccess, sendError, sendValidationError } from '../utils/apiResponse.js';
import { getEmissionsRepository, IEmissionRepository } from '../repositories/index.js';
import logger from '../utils/logger.js';

export const commuteRouter = Router();

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
/**
 * Calculate CO₂ emissions for a commute using the Google Maps Directions API.
 *
 * **Purpose:** Accept a trip's origin, destination, and travel mode, then
 * call the Maps Directions API to get the real-world distance, multiply by
 * the DEFRA/EPA emission factor for that mode, and return the CO₂e result.
 * Optionally persists the record to Firestore for historical tracking.
 *
 * **Access Control:**
 * - Requires Firebase ID token verification (via `requireAuth`)
 * - `userId` is derived exclusively from `req.user.uid` (verified token claim)
 * - Any `req.body.userId` that mismatches the token UID is rejected with 403
 *
 * **Behavior (step-by-step):**
 * 1. Sanitize & validate `origin`, `destination` (max 500 chars, .escape())
 * 2. Validate `travelMode` against the allowed enum
 * 3. Verify Firebase ID token → extract `userId`
 * 4. Call `MapsService.calculateCommuteEmissions()` with `withRetry()` wrapping
 * 5. If `saveRecord=true`, persist the result to `users/{uid}/emissions`
 * 6. Return the typed `CommuteResult` envelope
 *
 * **Error Cases:**
 * - `422`: Missing origin/destination, invalid travelMode, address too long
 * - `401`: Missing or expired Firebase ID token
 * - `403`: `req.body.userId` mismatches verified token UID
 * - `404`: Maps API could not find a route between origin and destination
 * - `429`: Google Maps daily quota exceeded
 * - `500`: Maps API unavailable (retries exhausted)
 *
 * @route POST /api/commute
 * @access Private (Firebase ID token required)
 *
 * @example
 * POST /api/commute
 * Authorization: Bearer <firebase-id-token>
 * Content-Type: application/json
 *
 * {
 *   "origin": "Connaught Place, New Delhi",
 *   "destination": "Cyber City, Gurugram",
 *   "travelMode": "DRIVING",
 *   "trips": 2,
 *   "saveRecord": true
 * }
 *
 * // Success (200)
 * {
 *   "success": true,
 *   "data": {
 *     "distanceKm": 28.3,
 *     "durationMinutes": 47,
 *     "kgCO2e": 4.82,
 *     "travelMode": "DRIVING",
 *     "originAddress": "Connaught Place, New Delhi, Delhi 110001, India",
 *     "destinationAddress": "Cyber City, DLF Cyber City, Gurugram, Haryana 122002, India",
 *     "trips": 2,
 *     "savedId": "abc123def456"
 *   },
 *   "statusCode": 200
 * }
 */
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
      const repo = (req.app.locals.emissionsRepo as IEmissionRepository) || getEmissionsRepository();
      const saved = await repo.add(userId, {
        userId,
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
/**
 * Return emission factors and metadata for all supported travel modes.
 *
 * **Purpose:** Provides the frontend with up-to-date emission factor data so
 * it can render comparison banners (e.g., "Switching to transit would save X kg").
 * This endpoint is public — no authentication required.
 *
 * **Response:** Array of travel mode objects with kg CO₂e per km.
 * Factors sourced from DEFRA 2023 and EPA data (see `constants/index.ts`).
 *
 * @route GET /api/commute/modes
 * @access Public
 *
 * @example
 * GET /api/commute/modes
 *
 * // Success (200)
 * {
 *   "success": true,
 *   "data": [
 *     { "id": "DRIVING", "label": "Driving", "icon": "🚗", "kgPerKm": 0.17046, "description": "Average petrol car (DEFRA 2023)" },
 *     { "id": "TRANSIT", "label": "Public Transit", "icon": "🚌", "kgPerKm": 0.03549, "description": "UK rail average" },
 *     { "id": "BICYCLING", "label": "Cycling", "icon": "🚲", "kgPerKm": 0.0, "description": "Zero direct emissions" },
 *     { "id": "WALKING", "label": "Walking", "icon": "🚶", "kgPerKm": 0.0, "description": "Zero direct emissions" }
 *   ],
 *   "statusCode": 200
 * }
 */
commuteRouter.get('/modes', (_req: AuthenticatedRequest, res: Response) => {
  return sendSuccess(res, [
    { id: 'DRIVING', label: 'Driving', icon: '🚗', kgPerKm: 0.17046, description: 'Average petrol car (DEFRA 2023)' },
    { id: 'TRANSIT', label: 'Public Transit', icon: '🚌', kgPerKm: 0.03549, description: 'UK rail average' },
    { id: 'BICYCLING', label: 'Cycling', icon: '🚲', kgPerKm: 0.0, description: 'Zero direct emissions' },
    { id: 'WALKING', label: 'Walking', icon: '🚶', kgPerKm: 0.0, description: 'Zero direct emissions' },
  ]);
});
