/**
 * @fileoverview Exponential backoff retry utility for external API calls.
 *
 * Wraps async functions (Gemini AI, Google Maps, Cloud Vision) with a
 * configurable retry mechanism that handles transient network failures,
 * rate limiting (429), and service unavailability (503) gracefully.
 *
 * @module utils/withRetry
 */

import logger from './logger.js';

/**
 * Default retry configuration values.
 *
 * @type {import('../types/eco_types.js').RetryConfig}
 */
const DEFAULT_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 500,
  backoffFactor: 2,
  maxDelayMs: 10000,
  shouldRetry: defaultShouldRetry,
};

/**
 * Default predicate determining whether an error is retryable.
 * Retries on network errors and specific HTTP status codes.
 *
 * @param {Error} error - The error thrown by the wrapped function.
 * @returns {boolean} True if the call should be retried.
 */
function defaultShouldRetry(error) {
  // Network-level errors (ECONNRESET, ETIMEDOUT, etc.)
  if (error.code && ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'].includes(error.code)) {
    return true;
  }

  // HTTP status-based retry (rate limiting, server errors)
  const status = error.status || error.statusCode || (error.response && error.response.status);
  if (status) {
    return status === 429 || status === 503 || status === 502 || status === 504;
  }

  // Retry on generic timeout errors
  if (error.message && /timeout|timed out/i.test(error.message)) {
    return true;
  }

  return false;
}

/**
 * Calculates the delay (in ms) for a given attempt using exponential backoff
 * with jitter to prevent thundering herd problems.
 *
 * @param {number} attempt - The current attempt number (0-indexed).
 * @param {Required<import('../types/eco_types.js').RetryConfig>} config - Resolved retry config.
 * @returns {number} Delay in milliseconds.
 */
function calculateDelay(attempt, config) {
  const exponential = config.initialDelayMs * Math.pow(config.backoffFactor, attempt);
  const capped = Math.min(exponential, config.maxDelayMs);
  // Add ±25% jitter to prevent synchronized retries across requests
  const jitter = capped * (0.75 + Math.random() * 0.5);
  return Math.floor(jitter);
}

/**
 * Wraps an async function with exponential backoff retry logic.
 *
 * @template T
 * @param {function(): Promise<T>} fn - The async function to wrap.
 * @param {import('../types/eco_types.js').RetryConfig} [config] - Retry configuration.
 * @param {string} [operationName='operation'] - Human-readable name for logging.
 * @returns {Promise<T>} Resolves with the function's return value on success.
 * @throws {Error} Re-throws the last error after all retry attempts are exhausted.
 *
 * @example
 * const result = await withRetry(
 *   () => geminiClient.generateContent(prompt),
 *   { maxAttempts: 3, initialDelayMs: 1000 },
 *   'gemini-generate'
 * );
 */
export async function withRetry(fn, config = {}, operationName = 'operation') {
  /** @type {Required<import('../types/eco_types.js').RetryConfig>} */
  const resolvedConfig = { ...DEFAULT_CONFIG, ...config };
  const { maxAttempts, shouldRetry } = resolvedConfig;

  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await fn();

      if (attempt > 0) {
        logger.info(`[withRetry] ${operationName} succeeded after ${attempt + 1} attempts`);
      }

      return result;
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === maxAttempts - 1;
      const retryable = shouldRetry(error);

      logger.warn(
        `[withRetry] ${operationName} failed on attempt ${attempt + 1}/${maxAttempts}. ` +
          `Retryable: ${retryable}. Error: ${error.message}`
      );

      if (isLastAttempt || !retryable) {
        break;
      }

      const delay = calculateDelay(attempt, resolvedConfig);
      logger.info(`[withRetry] Retrying ${operationName} in ${delay}ms...`);

      await sleep(delay);
    }
  }

  // Attach retry context to the error for upstream error handlers
  lastError.retriesExhausted = true;
  lastError.operationName = operationName;
  throw lastError;
}

/**
 * Promisified setTimeout helper.
 *
 * @param {number} ms - Milliseconds to sleep.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
