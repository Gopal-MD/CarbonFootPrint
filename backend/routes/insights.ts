/**
 * @fileoverview AI Eco-Insights route.
 * Generates personalized carbon reduction insights using Gemini AI.
 * @module routes/insights
 */

import { Router, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { getAIServiceManager } from '../services/AIServiceManager.js';
import { sendSuccess, sendError, sendValidationError } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';

export const insightsRouter = Router();

interface InsightPromptParams {
  monthlyKgCO2e: number;
  commuteKg: number;
  utilityKg: number;
  travelMode: string;
}

/**
 * POST /api/insights
 * Generates personalized eco-insights based on user's emission data.
 * Requires a valid Firebase ID token in the Authorization header.
 */
insightsRouter.post(
  '/',
  requireAuth,
  [
    body('monthlyKgCO2e')
      .isFloat({ min: 0, max: 100000 })
      .withMessage('monthlyKgCO2e must be a non-negative number'),
    body('commuteKg').optional().isFloat({ min: 0 }).withMessage('commuteKg must be non-negative'),
    body('utilityKg').optional().isFloat({ min: 0 }).withMessage('utilityKg must be non-negative'),
    body('travelMode').optional().isIn(['DRIVING', 'TRANSIT', 'WALKING', 'BICYCLING', 'MIXED']),
  ],
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<any> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return sendValidationError(res, errors, 'insights input');
      }

      // userId is always derived from the verified Firebase token — never from req.body
      if (!req.user) {
        return sendError(res, 'UNAUTHORIZED', 'Authentication required.', 401);
      }
      const userId = req.user.uid;

      if (req.body.userId && req.body.userId !== userId) {
        logger.warn(`[InsightsRoute] Cross-user access attempt: token=${userId.substring(0, 8)} body=${String(req.body.userId).substring(0, 8)}`);
        return sendError(res, 'FORBIDDEN', 'You are not authorized to access or modify records for another user.', 403);
      }

      const {
        monthlyKgCO2e,
        commuteKg = 0,
        utilityKg = 0,
        travelMode = 'DRIVING',
      } = req.body;

      const prompt = buildInsightPrompt({ monthlyKgCO2e, commuteKg, utilityKg, travelMode });

      logger.info(`[InsightsRoute] Generating insight for user ${userId.substring(0, 8)}...`, {
        monthlyKgCO2e,
        commuteKg,
        utilityKg,
      });

      const aiManager = getAIServiceManager();
      const { text, cached } = await aiManager.generateInsight(prompt);

      return sendSuccess(res, {
        insightText: text,
        cached,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Builds a detailed prompt for Gemini to generate personalized eco-insights.
 * The prompt includes specific user data to enable truly personalized recommendations.
 *
 * @param params - Emission data parameters.
 * @returns The complete prompt string.
 */
function buildInsightPrompt({ monthlyKgCO2e, commuteKg, utilityKg, travelMode }: InsightPromptParams): string {
  const globalAvg = 400; // kg CO₂e / month (global average)
  const comparison = monthlyKgCO2e < globalAvg
    ? `${((1 - monthlyKgCO2e / globalAvg) * 100).toFixed(0)}% below the global average`
    : `${((monthlyKgCO2e / globalAvg - 1) * 100).toFixed(0)}% above the global average`;

  return `You are EcoAssist, an empathetic and expert sustainability advisor. Generate a personalized, encouraging, and highly actionable carbon reduction report.

## User's Carbon Profile
- **Total monthly footprint**: ${monthlyKgCO2e.toFixed(1)} kg CO₂e (${comparison} of ${globalAvg} kg)
- **Commute emissions**: ${commuteKg.toFixed(1)} kg CO₂e (primary mode: ${travelMode})
- **Utility/energy emissions**: ${utilityKg.toFixed(1)} kg CO₂e
- **Other sources**: ${(monthlyKgCO2e - commuteKg - utilityKg).toFixed(1)} kg CO₂e

## Instructions
Generate exactly 4 personalized, actionable tips. For each tip:
1. Give it an emoji and a clear title
2. Explain WHY it matters with specific numbers
3. Explain HOW to implement it (3 concrete steps)
4. Estimate the monthly CO₂e savings in kg
5. Rate the effort level: 🟢 Easy | 🟡 Medium | 🔴 Challenging

Focus on their HIGHEST emission source first. Be specific, not generic.
Use markdown formatting with headers and bullet points.
End with an encouraging message about their progress.`;
}
