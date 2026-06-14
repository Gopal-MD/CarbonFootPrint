/**
 * @fileoverview Utility bill scan route stub.
 * Full implementation with Gemini Vision API in Step 3.
 * @module routes/scan
 */

import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { isStubEnabled } from '../utils/validateEnv.js';
import { getAIServiceManager } from '../services/AIServiceManager.js';
import logger from '../utils/logger.js';

export const scanRouter = Router();

/** Maximum image size: 10 MB in base64 chars */
const MAX_BASE64_LENGTH = 10 * 1024 * 1024 * 1.37; // ~13.7 MB chars

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

/**
 * POST /api/scan
 * Analyzes an uploaded utility bill image using Gemini Vision to extract
 * energy consumption (kWh) and calculate carbon emissions.
 *
 * Request body:
 *  - imageBase64: string — Base64-encoded image data
 *  - mimeType: string — Image MIME type
 *  - userId: string — Firebase UID of the authenticated user
 *
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Express next middleware.
 * @returns {Promise<void>}
 */
scanRouter.post(
  '/',
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
    body('userId')
      .trim()
      .notEmpty()
      .withMessage('userId is required')
      .isLength({ max: 128 })
      .withMessage('userId too long'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid scan input',
          details: errors.array().map((e) => ({ field: e.path, message: e.msg })),
          statusCode: 422,
        });
      }

      const { imageBase64, mimeType, userId } = req.body;
      logger.info(`[ScanRoute] Processing bill scan for user ${userId.substring(0, 8)}...`);

      const aiManager = getAIServiceManager();
      const scanResult = await aiManager.analyzeImageBase64(imageBase64, mimeType);

      // Calculate CO₂ from extracted kWh
      const ELECTRICITY_FACTOR = 0.21233; // kg CO₂e / kWh
      const kgCO2e = scanResult.kWhExtracted
        ? Math.round(scanResult.kWhExtracted * ELECTRICITY_FACTOR * 10000) / 10000
        : 0;

      return res.status(200).json({
        success: true,
        data: {
          ...scanResult,
          kgCO2e,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);
