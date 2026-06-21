/**
 * @fileoverview Integration tests for complete EcoTrack API workflows.
 *
 * Unlike the route-level tests in routes.test.ts (which test individual
 * endpoint contracts), these tests exercise multi-step user journeys:
 *
 *   1. Commute Calculation Workflow: Calculate → Save → Retrieve
 *   2. Bill Scan Workflow: Scan with stub backend
 *   3. Insights Workflow: Generate personalised eco-insights
 *   4. API Documentation: /api/docs and /api/docs.json accessibility
 *   5. Cross-Origin Request Handling: CORS headers are set correctly
 *   6. OpenAPI Spec Completeness: All endpoints are documented
 *
 * All tests use the stub backends (MAPS_STUB, GEMINI_STUB, VISION_STUB)
 * and the InMemoryEmissionRepository to avoid external calls and Firestore.
 *
 * @module tests/integration/workflows
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// ── Mock Firebase Admin SDK ───────────────────────────────────────────────────
vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => ({})),
  cert: vi.fn(() => ({})),
}));

const mockVerifyIdToken = vi.fn().mockResolvedValue({
  uid: 'workflow-user-uid',
  email: 'workflow@test.com',
  name: 'Workflow Test User',
  email_verified: true,
});

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

vi.mock('firebase-admin/firestore', () => {
  const queryMock = {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ docs: [] }),
  };

  return {
    getFirestore: vi.fn(() => ({
      collection: vi.fn(() => ({
        add: vi.fn().mockResolvedValue({ id: 'workflow-doc-id' }),
        doc: vi.fn(() => ({
          get: vi.fn().mockResolvedValue({ exists: false }),
          set: vi.fn().mockResolvedValue({}),
        })),
        where: vi.fn().mockReturnValue(queryMock),
        orderBy: vi.fn().mockReturnValue(queryMock),
        limit: vi.fn().mockReturnValue(queryMock),
        get: vi.fn().mockResolvedValue({ docs: [] }),
      })),
    })),
    FieldValue: {
      serverTimestamp: vi.fn(() => new Date()),
    },
    Timestamp: {
      fromDate: vi.fn((d: Date) => d),
    },
  };
});

// ── Set stub env flags before importing server ────────────────────────────────
process.env.NODE_ENV                      = 'test';
process.env.GEMINI_STUB                   = 'true';
process.env.MAPS_STUB                     = 'true';
process.env.VISION_STUB                   = 'true';
process.env.GOOGLE_GEMINI_API_KEY         = 'workflow-test-gemini-key';
process.env.GOOGLE_MAPS_API_KEY           = 'workflow-test-maps-key';
process.env.GOOGLE_CLOUD_PROJECT_ID       = 'workflow-test-project';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: 'service_account',
  project_id: 'workflow-test-project',
  private_key_id: 'key-id',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\nMIItest\n-----END RSA PRIVATE KEY-----',
  client_email: 'workflow@workflow-test-project.iam.gserviceaccount.com',
  client_id: '789',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
});
process.env.ALLOWED_ORIGINS               = 'http://localhost:5173';
process.env.PORT                          = '0';

let app: Express;

beforeAll(async () => {
  const serverModule = await import('../../server.js');
  app = serverModule.app;
  // Inject fresh InMemoryEmissionRepository so tests are isolated
  const { InMemoryEmissionRepository } = await import('../../repositories/InMemoryEmissionRepository.js');
  app.locals.emissionsRepo = new InMemoryEmissionRepository();
});

afterAll(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW 1: Commute Calculate → Save → Retrieve
// ─────────────────────────────────────────────────────────────────────────────
describe('Workflow 1 — Commute Calculate → Save → Retrieve', () => {
  it('calculates commute emissions with stub backend', async () => {
    const res = await request(app)
      .post('/api/commute')
      .set('Authorization', 'Bearer workflow-token')
      .send({
        origin: '123 Main St, New Delhi',
        destination: '456 MG Road, New Delhi',
        travelMode: 'DRIVING',
        trips: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('distanceKm');
    expect(res.body.data).toHaveProperty('kgCO2e');
    expect(typeof res.body.data.kgCO2e).toBe('number');
    expect(res.body.data.kgCO2e).toBeGreaterThanOrEqual(0);
  });

  it('calculates and saves commute record when saveRecord=true', async () => {
    const res = await request(app)
      .post('/api/commute')
      .set('Authorization', 'Bearer workflow-token')
      .send({
        origin: '123 Main St, New Delhi',
        destination: '456 MG Road, New Delhi',
        travelMode: 'DRIVING',
        trips: 2,
        saveRecord: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // savedId is present when the record was persisted
    expect(res.body.data).toHaveProperty('savedId');
    expect(typeof res.body.data.savedId).toBe('string');
  });

  it('retrieves emission history after saving', async () => {
    // First save a record via the commute endpoint (saveRecord=true)
    await request(app)
      .post('/api/commute')
      .set('Authorization', 'Bearer workflow-token')
      .send({
        origin: '123 Main St, Bangalore',
        destination: '456 Electronic City, Bangalore',
        travelMode: 'TRANSIT',
        trips: 1,
        saveRecord: true,
      });

    // Then retrieve via emissions endpoint using InMemoryRepo
    const getRes = await request(app)
      .get('/api/emissions')
      .set('Authorization', 'Bearer workflow-token')
      .query({ userId: 'workflow-user-uid' });

    expect(getRes.status).toBe(200);
    expect(getRes.body.success).toBe(true);
    // GET /api/emissions returns data as an array directly
    expect(Array.isArray(getRes.body.data)).toBe(true);
    expect(getRes.body.data.length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW 2: Manual Emission Record → Retrieve
// ─────────────────────────────────────────────────────────────────────────────
describe('Workflow 2 — Manual Emission Record → Retrieve', () => {
  it('saves a manual food emission record', async () => {
    const res = await request(app)
      .post('/api/emissions')
      .set('Authorization', 'Bearer workflow-token')
      .send({
        category: 'food',
        kgCO2e: 3.2,
        date: '2026-06-21',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(typeof res.body.data.id).toBe('string');
  });

  it('retrieves the food emission in history via InMemoryRepo', async () => {
    // Add a distinctive food record
    const saveRes = await request(app)
      .post('/api/emissions')
      .set('Authorization', 'Bearer workflow-token')
      .send({
        category: 'food',
        kgCO2e: 5.5,
        date: '2026-06-21',
      });
    expect(saveRes.status).toBe(201);

    // Retrieve all records and verify at least one food record exists
    const getRes = await request(app)
      .get('/api/emissions')
      .set('Authorization', 'Bearer workflow-token')
      .query({ userId: 'workflow-user-uid', category: 'food' });

    expect(getRes.status).toBe(200);
    expect(getRes.body.success).toBe(true);
    const emissions = getRes.body.data as Array<{ category: string }>;
    expect(Array.isArray(emissions)).toBe(true);
    expect(emissions.length).toBeGreaterThanOrEqual(1);
    expect(emissions.every((e) => e.category === 'food')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW 3: Bill Scan Workflow (Stub mode)
// ─────────────────────────────────────────────────────────────────────────────
describe('Workflow 3 — Bill Scan with Stub Backend', () => {
  it('returns a successful scan result with stub backend', async () => {
    const fakeBase64 = Buffer.from('fake-bill-image-data').toString('base64');

    const res = await request(app)
      .post('/api/scan')
      .set('Authorization', 'Bearer workflow-token')
      .send({
        imageBase64: fakeBase64,
        mimeType: 'image/jpeg',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('kgCO2e');
    expect(typeof res.body.data.kgCO2e).toBe('number');
  });

  it('returns structured scan data including confidence field', async () => {
    const fakeBase64 = Buffer.from('another-fake-bill').toString('base64');

    const res = await request(app)
      .post('/api/scan')
      .set('Authorization', 'Bearer workflow-token')
      .send({
        imageBase64: fakeBase64,
        mimeType: 'image/png',
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('confidence');
    expect(res.body.data).toHaveProperty('source');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW 4: Insights Generation (Stub Backend)
// ─────────────────────────────────────────────────────────────────────────────
describe('Workflow 4 — Insights Generation (Stub Backend)', () => {
  it('generates insights for a user footprint', async () => {
    const res = await request(app)
      .post('/api/insights')
      .set('Authorization', 'Bearer workflow-token')
      .send({
        monthlyKgCO2e: 142.5,
        commuteKg: 48.3,
        utilityKg: 78.2,
        travelMode: 'DRIVING',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('insightText');
    expect(res.body.data).toHaveProperty('cached');
    expect(res.body.data).toHaveProperty('source');
    expect(['gemini', 'rules']).toContain(res.body.data.source);
  });

  it('generates insights without optional fields', async () => {
    const res = await request(app)
      .post('/api/insights')
      .set('Authorization', 'Bearer workflow-token')
      .send({
        monthlyKgCO2e: 80,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('insightText');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW 5: API Documentation Endpoints
// ─────────────────────────────────────────────────────────────────────────────
describe('Workflow 5 — API Documentation Endpoints', () => {
  it('serves Swagger UI HTML at /api/docs or redirects to /api/docs/', async () => {
    const res = await request(app).get('/api/docs');
    // Swagger UI responds with 200 HTML or redirects
    expect([200, 301, 302]).toContain(res.status);
  });

  it('serves raw OpenAPI JSON at /api/docs.json', async () => {
    const res = await request(app).get('/api/docs.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    const spec = res.body as Record<string, unknown>;
    expect(spec).toHaveProperty('openapi');
    expect(spec).toHaveProperty('info');
    expect(spec).toHaveProperty('paths');
  });

  it('OpenAPI spec documents all core endpoints', async () => {
    const res = await request(app).get('/api/docs.json');
    expect(res.status).toBe(200);
    const spec = res.body as { paths: Record<string, unknown> };
    expect(spec.paths).toHaveProperty('/api/commute');
    expect(spec.paths).toHaveProperty('/api/scan');
    expect(spec.paths).toHaveProperty('/api/insights');
    expect(spec.paths).toHaveProperty('/api/emissions');
    expect(spec.paths).toHaveProperty('/health');
    expect(spec.paths).toHaveProperty('/api/auth/verify');
  });

  it('OpenAPI spec includes proper authentication scheme', async () => {
    const res = await request(app).get('/api/docs.json');
    expect(res.status).toBe(200);
    const spec = res.body as {
      components?: { securitySchemes?: Record<string, unknown> };
    };
    expect(spec.components?.securitySchemes).toHaveProperty('bearerAuth');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW 6: Security & Header Validation
// ─────────────────────────────────────────────────────────────────────────────
describe('Workflow 6 — Security Headers & CORS', () => {
  it('includes Helmet X-Content-Type-Options header on all responses', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('includes Helmet X-Frame-Options header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-frame-options']).toBeTruthy();
  });

  it('sets CORS headers for allowed origins', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:5173');
    expect([200, 204]).toContain(res.status);
    // Should not be blocked — access-control-allow-origin should be set
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  it('rejects cross-user emission access with 403 FORBIDDEN', async () => {
    const res = await request(app)
      .post('/api/emissions')
      .set('Authorization', 'Bearer workflow-token')
      .send({
        category: 'food',
        kgCO2e: 2.0,
        date: '2026-06-21',
        userId: 'different-user-uid-malicious',
      });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('returns 401 for requests with no Authorization header', async () => {
    const res = await request(app)
      .post('/api/emissions')
      .send({ category: 'food', kgCO2e: 2.0, date: '2026-06-21' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW 7: Health Check & Server Metadata
// ─────────────────────────────────────────────────────────────────────────────
describe('Workflow 7 — Health Check & Server Metadata', () => {
  it('returns 200 with status: healthy', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });

  it('health response includes all required metadata fields', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toHaveProperty('status', 'healthy');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('environment');
    expect(res.body).toHaveProperty('uptime');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('returns JSON content-type', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('returns 404 JSON for unknown API routes', async () => {
    const res = await request(app).get('/api/does-not-exist-xyz');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});
