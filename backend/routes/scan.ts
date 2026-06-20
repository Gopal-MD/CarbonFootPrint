/**
 * @fileoverview Utility bill scan route.
 *
 * Analyzes utility bill images using Gemini Vision to extract energy usage (kWh)
 * and calculate the resulting CO₂ emissions. Implements graceful degradation so
 * the endpoint always returns a structured response — even when Vision AI is
 * unavailable:
 *
 *   Tier 1 (preferred): Gemini Vision → OCR + structured extraction
 *   Tier 2 (fallback):  Manual entry prompt → structured response with kWh=null,
 *                       guiding the user to enter their kWh manually
 *
 * @module routes/scan
 */

import { Router, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { getAIServiceManager } from '../services/AIServiceManager.js';
import { sendSuccess, sendError, sendValidationError } from '../utils/apiResponse.js';
import { ELECTRICITY_KG_PER_KWH } from '../constants/index.js';
import logger from '../utils/logger.js';

export const scanRouter = Router();

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum image size: 10 MB raw → ~13.7 MB base64 chars. */
const MAX_BASE64_LENGTH = 10 * 1024 * 1024 * 1.37;

/** MIME types accepted by Gemini Vision. */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'] as const;
type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

// ── Validation ────────────────────────────────────────────────────────────────

const validateScanInput = [
  body('imageBase64')
    .notEmpty()
    .withMessage('imageBase64 is required')
    .isString()
    .withMessage('imageBase64 must be a string')
    .custom((value: string) => {
      if (value.length > MAX_BASE64_LENGTH) {
        throw new Error('Image exceeds maximum allowed size of 10 MB');
      }
      if (!/^[A-Za-z0-9+/]+=*$/.test(value)) {
        throw new Error('imageBase64 is not valid base64');
      }
      return true;
    }),
  body('mimeType')
    .isIn(ALLOWED_MIME_TYPES)
    .withMessage(`mimeType must be one of: ${ALLOWED_MIME_TYPES.join(', ')}`),
];

// ── POST /api/scan ────────────────────────────────────────────────────────────
/**
 * Analyze a utility bill image and extract carbon emissions.
 *
 * **Purpose:** Allow users to photograph their electricity/gas bill and
 * automatically receive their monthly kWh consumption and CO₂e impact.
 * Eliminates manual data entry for the most significant home energy source.
 *
 * **Access Control:**
 * - Requires Firebase ID token verification (via `requireAuth`)
 * - `userId` is derived exclusively from `req.user.uid` (verified token claim)
 * - Any `req.body.userId` that mismatches the token UID is rejected with 403
 *
 * **Graceful Degradation:**
 * - **Primary**: Gemini Vision extracts kWh, provider name, and billing period
 *   with a structured JSON response
 * - **Fallback**: If Gemini Vision fails (quota, timeout, network error), returns
 *   a structured response with `kWhExtracted: null`, `source: "fallback"`, and
 *   a `fallbackMessage` guiding the user to enter their kWh manually
 * - The response envelope is **identical** in both cases — the frontend uses
 *   `kWhExtracted !== null` to decide whether to show manual entry UI
 *
 * **Behavior (step-by-step):**
 * 1. Validate `imageBase64` (required, ≤10 MB, valid base64) and `mimeType`
 * 2. Verify Firebase ID token → extract `userId`
 * 3. Forward image to Gemini Vision for structured extraction
 * 4. On success: calculate CO₂e from kWh × electricity factor → return result
 * 5. On Vision failure: log warning → return fallback with manual entry guidance
 *
 * **Error Cases:**
 * - `422`: Invalid base64, image too large, or unsupported MIME type
 * - `401`: Missing or expired Firebase ID token
 * - `403`: `req.body.userId` mismatches verified token UID
 * - `500`: Both Vision and fallback response generation failed (extremely rare)
 *
 * @route POST /api/scan
 * @access Private (Firebase ID token required)
 *
 * @example
 * POST /api/scan
 * Authorization: Bearer <firebase-id-token>
 * Content-Type: application/json
 *
 * {
 *   "imageBase64": "/9j/4AAQSkZJRgABAQEASABIAAD...",
 *   "mimeType": "image/jpeg"
 * }
 *
 * // Success (Vision path)
 * {
 *   "success": true,
 *   "data": {
 *     "kWhExtracted": 245.3,
 *     "kgCO2e": 0.5714,
 *     "billProvider": "Mumbai Electric Co.",
 *     "billPeriod": "May 2026",
 *     "confidence": 0.92,
 *     "cached": false,
 *     "source": "vision",
 *     "rawSummary": "{\"kWhExtracted\":245.3,...}"
 *   },
 *   "statusCode": 200
 * }
 *
 * // Partial success (fallback path — Vision unavailable)
 * {
 *   "success": true,
 *   "data": {
 *     "kWhExtracted": null,
 *     "kgCO2e": 0,
 *     "billProvider": null,
 *     "billPeriod": null,
 *     "confidence": 0,
 *     "cached": false,
 *     "source": "fallback",
 *     "fallbackMessage": "Automatic extraction is temporarily unavailable..."
 *   },
 *   "statusCode": 200
 * }
 */
scanRouter.post(
  '/',
  requireAuth,
  validateScanInput,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendValidationError(res, errors, 'scan input');
      }

      // userId is always derived from the verified Firebase token — never from req.body
      if (!req.user) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }
      const userId = req.user.uid;

      if (req.body.userId && req.body.userId !== userId) {
        logger.warn(`[ScanRoute] Cross-user access attempt: token=${userId.substring(0, 8)} body=${String(req.body.userId).substring(0, 8)}`);
        return sendError(res, 'FORBIDDEN', 'You are not authorized to access or modify records for another user.', 403);
      }

      const { imageBase64, mimeType } = req.body as { imageBase64: string; mimeType: AllowedMimeType };
      logger.info(`[ScanRoute] Processing bill scan for user ${userId.substring(0, 8)}...`);

      // ── Tier 1: Gemini Vision extraction ────────────────────────────────────
      try {
        const aiManager = getAIServiceManager();
        const scanResult = await aiManager.analyzeImageBase64(imageBase64, mimeType);

        // Calculate CO₂e from extracted kWh using the scientifically cited factor
        const kgCO2e = scanResult.kWhExtracted
          ? Math.round(scanResult.kWhExtracted * ELECTRICITY_KG_PER_KWH * 10000) / 10000
          : 0;

        logger.info(`[ScanRoute] Vision extraction complete: kWh=${scanResult.kWhExtracted}, confidence=${scanResult.confidence}`);

        return sendSuccess(res, {
          ...scanResult,
          kgCO2e,
          source: 'vision' as const,
        });
      } catch (visionError: unknown) {
        // Vision failure is non-fatal — guide the user to manual entry
        const visionMsg = visionError instanceof Error ? visionError.message : String(visionError);
        logger.warn('[ScanRoute] Gemini Vision failed — returning manual entry fallback', {
          error: visionMsg,
          userId: userId.substring(0, 8),
        });
      }

      // ── Tier 2: Manual entry fallback ───────────────────────────────────────
      // Vision is unavailable; return a structured response that signals the
      // frontend to show its manual kWh entry form. Shape is identical to
      // a successful Vision response — only kWhExtracted is null.
      logger.info('[ScanRoute] Returning manual-entry fallback response');

      return sendSuccess(res, {
        kWhExtracted: null,
        kgCO2e: 0,
        billProvider: null,
        billPeriod: null,
        confidence: 0,
        rawSummary: '',
        cached: false,
        source: 'fallback' as const,
        fallbackMessage:
          'Automatic bill extraction is temporarily unavailable. ' +
          'Please locate the kWh (kilowatt-hours) or Units figure on your bill and enter it manually. ' +
          'It is usually labelled "Total consumption", "Units used", or "kWh".',
      });
    } catch (error: unknown) {
      // Both tiers failed — should never reach here in normal operation
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[ScanRoute] Unexpected error in bill scan handler', { error: message });
      next(error);
    }
  }
);
