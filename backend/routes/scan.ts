/**
 * @fileoverview Utility bill scan route.
 * Analyzes utility bill images using Gemini Vision API.
 * @module routes/scan
 */

import { Router, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { getAIServiceManager } from '../services/AIServiceManager.js';
import { sendSuccess, sendError, sendValidationError } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';

export const scanRouter = Router();

/** Maximum image size: 10 MB in base64 chars */
const MAX_BASE64_LENGTH = 10 * 1024 * 1024 * 1.37; // ~13.7 MB chars

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

/**
 * POST /api/scan
 * Analyzes an uploaded utility bill image using Gemini Vision to extract
 * energy consumption (kWh) and calculate carbon emissions.
 * Requires a valid Firebase ID token in the Authorization header.
 */
scanRouter.post(
  '/',
  requireAuth,
  [
    body('imageBase64')
      .notEmpty()
      .withMessage('imageBase64 is required')
      .isString()
      .withMessage('imageBase64 must be a string')
      .custom((value) => {
        if (value.length > MAX_BASE64_LENGTH) {
          throw new Error('Image exceeds maximum allowed size of 10 MB');
        }
        // Validate base64 format
        if (!/^[A-Za-z0-9+/]+=*$/.test(value)) {
          throw new Error('imageBase64 is not valid base64');
        }
        return true;
      }),
    body('mimeType')
      .isIn(ALLOWED_MIME_TYPES)
      .withMessage(`mimeType must be one of: ${ALLOWED_MIME_TYPES.join(', ')}`),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
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

      const { imageBase64, mimeType } = req.body;
      logger.info(`[ScanRoute] Processing bill scan for user ${userId.substring(0, 8)}...`);

      const aiManager = getAIServiceManager();
      const scanResult = await aiManager.analyzeImageBase64(imageBase64, mimeType);

      // Calculate CO₂ from extracted kWh
      const ELECTRICITY_FACTOR = 0.21233; // kg CO₂e / kWh
      const kgCO2e = scanResult.kWhExtracted
        ? Math.round(scanResult.kWhExtracted * ELECTRICITY_FACTOR * 10000) / 10000
        : 0;

      return sendSuccess(res, {
        ...scanResult,
        kgCO2e,
      });
    } catch (error) {
      next(error);
    }
  }
);
