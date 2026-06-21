/**
 * @fileoverview Unit tests for utility modules.
 *
 * Covers:
 * - withRetry: retry logic, exponential backoff, error propagation
 * - apiResponse: sendSuccess, sendError, sendValidationError
 * - validateEnv: getEnv, isProduction, isStubEnabled
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── withRetry ─────────────────────────────────────────────────────────────────
import { withRetry } from '../../utils/withRetry.js';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the result on the first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 }, 'test-op');
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable error and succeeds on the second attempt', async () => {
    // Use a 429 error (rate limit) which defaultShouldRetry retries
    const retryableErr = Object.assign(new Error('rate limited'), { status: 429 });
    const fn = vi.fn()
      .mockRejectedValueOnce(retryableErr)
      .mockResolvedValueOnce('recovered');

    const promise = withRetry(fn, { maxAttempts: 3, initialDelayMs: 1 }, 'test-op');
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting all attempts', async () => {
    const retryableErr = Object.assign(new Error('persistent failure'), { status: 503 });
    const fn = vi.fn().mockRejectedValue(retryableErr);

    const promise = withRetry(fn, { maxAttempts: 3, initialDelayMs: 1 }, 'test-op');
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow('persistent failure');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry if maxAttempts is 1', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const promise = withRetry(fn, { maxAttempts: 1, initialDelayMs: 10 }, 'test-op');
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respects custom shouldRetry returning false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('no-retry'));
    const shouldRetry = vi.fn().mockReturnValue(false);
    const promise = withRetry(
      fn,
      { maxAttempts: 5, initialDelayMs: 10, shouldRetry },
      'test-op'
    );
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow('no-retry');
    // shouldRetry was called but returned false → no second attempt
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses custom shouldRetry returning true to continue retrying', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('retry this'))
      .mockResolvedValueOnce('ok');
    const shouldRetry = vi.fn().mockReturnValue(true);
    const promise = withRetry(
      fn,
      { maxAttempts: 3, initialDelayMs: 10, shouldRetry },
      'test-op'
    );
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('marks the error with retriesExhausted=true on final failure', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent'));
    const promise = withRetry(fn, { maxAttempts: 2, initialDelayMs: 10 }, 'test-op');
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toMatchObject({ retriesExhausted: true });
  });
});

// ── apiResponse ───────────────────────────────────────────────────────────────
import { sendSuccess, sendError } from '../../utils/apiResponse.js';

function mockRes() {
  const json = vi.fn().mockReturnThis();
  const status = vi.fn().mockReturnValue({ json });
  return { status, json, _status: status, _json: json };
}

describe('apiResponse — sendSuccess', () => {
  it('responds with 200 and success envelope by default', () => {
    const res = mockRes() as unknown as import('express').Response;
    sendSuccess(res, { id: 'abc' });
    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.status as ReturnType<typeof vi.fn>).mock.results[0].value.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: 'abc' });
    expect(body.statusCode).toBe(200);
  });

  it('uses custom statusCode when provided', () => {
    const res = mockRes() as unknown as import('express').Response;
    sendSuccess(res, {}, { statusCode: 201 });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('includes optional message when provided', () => {
    const res = mockRes() as unknown as import('express').Response;
    sendSuccess(res, {}, { message: 'Created!' });
    const body = (res.status as ReturnType<typeof vi.fn>).mock.results[0].value.json.mock.calls[0][0];
    expect(body.message).toBe('Created!');
  });
});

describe('apiResponse — sendError', () => {
  it('responds with the given status code and error code', () => {
    const res = mockRes() as unknown as import('express').Response;
    sendError(res, 'NOT_FOUND', 'Resource not found', 404);
    expect(res.status).toHaveBeenCalledWith(404);
    const body = (res.status as ReturnType<typeof vi.fn>).mock.results[0].value.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error).toBe('NOT_FOUND');
    expect(body.message).toBe('Resource not found');
  });

  it('defaults to 500 when no statusCode provided', () => {
    const res = mockRes() as unknown as import('express').Response;
    sendError(res, 'INTERNAL_ERROR', 'oops');
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── validateEnv ───────────────────────────────────────────────────────────────
import { getEnv, isProduction, isStubEnabled, validateEnv } from '../../utils/validateEnv.js';

describe('validateEnv — getEnv', () => {
  afterEach(() => {
    delete process.env.TEST_VAR_UNIQUE;
  });

  it('returns the env value when set', () => {
    process.env.TEST_VAR_UNIQUE = 'hello';
    expect(getEnv('TEST_VAR_UNIQUE')).toBe('hello');
  });

  it('returns the defaultValue when not set', () => {
    expect(getEnv('UNDEFINED_VAR_UNIQUE', 'fallback')).toBe('fallback');
  });

  it('returns empty string when not set and no default', () => {
    expect(getEnv('UNDEFINED_VAR_UNIQUE')).toBe('');
  });
});

describe('validateEnv — isProduction', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('returns true when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    expect(isProduction()).toBe(true);
  });

  it('returns false when NODE_ENV is development', () => {
    process.env.NODE_ENV = 'development';
    expect(isProduction()).toBe(false);
  });

  it('returns false when NODE_ENV is test', () => {
    process.env.NODE_ENV = 'test';
    expect(isProduction()).toBe(false);
  });
});

describe('validateEnv — isStubEnabled', () => {
  afterEach(() => {
    delete process.env.MAPS_STUB;
    delete process.env.GEMINI_STUB;
    delete process.env.VISION_STUB;
  });

  it('returns true when MAPS_STUB=true', () => {
    process.env.MAPS_STUB = 'true';
    expect(isStubEnabled('MAPS')).toBe(true);
  });

  it('returns false when MAPS_STUB is not set', () => {
    expect(isStubEnabled('MAPS')).toBe(false);
  });

  it('returns false when GEMINI_STUB=false', () => {
    process.env.GEMINI_STUB = 'false';
    expect(isStubEnabled('GEMINI')).toBe(false);
  });

  it('returns true when VISION_STUB=true', () => {
    process.env.VISION_STUB = 'true';
    expect(isStubEnabled('VISION')).toBe(true);
  });
});

describe('validateEnv — validateEnv', () => {
  let originalExit: typeof process.exit;
  let originalConsoleError: typeof console.error;
  let mockExit: any;
  let mockConsoleError: any;

  beforeEach(() => {
    originalExit = process.exit;
    originalConsoleError = console.error;
    mockExit = vi.fn() as any;
    mockConsoleError = vi.fn();
    process.exit = mockExit;
    console.error = mockConsoleError;
  });

  afterEach(() => {
    process.exit = originalExit;
    console.error = originalConsoleError;
  });

  it('does nothing when all required env vars are present', () => {
    const originalEnv = { ...process.env };
    process.env.GOOGLE_GEMINI_API_KEY = 'key';
    process.env.GOOGLE_MAPS_API_KEY = 'key';
    process.env.GOOGLE_CLOUD_PROJECT_ID = 'key';
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = 'key';

    expect(() => validateEnv()).not.toThrow();
    expect(mockExit).not.toHaveBeenCalled();

    process.env = originalEnv;
  });

  it('exits process when required env vars are missing', () => {
    const originalEnv = { ...process.env };
    delete process.env.GOOGLE_GEMINI_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_CLOUD_PROJECT_ID;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    validateEnv();
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalled();

    process.env = originalEnv;
  });
});

// ── logger ────────────────────────────────────────────────────────────────────
describe('logger', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('creates a child logger with module metadata', async () => {
    const { createModuleLogger } = await import('../../utils/logger.js');
    const child = createModuleLogger('TestModule');
    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
  });

  it('exercises production format mapping', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const { default: prodLogger } = await import('../../utils/logger.js');
    prodLogger.info('info message');
    prodLogger.error('error message');
    prodLogger.warn('warn message');
    prodLogger.debug('debug message');

    process.env.NODE_ENV = originalEnv;
  });
});


