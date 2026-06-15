/**
 * @fileoverview Backend unit tests — withRetry utility.
 * Tests exponential backoff, retry limits, and error classification.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry } from '../utils/withRetry.js';

interface TestError extends Error {
  code?: string;
  status?: number;
  retriesExhausted?: boolean;
  operationName?: string;
}

// Mock the logger to prevent output during tests
vi.mock('../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('withRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves immediately when function succeeds on first try', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn, {}, 'test-op');
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on transient network errors and eventually succeeds', async () => {
    const networkError = new Error('ECONNRESET') as TestError;
    networkError.code = 'ECONNRESET';

    const fn = vi
      .fn()
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockResolvedValue('recovered');

    const result = await withRetry(
      fn,
      { maxAttempts: 3, initialDelayMs: 10 },
      'network-test'
    );

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on non-retryable errors (e.g., 400 Bad Request)', async () => {
    const badRequestError = new Error('Bad Request') as TestError;
    badRequestError.status = 400;

    const fn = vi.fn().mockRejectedValue(badRequestError);

    await expect(
      withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 }, 'bad-request-test')
    ).rejects.toThrow('Bad Request');

    expect(fn).toHaveBeenCalledTimes(1); // No retries
  });

  it('retries on 429 rate limit errors', async () => {
    const rateLimitError = new Error('Rate Limited') as TestError;
    rateLimitError.status = 429;

    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValue('ok');

    const result = await withRetry(
      fn,
      { maxAttempts: 2, initialDelayMs: 10 },
      'rate-limit-test'
    );

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on 503 service unavailable errors', async () => {
    const serviceError = new Error('Service Unavailable') as TestError;
    serviceError.status = 503;

    const fn = vi
      .fn()
      .mockRejectedValueOnce(serviceError)
      .mockResolvedValue('available');

    const result = await withRetry(
      fn,
      { maxAttempts: 2, initialDelayMs: 10 },
      '503-test'
    );

    expect(result).toBe('available');
  });

  it('throws the last error after all attempts exhausted', async () => {
    const persistentError = new Error('Always fails') as TestError;
    persistentError.code = 'ETIMEDOUT';

    const fn = vi.fn().mockRejectedValue(persistentError);

    const error = (await withRetry(
      fn,
      { maxAttempts: 3, initialDelayMs: 10 },
      'exhausted-test'
    ).catch((e) => e)) as TestError;

    expect(error).toBe(persistentError);
    expect(error.retriesExhausted).toBe(true);
    expect(error.operationName).toBe('exhausted-test');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respects custom shouldRetry predicate', async () => {
    const error = new Error('Custom error');

    const fn = vi.fn().mockRejectedValue(error);

    // Custom: never retry
    await expect(
      withRetry(
        fn,
        { maxAttempts: 3, initialDelayMs: 10, shouldRetry: () => false },
        'custom-shouldretry'
      )
    ).rejects.toThrow('Custom error');

    expect(fn).toHaveBeenCalledTimes(1); // Stopped immediately
  });

  it('handles timeout error messages', async () => {
    const timeoutError = new Error('request timed out after 5000ms');
    const fn = vi
      .fn()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValue('after timeout retry');

    const result = await withRetry(fn, { maxAttempts: 2, initialDelayMs: 10 }, 'timeout-test');
    expect(result).toBe('after timeout retry');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('uses maxAttempts=1 to disable retries entirely', async () => {
    const error = new Error('ECONNRESET') as TestError;
    error.code = 'ECONNRESET';

    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      withRetry(fn, { maxAttempts: 1, initialDelayMs: 10 }, 'no-retry')
    ).rejects.toThrow('ECONNRESET');

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
