/**
 * @fileoverview AIServiceManager — Gemini AI service with caching and retry.
 *
 * Wraps the Google Gemini 2.0 Flash API to provide:
 * - Text generation for personalized eco-insights
 * - Multimodal image analysis for utility bill scanning
 * - LRU-style in-memory response cache (TTL-based)
 * - Automatic retry via withRetry utility
 * - Stub mode for testing without API calls
 *
 * @module services/AIServiceManager
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { withRetry } from '../utils/withRetry.js';
import { createModuleLogger } from '../utils/logger.js';
import { isStubEnabled } from '../utils/validateEnv.js';

const logger = createModuleLogger('AIServiceManager');

// ── Cache Implementation ─────────────────────────────────────────────────────
const CACHE_MAX_SIZE = 100;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * @typedef {object} CacheEntry
 * @property {*} value - Cached value.
 * @property {number} expiresAt - Unix timestamp (ms) when this entry expires.
 */

/**
 * Simple TTL-based LRU cache for AI responses.
 * Uses a Map for O(1) access and insertion-order for LRU eviction.
 *
 * @type {Map<string, CacheEntry>}
 */
const responseCache = new Map();

/**
 * Generates a deterministic cache key from a string input.
 *
 * @param {string} input - Input string to hash.
 * @returns {string} A 32-char hex-like key.
 */
function generateCacheKey(input) {
  // Simple djb2-style hash — not cryptographic, just for cache keying
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return `${hash}_${input.length}`;
}

/**
 * Retrieves a value from cache if present and not expired.
 *
 * @param {string} key - Cache key.
 * @returns {*|null} The cached value, or null if missing/expired.
 */
function getFromCache(key) {
  const entry = responseCache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  // LRU: move to end by re-inserting
  responseCache.delete(key);
  responseCache.set(key, entry);
  return entry.value;
}

/**
 * Stores a value in the cache, evicting oldest entries if at capacity.
 *
 * @param {string} key - Cache key.
 * @param {*} value - Value to store.
 * @param {number} [ttlMs=CACHE_TTL_MS] - Time-to-live in milliseconds.
 * @returns {void}
 */
