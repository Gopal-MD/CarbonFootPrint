import logger from './logger.js';
import { RetryConfig } from '../../shared/types/index.js';

interface ResolvedRetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  backoffFactor: number;
  maxDelayMs: number;
  shouldRetry: (error: unknown) => boolean;
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
 * @param error - The unknown value thrown by the wrapped function.
 * @returns True if the call should be retried.
 */
function defaultShouldRetry(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;

    // Network-level errors (ECONNRESET, ETIMEDOUT, etc.)
    const RETRIABLE_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];
    if ('code' in err && typeof err.code === 'string' && RETRIABLE_CODES.includes(err.code)) {
      return true;
    }

    // HTTP status-based retry (rate limiting, server errors)
    const responseStatus =
      (err.response && typeof err.response === 'object')
        ? (err.response as Record<string, unknown>).status
        : undefined;
    const status = err.status ?? err.statusCode ?? responseStatus;
    if (typeof status === 'number') {
      return status === 429 || status === 503 || status === 502 || status === 504;
    }

    // Retry on generic timeout errors
    if ('message' in err && typeof err.message === 'string' && /timeout|timed out/i.test(err.message)) {
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

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await fn();

      if (attempt > 0) {
        logger.info(`[withRetry] ${operationName} succeeded after ${attempt + 1} attempts`);
      }

      return result;
    } catch (error: unknown) {
      lastError = error;

      const isLastAttempt = attempt === maxAttempts - 1;
      const retryable = shouldRetry(error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.warn(
        `[withRetry] ${operationName} failed on attempt ${attempt + 1}/${maxAttempts}. ` +
          `Retryable: ${retryable}. Error: ${errorMessage}`
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
  if (lastError && typeof lastError === 'object') {
    (lastError as Record<string, unknown>).retriesExhausted = true;
    (lastError as Record<string, unknown>).operationName = operationName;
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
