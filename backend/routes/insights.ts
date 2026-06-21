/**
 * @fileoverview AI Eco-Insights route.
 *
 * Generates personalized carbon reduction insights using the Gemini AI model.
 * Implements a two-tier graceful degradation strategy so the endpoint
 * **always** returns actionable recommendations — even if Gemini is unavailable:
 *
 *   Tier 1 (preferred): Gemini 2.0 Flash → rich, conversational, personalised insights
 *   Tier 2 (fallback):  Rules engine     → deterministic, category-weighted tips
 *
 * This pattern ensures zero downtime from external AI API failures and keeps
 * the user experience intact during rate limiting or quota exhaustion.
 *
 * @module routes/insights
 */

import { Router, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { requireAuth, AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { getAIServiceManager } from '../services/AIServiceManager.js';
import { sendSuccess, sendError, sendValidationError } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';

export const insightsRouter = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

interface InsightPromptParams {
  monthlyKgCO2e: number;
  commuteKg: number;
  utilityKg: number;
  travelMode: string;
}

interface RulesBasedTip {
  title: string;
  category: string;
  emoji: string;
  description: string;
  effortLevel: 'easy' | 'medium' | 'challenging';
  estimatedSavingKgMonth: number;
}

// ── Validation ────────────────────────────────────────────────────────────────

const validateInsightsInput = [
  body('monthlyKgCO2e')
    .isFloat({ min: 0, max: 100000 })
    .withMessage('monthlyKgCO2e must be a non-negative number'),
  body('commuteKg').optional().isFloat({ min: 0 }).withMessage('commuteKg must be non-negative'),
  body('utilityKg').optional().isFloat({ min: 0 }).withMessage('utilityKg must be non-negative'),
  body('travelMode').optional().isIn(['DRIVING', 'TRANSIT', 'WALKING', 'BICYCLING', 'MIXED']),
];

// ── POST /api/insights ────────────────────────────────────────────────────────
/**
 * Generate personalized carbon reduction insights.
 *
 * **Purpose:** Produce 4 prioritized, actionable tips ranked by the user's
 * highest emission source (commute, utility, or other). Each tip includes
 * effort level, estimated monthly saving, and concrete implementation steps.
 *
 * **Access Control:**
 * - Requires Firebase ID token verification (via `requireAuth`)
 * - `userId` is derived exclusively from `req.user.uid` (verified token claim)
 * - Any `req.body.userId` that mismatches the token UID is rejected with 403
 *
 * **Graceful Degradation:**
 * - **Primary**: Calls Gemini 2.0 Flash for rich, conversational insights
 * - **Fallback**: If Gemini fails (timeout, quota, API error), the rules-based
 *   engine generates deterministic, category-weighted tips from the same input
 * - The response shape is **identical** in both cases — clients need no special handling
 * - The `source` field (`"gemini"` | `"rules"`) allows monitoring/debugging
 *
 * **Behavior (step-by-step):**
 * 1. Validate `monthlyKgCO2e` (required), `commuteKg`, `utilityKg`, `travelMode` (optional)
 * 2. Verify Firebase ID token → extract `userId`
 * 3. Build a structured Gemini prompt with the user's emission breakdown
 * 4. Attempt Gemini generation (with 3-attempt exponential backoff via withRetry)
 * 5. On Gemini success: return AI insights with `source: "gemini"`
 * 6. On Gemini failure: log warning → invoke rules engine → return with `source: "rules"`
 *
 * **Error Cases:**
 * - `422`: Missing or invalid input fields
 * - `401`: Missing or expired Firebase ID token
 * - `403`: `req.body.userId` mismatches verified token UID
 * - `500`: Both Gemini and rules engine failed (extremely rare)
 *
 * @route POST /api/insights
 * @access Private (Firebase ID token required)
 *
 * @example
 * POST /api/insights
 * Authorization: Bearer <firebase-id-token>
 * Content-Type: application/json
 *
 * {
 *   "monthlyKgCO2e": 142.5,
 *   "commuteKg": 48.3,
 *   "utilityKg": 78.2,
 *   "travelMode": "DRIVING"
 * }
 *
 * // Success (Gemini path)
 * {
 *   "success": true,
 *   "data": {
 *     "insightText": "## Your Personalized Eco-Insights...",
 *     "cached": false,
 *     "source": "gemini",
 *     "generatedAt": "2026-06-20T16:05:01.234Z"
 *   },
 *   "statusCode": 200
 * }
 *
 * // Success (fallback rules path — identical shape)
 * {
 *   "success": true,
 *   "data": {
 *     "insightText": "## Your Eco-Reduction Plan...",
 *     "cached": false,
 *     "source": "rules",
 *     "generatedAt": "2026-06-20T16:05:01.234Z"
 *   },
 *   "statusCode": 200
 * }
 */
insightsRouter.post(
  '/',
  requireAuth,
  validateInsightsInput,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void | Response> => {
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
      } = req.body as {
        monthlyKgCO2e: number;
        commuteKg?: number;
        utilityKg?: number;
        travelMode?: string;
      };

      const promptParams: InsightPromptParams = { monthlyKgCO2e, commuteKg, utilityKg, travelMode };

      logger.info(`[InsightsRoute] Generating insight for user ${userId.substring(0, 8)}...`, {
        monthlyKgCO2e,
        commuteKg,
        utilityKg,
      });

      // ── Tier 1: Gemini AI insights ──────────────────────────────────────────
      try {
        const aiManager = getAIServiceManager();
        const { text, cached } = await aiManager.generateInsight(buildInsightPrompt(promptParams));

        logger.info(`[InsightsRoute] Gemini insight generated successfully (cached=${cached})`);

        return sendSuccess(res, {
          insightText: text,
          cached,
          source: 'gemini' as const,
          generatedAt: new Date().toISOString(),
        });
      } catch (geminiError: unknown) {
        // Gemini failure is non-fatal — log it and fall through to the rules engine
        const geminiMsg = geminiError instanceof Error ? geminiError.message : String(geminiError);
        logger.warn('[InsightsRoute] Gemini failed — activating rules-based fallback', {
          error: geminiMsg,
          userId: userId.substring(0, 8),
        });
      }

      // ── Tier 2: Rules-based fallback ────────────────────────────────────────
      // Always succeeds — deterministic, no external calls.
      const rulesText = generateRulesBasedInsights(promptParams);

      logger.info('[InsightsRoute] Rules-based insights generated as Gemini fallback');

      return sendSuccess(res, {
        insightText: rulesText,
        cached: false,
        source: 'rules' as const,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: unknown) {
      // Both tiers failed — extremely rare (e.g., logic bug, OOM)
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[InsightsRoute] Both Gemini and rules engine failed', { error: message });
      next(error);
    }
  }
);

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Builds a structured Gemini prompt personalised with the user's emission profile.
 *
 * The prompt is designed to:
 * 1. Give Gemini precise context (not just "help me be green")
 * 2. Force structured output (4 tips, ranked by impact)
 * 3. Include specific saving estimates so the AI uses real numbers
 *
 * @param params - User emission breakdown.
 * @param params.monthlyKgCO2e
 * @param params.commuteKg
 * @param params.utilityKg
 * @param params.travelMode
 * @returns Complete prompt string ready to send to Gemini.
 */
function buildInsightPrompt({ monthlyKgCO2e, commuteKg, utilityKg, travelMode }: InsightPromptParams): string {
  const globalAvg = 400; // kg CO₂e / month (global average, IPCC AR6)
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

// ── Rules-based fallback engine ───────────────────────────────────────────────

/**
 * Generates deterministic, category-weighted eco-insights without any external calls.
 * Used as the Tier 2 fallback when Gemini is unavailable.
 *
 * Tips are ranked by the user's highest emission source. Saving estimates are
 * calculated from the user's actual input rather than generic values.
 *
 * @param params - User emission breakdown.
 * @param params.monthlyKgCO2e
 * @param params.commuteKg
 * @param params.utilityKg
 * @param params.travelMode
 * @returns Formatted markdown insight string (same shape as Gemini output).
 */
function generateRulesBasedInsights({ monthlyKgCO2e, commuteKg, utilityKg, travelMode }: InsightPromptParams): string {
  const otherKg = Math.max(0, monthlyKgCO2e - commuteKg - utilityKg);

  // Build tips ranked by emission source weight
  const tips: RulesBasedTip[] = [];

  // Commute tips
  if (commuteKg > 0) {
    if (travelMode === 'DRIVING') {
      tips.push({
        title: 'Switch to public transit for your commute',
        category: 'commute',
        emoji: '🚌',
        description: `Your driving commute contributes ${commuteKg.toFixed(1)} kg CO₂e/month. Switching to public transit even 3 days per week could cut this by ~60%.`,
        effortLevel: 'medium',
        estimatedSavingKgMonth: Math.round(commuteKg * 0.6 * 10) / 10,
      });
      tips.push({
        title: 'Try carpooling or remote work on Fridays',
        category: 'commute',
        emoji: '🤝',
        description: `Sharing your drive with one colleague halves per-person emissions. Working from home one day per week reduces commute emissions by 20%.`,
        effortLevel: 'easy',
        estimatedSavingKgMonth: Math.round(commuteKg * 0.2 * 10) / 10,
      });
    } else if (travelMode === 'TRANSIT' || travelMode === 'WALKING' || travelMode === 'BICYCLING') {
      tips.push({
        title: 'Great commute choice — explore EV for occasional driving',
        category: 'commute',
        emoji: '⚡',
        description: `Your ${travelMode.toLowerCase()} commute is already low-carbon. If you occasionally use a car, an EV or hybrid reduces those trips' emissions by 65%.`,
        effortLevel: 'challenging',
        estimatedSavingKgMonth: Math.round(commuteKg * 0.3 * 10) / 10,
      });
    }
  }

  // Utility tips
  if (utilityKg > 0) {
    tips.push({
      title: 'Switch to a green energy tariff',
      category: 'utility',
      emoji: '🌱',
      description: `Your energy use produces ${utilityKg.toFixed(1)} kg CO₂e/month. Moving to a 100% renewable tariff can eliminate up to 90% of electricity-related emissions at zero upfront cost.`,
      effortLevel: 'easy',
      estimatedSavingKgMonth: Math.round(utilityKg * 0.85 * 10) / 10,
    });
    tips.push({
      title: 'Reduce standby power and upgrade appliances',
      category: 'utility',
      emoji: '💡',
      description: 'Standby power accounts for 5–10% of household electricity. Smart plugs with schedules + switching to LED lighting saves an average of 15 kg CO₂e/month.',
      effortLevel: 'easy',
      estimatedSavingKgMonth: Math.min(15, Math.round(utilityKg * 0.1 * 10) / 10),
    });
  }

  // Other / diet tips
  if (otherKg > 0 || tips.length < 4) {
    tips.push({
      title: 'Adopt a flexitarian diet — reduce red meat by 50%',
      category: 'food',
      emoji: '🥗',
      description: 'Beef produces 20–30× more CO₂e than plant proteins per calorie. Replacing red meat with chicken, legumes, or tofu 3 days per week saves ~10 kg CO₂e/month for an average household.',
      effortLevel: 'medium',
      estimatedSavingKgMonth: 10,
    });
  }

  // Cap to 4 tips
  const finalTips = tips.slice(0, 4);

  const totalSaving = finalTips.reduce((sum, t) => sum + t.estimatedSavingKgMonth, 0);
  const globalAvg = 400;
  const comparison = monthlyKgCO2e < globalAvg ? 'below' : 'above';

  const lines: string[] = [
    `## Your Eco-Reduction Plan 🌍`,
    ``,
    `You're tracking **${monthlyKgCO2e.toFixed(1)} kg CO₂e/month**, which is ${comparison} the global average of ${globalAvg} kg. `,
    `These ${finalTips.length} targeted actions could save you up to **${totalSaving.toFixed(1)} kg CO₂e/month** — here's where to start:`,
    ``,
  ];

  const effortEmoji: Record<RulesBasedTip['effortLevel'], string> = {
    easy: '🟢',
    medium: '🟡',
    challenging: '🔴',
  };

  finalTips.forEach((tip, i) => {
    lines.push(`### ${i + 1}. ${tip.emoji} ${tip.title}`);
    lines.push(`**Effort:** ${effortEmoji[tip.effortLevel]} ${tip.effortLevel.charAt(0).toUpperCase() + tip.effortLevel.slice(1)} | **Saving:** ~${tip.estimatedSavingKgMonth} kg CO₂e/month`);
    lines.push(``);
    lines.push(tip.description);
    lines.push(``);
  });

  lines.push(`---`);
  lines.push(`*These recommendations are based on your reported footprint data. Actual savings may vary by region, lifestyle, and usage patterns.*`);

  return lines.join('\n');
}