function setInCache(key, value, ttlMs = CACHE_TTL_MS) {
  if (responseCache.size >= CACHE_MAX_SIZE) {
    // Evict the oldest entry (first inserted key)
    const oldestKey = responseCache.keys().next().value;
    responseCache.delete(oldestKey);
    logger.debug(`[Cache] Evicted oldest entry: ${oldestKey}`);
  }
  responseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ── Gemini Configuration ──────────────────────────────────────────────────────
/**
 * Safety settings for Gemini — configured to allow environmental/scientific content
 * while blocking harmful content.
 *
 * @type {Array<{category: HarmCategory, threshold: HarmBlockThreshold}>}
 */
const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

/** @type {import('@google/generative-ai').GenerationConfig} */
const GENERATION_CONFIG = {
  temperature: 0.7,
  topK: 40,
  topP: 0.95,
  maxOutputTokens: 2048,
};

// ── AIServiceManager Class ────────────────────────────────────────────────────
/**
 * Manages all AI interactions with the Google Gemini 2.0 Flash model.
 * Provides text generation and vision-based bill analysis with caching and retry.
 *
 * @class
 */
class AIServiceManager {
  /**
   * @param {string} apiKey - Google Gemini API key.
   */
  constructor(apiKey) {
    if (!apiKey && !isStubEnabled('GEMINI')) {
      throw new Error('AIServiceManager requires a valid GOOGLE_GEMINI_API_KEY');
    }

    if (!isStubEnabled('GEMINI')) {
      this._client = new GoogleGenerativeAI(apiKey);
      this._model = this._client.getGenerativeModel({
        model: 'gemini-2.0-flash',
        safetySettings: SAFETY_SETTINGS,
        generationConfig: GENERATION_CONFIG,
      });
    }

    logger.info(
      `AIServiceManager initialized. Stub mode: ${isStubEnabled('GEMINI')}. Cache size: ${CACHE_MAX_SIZE}.`
    );
  }

  /**
   * Generates a personalized eco-insight text using Gemini's text generation.
   * Results are cached by prompt hash to minimize API calls.
   *
   * @param {string} prompt - The full prompt to send to Gemini.
   * @param {object} [options={}] - Generation options.
   * @param {boolean} [options.skipCache=false] - Skip cache lookup and force fresh generation.
   * @param {number} [options.cacheTtlMs] - Custom cache TTL for this response.
   * @returns {Promise<{text: string, cached: boolean}>} Generated text and cache status.
   * @throws {Error} If Gemini API fails after all retries.
   *
   * @example
   * const insight = await aiManager.generateInsight(
   *   'Generate 3 actionable tips to reduce my 150 kg/month carbon footprint...'
   * );
   */
  async generateInsight(prompt, options = {}) {
    if (isStubEnabled('GEMINI')) {
      return this._stubInsight(prompt);
    }

    const cacheKey = generateCacheKey(prompt);

    if (!options.skipCache) {
      const cached = getFromCache(cacheKey);
      if (cached) {
        logger.debug('[AIServiceManager] Cache hit for insight prompt');
        return { text: cached, cached: true };
      }
    }

    const text = await withRetry(
      async () => {
        const result = await this._model.generateContent(prompt);
        const response = result.response;

        if (!response || !response.text) {
          throw new Error('Gemini returned an empty response.');
        }

        return response.text();
      },
      { maxAttempts: 3, initialDelayMs: 1000 },
      'gemini-generate-insight'
    );

    setInCache(cacheKey, text, options.cacheTtlMs);
    logger.info('[AIServiceManager] Insight generated and cached successfully');

    return { text, cached: false };
  }

  /**
   * Analyzes a utility bill image using Gemini's multimodal vision capabilities.
   * Extracts energy consumption (kWh), provider name, and billing period.
   *
   * @param {string} base64Image - Base64-encoded image data (without data: prefix).
   * @param {string} mimeType - Image MIME type (e.g., 'image/jpeg', 'image/png', 'application/pdf').
   * @returns {Promise<{kWhExtracted: number|null, billProvider: string|null, billPeriod: string|null, confidence: number, rawSummary: string, cached: boolean}>}
   * @throws {Error} If the image cannot be analyzed after all retries.
   *
   * @example
   * const result = await aiManager.analyzeImageBase64(base64Data, 'image/png');
   * // { kWhExtracted: 245.3, billProvider: 'EDF Energy', billPeriod: 'July 2025', confidence: 0.95 }
   */
  async analyzeImageBase64(base64Image, mimeType) {
    if (isStubEnabled('GEMINI') || isStubEnabled('VISION')) {
      return this._stubBillScan();
    }

    const cacheKey = generateCacheKey(base64Image.slice(0, 200));
    const cached = getFromCache(cacheKey);
    if (cached) {
      logger.debug('[AIServiceManager] Cache hit for bill scan');
      return { ...cached, cached: true };
    }

    const extractionPrompt = `You are an expert at extracting energy usage data from utility bills.

Analyze this utility bill image and extract the following information in JSON format:
{
  "kWhExtracted": <number or null if not found>,
  "billProvider": "<string or null>",
  "billPeriod": "<string like 'July 2025' or null>",
  "confidence": <0-1 float representing extraction confidence>,
  "notes": "<any relevant observations about the bill>"
}

Rules:
- kWhExtracted MUST be the total electricity consumption in kilowatt-hours (kWh)
- Look for terms like "Units Used", "kWh", "Electricity Used", "Energy Consumption"
- If you see only cost, not kWh, set kWhExtracted to null
- confidence should reflect how clearly the values were visible
- Respond ONLY with the JSON object, no other text`;

    const rawSummary = await withRetry(
      async () => {
        const result = await this._model.generateContent([
          extractionPrompt,
          {
            inlineData: {
              mimeType,
              data: base64Image,
            },
          },
        ]);

        const response = result.response;
        if (!response || !response.text) {
          throw new Error('Gemini Vision returned an empty response.');
        }

        return response.text();
      },
      { maxAttempts: 3, initialDelayMs: 1500 },
      'gemini-vision-bill-scan'
    );

    const parsed = this._parseBillScanResponse(rawSummary);
    setInCache(cacheKey, parsed);
    logger.info('[AIServiceManager] Bill scan completed', { kWh: parsed.kWhExtracted, confidence: parsed.confidence });

    return { ...parsed, rawSummary, cached: false };
  }

  /**
   * Parses Gemini's JSON response for bill scanning.
   * Handles malformed JSON gracefully.
   *
   * @param {string} rawText - Raw text from Gemini.
   * @returns {{kWhExtracted: number|null, billProvider: string|null, billPeriod: string|null, confidence: number}}
   * @private
   */
  _parseBillScanResponse(rawText) {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        kWhExtracted: typeof parsed.kWhExtracted === 'number' ? parsed.kWhExtracted : null,
        billProvider: typeof parsed.billProvider === 'string' ? parsed.billProvider : null,
        billPeriod: typeof parsed.billPeriod === 'string' ? parsed.billPeriod : null,
        confidence: typeof parsed.confidence === 'number'
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.5,
      };
    } catch (error) {
      logger.warn('[AIServiceManager] Failed to parse bill scan JSON response', { error: error.message, rawText });
      return { kWhExtracted: null, billProvider: null, billPeriod: null, confidence: 0 };
    }
  }

  /**
   * Returns a stub insight response for testing without API calls.
   *
   * @param {string} _prompt - Unused prompt (for stub signature compatibility).
   * @returns {{text: string, cached: boolean}}
   * @private
   */
  _stubInsight(_prompt) {
    logger.info('[AIServiceManager] Returning stub insight (GEMINI_STUB=true)');
    return {
      text: `## Your Personalized Eco-Insights (Stub Mode)

**Tip 1: Switch to renewable energy** 🌱
Contact your energy provider about switching to a green tariff. This could save ~45 kg CO₂e/month.

**Tip 2: Optimize your commute** 🚗
Consider carpooling or using public transit 2 days per week. Estimated saving: 12 kg CO₂e/month.

**Tip 3: Reduce standby power** ⚡
Unplug devices when not in use. Small changes add up to ~3 kg CO₂e/month.`,
      cached: false,
    };
  }

  /**
   * Returns a stub bill scan response for testing.
   *
   * @returns {{kWhExtracted: number, billProvider: string, billPeriod: string, confidence: number, rawSummary: string, cached: boolean}}
   * @private
   */
  _stubBillScan() {
    logger.info('[AIServiceManager] Returning stub bill scan (VISION_STUB=true)');
    return {
      kWhExtracted: 245.3,
      billProvider: 'Demo Energy Co. (Stub)',
      billPeriod: 'July 2025',
      confidence: 0.92,
      rawSummary: '{"kWhExtracted":245.3,"billProvider":"Demo Energy Co.","billPeriod":"July 2025","confidence":0.92}',
      cached: false,
    };
  }

  /**
   * Returns cache statistics for monitoring/debugging.
   *
   * @returns {{size: number, maxSize: number, ttlMs: number}}
   */
  getCacheStats() {
    return {
      size: responseCache.size,
      maxSize: CACHE_MAX_SIZE,
      ttlMs: CACHE_TTL_MS,
    };
  }

  /**
   * Clears the entire response cache.
   * Useful for testing and cache invalidation scenarios.
   *
   * @returns {void}
   */
  clearCache() {
    const previousSize = responseCache.size;
    responseCache.clear();
    logger.info(`[AIServiceManager] Cache cleared. Removed ${previousSize} entries.`);
  }
}

// ── Singleton Export ──────────────────────────────────────────────────────────
/**
 * Lazily instantiated singleton instance of AIServiceManager.
 * @type {AIServiceManager|null}
 */
let _instance = null;

/**
 * Returns the singleton AIServiceManager instance.
 * Creates it on first call using the GOOGLE_GEMINI_API_KEY environment variable.
 *
 * @returns {AIServiceManager}
 */
export function getAIServiceManager() {
  if (!_instance) {
    _instance = new AIServiceManager(process.env.GOOGLE_GEMINI_API_KEY);
  }
  return _instance;
}

export { AIServiceManager };
