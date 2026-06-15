import logger from './logger.js';
import { RetryConfig } from '../../shared/types/index.js';

interface ResolvedRetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  backoffFactor: number;
  maxDelayMs: number;
  shouldRetry: (error: any) => boolean;
}

/**
 * Default retry configuration values.
 */
const DEFAULT_CONFIG: ResolvedRetryConfig = {
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
 * @param error - The error thrown by the wrapped function.
 * @returns True if the call should be retried.
 */
function defaultShouldRetry(error: any): boolean {
  if (error && typeof error === 'object') {
    // Network-level errors (ECONNRESET, ETIMEDOUT, etc.)
    if ('code' in error && typeof error.code === 'string' && ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'].includes(error.code)) {
      return true;
    }

    // HTTP status-based retry (rate limiting, server errors)
    const status = error.status || error.statusCode || (error.response && error.response.status);
    if (status) {
      return status === 429 || status === 503 || status === 502 || status === 504;
    }

    // Retry on generic timeout errors
    if ('message' in error && typeof error.message === 'string' && /timeout|timed out/i.test(error.message)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculates the delay (in ms) for a given attempt using exponential backoff
 * with jitter to prevent thundering herd problems.
 *
 * @param attempt - The current attempt number (0-indexed).
 * @param config - Resolved retry config.
 * @returns Delay in milliseconds.
 */
function calculateDelay(attempt: number, config: ResolvedRetryConfig): number {
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
 * @param fn - The async function to wrap.
 * @param config - Retry configuration.
 * @param operationName - Human-readable name for logging.
 * @returns Resolves with the function's return value on success.
 * @throws Re-throws the last error after all retry attempts are exhausted.
 */
export async function withRetry<T>(fn: () => Promise<T>, config: RetryConfig = {}, operationName = 'operation'): Promise<T> {
  const resolvedConfig: ResolvedRetryConfig = { ...DEFAULT_CONFIG, ...config } as ResolvedRetryConfig;
  const { maxAttempts, shouldRetry } = resolvedConfig;

  let lastError: any;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await fn();

      if (attempt > 0) {
        logger.info(`[withRetry] ${operationName} succeeded after ${attempt + 1} attempts`);
      }

      return result;
    } catch (error: any) {
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
  if (lastError) {
    lastError.retriesExhausted = true;
    lastError.operationName = operationName;
    throw lastError;
  }
  throw new Error(`[withRetry] ${operationName} failed with unknown error`);
}

/**
 * Promisified setTimeout helper.
 *
 * @param ms - Milliseconds to sleep.
 * @returns Promise that resolves after ms.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
