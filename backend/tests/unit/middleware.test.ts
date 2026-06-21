/**
 * @fileoverview Unit tests for Express middleware.
 *
 * Covers:
 * - requireAuth: missing token, expired, revoked, invalid, valid
 * - optionalAuth: no token, invalid token (silent), valid token
 * - errorHandler: CORS error, JSON parse error, payload too large, generic 500
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../middleware/authMiddleware.js';

// ── Firebase mocks ────────────────────────────────────────────────────────────
const mockVerifyIdToken = vi.fn();

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => ({})),
  cert: vi.fn(() => ({})),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

// ── Helper: mock Express req/res/next ─────────────────────────────────────────
function makeReq(headers: Record<string, string> = {}): AuthenticatedRequest {
  return { headers, user: undefined } as unknown as AuthenticatedRequest;
}

function makeRes() {
  const res = {
    _status: 0,
    _body: {} as Record<string, unknown>,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      this._body = body;
      return this;
    },
  };
  return res as unknown as Response & { _status: number; _body: Record<string, unknown> };
}

const next: NextFunction = vi.fn();

// ── requireAuth ───────────────────────────────────────────────────────────────
describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-import each time to get fresh state
    vi.resetModules();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const { requireAuth } = await import('../../middleware/authMiddleware.js');
    const req = makeReq({});
    const res = makeRes();
    await requireAuth(req, res, next);
    expect(res._status).toBe(401);
    expect(res._body.error).toBe('UNAUTHORIZED');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header is not Bearer', async () => {
    const { requireAuth } = await import('../../middleware/authMiddleware.js');
    const req = makeReq({ authorization: 'Basic sometoken' });
    const res = makeRes();
    await requireAuth(req, res, next);
    expect(res._status).toBe(401);
    expect(res._body.error).toBe('UNAUTHORIZED');
  });

  it('returns 401 TOKEN_EXPIRED on auth/id-token-expired', async () => {
    mockVerifyIdToken.mockRejectedValue({ code: 'auth/id-token-expired', message: 'expired' });
    const { requireAuth } = await import('../../middleware/authMiddleware.js');
    const req = makeReq({ authorization: 'Bearer expiredtoken' });
    const res = makeRes();
    await requireAuth(req, res, next);
    expect(res._status).toBe(401);
    expect(res._body.error).toBe('TOKEN_EXPIRED');
  });

  it('returns 401 TOKEN_REVOKED on auth/id-token-revoked', async () => {
    mockVerifyIdToken.mockRejectedValue({ code: 'auth/id-token-revoked', message: 'revoked' });
    const { requireAuth } = await import('../../middleware/authMiddleware.js');
    const req = makeReq({ authorization: 'Bearer revokedtoken' });
    const res = makeRes();
    await requireAuth(req, res, next);
    expect(res._status).toBe(401);
    expect(res._body.error).toBe('TOKEN_REVOKED');
  });

  it('returns 401 INVALID_TOKEN on generic error', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('bad token'));
    const { requireAuth } = await import('../../middleware/authMiddleware.js');
    const req = makeReq({ authorization: 'Bearer badtoken' });
    const res = makeRes();
    await requireAuth(req, res, next);
    expect(res._status).toBe(401);
    expect(res._body.error).toBe('INVALID_TOKEN');
  });

  it('calls next() and attaches req.user on valid token', async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: 'user-123',
      email: 'test@example.com',
      email_verified: true,
      name: 'Test User',
    });
    const { requireAuth } = await import('../../middleware/authMiddleware.js');
    const req = makeReq({ authorization: 'Bearer validtoken' });
    const res = makeRes();
    const nextFn = vi.fn();
    await requireAuth(req, res, nextFn);
    expect(nextFn).toHaveBeenCalled();
    expect(req.user?.uid).toBe('user-123');
    expect(req.user?.email).toBe('test@example.com');
  });
});

// ── optionalAuth ──────────────────────────────────────────────────────────────
describe('optionalAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('sets req.user=null and calls next() when no Authorization header', async () => {
    const { optionalAuth } = await import('../../middleware/authMiddleware.js');
    const req = makeReq({});
    const res = makeRes();
    const nextFn = vi.fn();
    await optionalAuth(req, res, nextFn);
    expect(req.user).toBeNull();
    expect(nextFn).toHaveBeenCalled();
  });

  it('sets req.user=null silently when token is invalid', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('bad'));
    const { optionalAuth } = await import('../../middleware/authMiddleware.js');
    const req = makeReq({ authorization: 'Bearer badtoken' });
    const res = makeRes();
    const nextFn = vi.fn();
    await optionalAuth(req, res, nextFn);
    expect(req.user).toBeNull();
    expect(nextFn).toHaveBeenCalled();
  });

  it('attaches req.user when token is valid', async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: 'opt-uid',
      email: 'opt@test.com',
      email_verified: true,
      name: 'Opt User',
    });
    const { optionalAuth } = await import('../../middleware/authMiddleware.js');
    const req = makeReq({ authorization: 'Bearer validtoken' });
    const res = makeRes();
    const nextFn = vi.fn();
    await optionalAuth(req, res, nextFn);
    expect(req.user?.uid).toBe('opt-uid');
    expect(nextFn).toHaveBeenCalled();
  });
});

// ── errorHandler ──────────────────────────────────────────────────────────────
describe('errorHandler', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    vi.resetModules();
  });

  it('handles CORS error with 403', async () => {
    const { errorHandler } = await import('../../middleware/errorHandler.js');
    const req = makeReq() as unknown as import('express').Request;
    const res = makeRes();
    const nextFn = vi.fn();
    const corsErr = Object.assign(new Error('CORS: Origin http://evil.com not allowed'));
    errorHandler(corsErr, req, res as unknown as Response, nextFn);
    expect(res._status).toBe(403);
    expect(res._body.error).toBe('CORS_ERROR');
  });

  it('handles JSON parse error with 400', async () => {
    const { errorHandler } = await import('../../middleware/errorHandler.js');
    const req = makeReq() as unknown as import('express').Request;
    const res = makeRes();
    const nextFn = vi.fn();
    const jsonErr = Object.assign(new Error('JSON parse failed'), { type: 'entity.parse.failed' });
    errorHandler(jsonErr, req, res as unknown as Response, nextFn);
    expect(res._status).toBe(400);
    expect(res._body.error).toBe('INVALID_JSON');
  });

  it('handles payload-too-large error with 413', async () => {
    const { errorHandler } = await import('../../middleware/errorHandler.js');
    const req = makeReq() as unknown as import('express').Request;
    const res = makeRes();
    const nextFn = vi.fn();
    const bigErr = Object.assign(new Error('entity too large'), { type: 'entity.too.large' });
    errorHandler(bigErr, req, res as unknown as Response, nextFn);
    expect(res._status).toBe(413);
    expect(res._body.error).toBe('PAYLOAD_TOO_LARGE');
  });

  it('handles generic errors with 500', async () => {
    const { errorHandler } = await import('../../middleware/errorHandler.js');
    const req = makeReq() as unknown as import('express').Request;
    const res = makeRes();
    const nextFn = vi.fn();
    const genericErr = new Error('something went wrong');
    errorHandler(genericErr, req, res as unknown as Response, nextFn);
    expect(res._status).toBe(500);
    expect(res._body.error).toBe('INTERNAL_SERVER_ERROR');
  });

  it('uses err.statusCode when present', async () => {
    const { errorHandler } = await import('../../middleware/errorHandler.js');
    const req = makeReq() as unknown as import('express').Request;
    const res = makeRes();
    const nextFn = vi.fn();
    const customErr = Object.assign(new Error('not found'), { statusCode: 404 });
    errorHandler(customErr, req, res as unknown as Response, nextFn);
    expect(res._status).toBe(404);
  });
});

// ── requestId ─────────────────────────────────────────────────────────────────
describe('requestIdMiddleware', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uses incoming safe X-Request-ID header if present', async () => {
    const { requestIdMiddleware } = await import('../../middleware/requestId.js');
    const req = {
      headers: {
        'x-request-id': 'custom-id-123',
      },
      method: 'GET',
      path: '/test',
    } as any;
    const setHeader = vi.fn();
    const res = { setHeader } as any;
    const nextFn = vi.fn();

    requestIdMiddleware(req, res, nextFn);

    expect(req.requestId).toBe('custom-id-123');
    expect(setHeader).toHaveBeenCalledWith('X-Request-ID', 'custom-id-123');
    expect(nextFn).toHaveBeenCalled();
  });

  it('generates a new ID if incoming X-Request-ID is invalid (too long)', async () => {
    const { requestIdMiddleware } = await import('../../middleware/requestId.js');
    const req = {
      headers: {
        'x-request-id': 'a'.repeat(200),
      },
      method: 'GET',
      path: '/test',
    } as any;
    const setHeader = vi.fn();
    const res = { setHeader } as any;
    const nextFn = vi.fn();

    requestIdMiddleware(req, res, nextFn);

    expect(req.requestId).toBeDefined();
    expect(req.requestId).not.toBe('a'.repeat(200));
    expect(setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId);
    expect(nextFn).toHaveBeenCalled();
  });

  it('generates a new ID if no incoming X-Request-ID header is present', async () => {
    const { requestIdMiddleware } = await import('../../middleware/requestId.js');
    const req = {
      headers: {},
      method: 'GET',
      path: '/test',
    } as any;
    const setHeader = vi.fn();
    const res = { setHeader } as any;
    const nextFn = vi.fn();

    requestIdMiddleware(req, res, nextFn);

    expect(req.requestId).toBeDefined();
    expect(setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId);
    expect(nextFn).toHaveBeenCalled();
  });

  it('handles crypto fallback if randomUUID fails', async () => {
    const originalCrypto = globalThis.crypto;
    // Create a mock crypto object where randomUUID throws an error
    const mockCrypto = {
      randomUUID: () => {
        throw new Error('crypto unavailable');
      }
    } as any;

    Object.defineProperty(globalThis, 'crypto', {
      value: mockCrypto,
      writable: true,
      configurable: true,
    });

    const { requestIdMiddleware } = await import('../../middleware/requestId.js');
    const req = {
      headers: {},
      method: 'GET',
      path: '/test',
    } as any;
    const setHeader = vi.fn();
    const res = { setHeader } as any;
    const nextFn = vi.fn();

    requestIdMiddleware(req, res, nextFn);

    expect(req.requestId).toContain('req_');
    expect(setHeader).toHaveBeenCalledWith('X-Request-ID', req.requestId);
    expect(nextFn).toHaveBeenCalled();

    // Restore
    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      writable: true,
      configurable: true,
    });
  });
});

