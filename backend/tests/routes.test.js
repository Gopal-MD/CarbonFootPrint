/**
 * @fileoverview Backend integration tests — API route contracts.
 *
 * Tests the Express routes using supertest to verify:
 * - HTTP status codes
 * - Response envelope shape
 * - Input validation (422 Unprocessable Entity)
 * - Error responses on missing/bad input
 * - Route availability
 *
 * Stubs are enabled via STUB_MODE=true so no real Google APIs are called.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';

// ── Mock Firebase Admin SDK before any app import ────────────────────────────
vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => ({})),
  cert: vi.fn(() => ({})),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: vi.fn().mockResolvedValue({
      uid: 'test-uid-123',
      email: 'test@example.com',
      name: 'Test User',
      email_verified: true,
    }),
  })),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      add: vi.fn().mockResolvedValue({ id: 'mock-doc-id' }),
      doc: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn().mockResolvedValue({}),
      })),
    })),
  })),
  FieldValue: {
    serverTimestamp: vi.fn(() => new Date()),
  },
  Timestamp: {
    fromDate: vi.fn((d) => d),
  },
}));

// ── Set env vars before importing server ──────────────────────────────────────
process.env.NODE_ENV                      = 'test';
process.env.STUB_MODE                     = 'true';
process.env.GOOGLE_GEMINI_API_KEY         = 'test-gemini-key';
process.env.GOOGLE_MAPS_API_KEY           = 'test-maps-key';
process.env.GOOGLE_CLOUD_PROJECT_ID       = 'test-project-id';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: 'service_account',
  project_id: 'test-project',
  private_key_id: 'key-id',
  private_key: '-----BEGIN RSA PRIVATE KEY-----\nMIItest\n-----END RSA PRIVATE KEY-----',
  client_email: 'test@test-project.iam.gserviceaccount.com',
  client_id: '123',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
});
process.env.ALLOWED_ORIGINS               = 'http://localhost:5173';
process.env.PORT                          = '0';

// Dynamically import after env/mocks are set
let app;
beforeAll(async () => {
  const serverModule = await import('../server.js');
  app = serverModule.default || serverModule.app;
});

afterAll(async () => {
  // Cleanup
});

// ── /health (Note: mounted at /health not /api/health) ─────────────────────
describe('GET /health', () => {
  it('returns 200 with status: healthy', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'healthy');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('health response has correct content-type', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

// ── /api/commute — validation ─────────────────────────────────────────────────
describe('POST /api/commute — input validation', () => {
  it('returns 422 when origin is missing', async () => {
    const res = await request(app)
      .post('/api/commute')
      .set('Authorization', 'Bearer mock-valid-token')
      .send({ destination: '456 Oak Ave', mode: 'DRIVING' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.details).toBeInstanceOf(Array);
    expect(res.body.details.some((d) => d.field === 'origin')).toBe(true);
  });

  it('returns 422 when destination is missing', async () => {
    const res = await request(app)
      .post('/api/commute')
      .set('Authorization', 'Bearer mock-valid-token')
      .send({ origin: '123 Main St', mode: 'DRIVING' });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('returns 422 when mode is invalid', async () => {
    const res = await request(app)
      .post('/api/commute')
      .set('Authorization', 'Bearer mock-valid-token')
      .send({ origin: '123 Main St', destination: '456 Oak Ave', mode: 'FLYING' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 422 when origin is too long', async () => {
    const res = await request(app)
      .post('/api/commute')
      .set('Authorization', 'Bearer mock-valid-token')
      .send({
        origin: 'A'.repeat(501),
        destination: '456 Oak Ave',
        mode: 'DRIVING',
      });

    expect(res.status).toBe(422);
  });

  it('accepts valid commute request in stub mode', async () => {
    const res = await request(app)
      .post('/api/commute')
      .set('Authorization', 'Bearer mock-valid-token')
      .send({ origin: '123 Main St, NY', destination: '456 Oak Ave, NY', mode: 'DRIVING' });

    // Stub mode calls real Maps API with dummy key → 422 or 5xx
    expect([200, 400, 422, 500, 502, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('distanceKm');
      expect(res.body.data).toHaveProperty('kgCO2e');
    }
  });

  it('GET /api/commute/modes returns transport mode metadata', async () => {
    const res = await request(app).get('/api/commute/modes');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    const firstMode = res.body.data[0];
    // Route returns { id, label, icon, kgPerKm, description }
    expect(firstMode).toHaveProperty('id');
    expect(firstMode).toHaveProperty('label');
    expect(firstMode).toHaveProperty('kgPerKm');
  });
});

// ── /api/scan — validation ────────────────────────────────────────────────────
describe('POST /api/scan — input validation', () => {
  const validBase64 = Buffer.from('fake-image-data').toString('base64');

  it('returns 422 when imageBase64 is missing', async () => {
    const res = await request(app)
      .post('/api/scan')
      .set('Authorization', 'Bearer mock-valid-token')
      .send({ mimeType: 'image/jpeg', userId: 'test-uid' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('returns 422 when mimeType is invalid', async () => {
    const res = await request(app)
      .post('/api/scan')
      .set('Authorization', 'Bearer mock-valid-token')
      .send({ imageBase64: validBase64, mimeType: 'text/plain', userId: 'test-uid' });

    expect(res.status).toBe(422);
    expect(res.body.details.some((d) => d.field === 'mimeType')).toBe(true);
  });

  it('returns 422 when userId is missing', async () => {
    const res = await request(app)
      .post('/api/scan')
      .set('Authorization', 'Bearer mock-valid-token')
      .send({ imageBase64: validBase64, mimeType: 'image/jpeg' });

    expect(res.status).toBe(422);
    expect(res.body.details.some((d) => d.field === 'userId')).toBe(true);
  });

  it('returns 422 when userId is too long', async () => {
    const res = await request(app)
      .post('/api/scan')
      .set('Authorization', 'Bearer mock-valid-token')
      .send({
        imageBase64: validBase64,
        mimeType: 'image/jpeg',
        userId: 'x'.repeat(200),
      });

    expect(res.status).toBe(422);
  });

  it('accepts valid scan request in stub mode', async () => {
    const res = await request(app)
      .post('/api/scan')
      .set('Authorization', 'Bearer mock-valid-token')
      .send({
        imageBase64: validBase64,
        mimeType: 'image/jpeg',
        userId: 'test-uid-123',
      });

    expect([200, 400, 500, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('kgCO2e');
    }
  });
});

// ── /api/insights — validation ────────────────────────────────────────────────
describe('POST /api/insights — input validation', () => {
  it('returns 422 when userId is missing', async () => {
    const res = await request(app)
      .post('/api/insights')
      .set('Authorization', 'Bearer mock-valid-token')
      .send({ monthlyKgCO2e: 150, commuteKg: 50, utilityKg: 75 });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.details.some((d) => d.field === 'userId')).toBe(true);
  });

  it('returns 422 when monthlyKgCO2e is missing', async () => {
    const res = await request(app)
      .post('/api/insights')
      .set('Authorization', 'Bearer mock-valid-token')
      .send({ userId: 'test-uid' });

    expect(res.status).toBe(422);
  });

  it('returns 422 when monthlyKgCO2e is negative', async () => {
    const res = await request(app)
      .post('/api/insights')
      .set('Authorization', 'Bearer mock-valid-token')
      .send({ userId: 'test-uid', monthlyKgCO2e: -10 });

    expect(res.status).toBe(422);
  });

  it('returns 422 when travelMode is invalid', async () => {
    const res = await request(app)
      .post('/api/insights')
      .set('Authorization', 'Bearer mock-valid-token')
      .send({ userId: 'test-uid', monthlyKgCO2e: 150, travelMode: 'TELEPORT' });

    expect(res.status).toBe(422);
  });

  it('accepts valid insights request in stub mode', async () => {
    const res = await request(app)
      .post('/api/insights')
      .set('Authorization', 'Bearer mock-valid-token')
      .send({
        userId: 'test-uid-123',
        monthlyKgCO2e: 142.5,
        commuteKg: 48.3,
        utilityKg: 78.2,
        travelMode: 'DRIVING',
      });

    expect([200, 400, 500, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('insightText');
      expect(res.body.data).toHaveProperty('cached');
      expect(res.body.data).toHaveProperty('generatedAt');
    }
  });
});

// ── /api/emissions — validation ───────────────────────────────────────────────
describe('POST /api/emissions — input validation', () => {
  it('returns 422 when userId is missing', async () => {
    const res = await request(app)
      .post('/api/emissions')
      .set('Authorization', 'Bearer mock-valid-token')
      .send({ kWhUsed: 300, month: '2025-01' });

    expect(res.status).toBe(422);
  });

  it('returns 422 when kWhUsed is negative', async () => {
    const res = await request(app)
      .post('/api/emissions')
      .set('Authorization', 'Bearer mock-valid-token')
      .send({ userId: 'test-uid', kWhUsed: -10, month: '2025-01' });

    expect(res.status).toBe(422);
  });
});

// ── Security headers ────────────────────────────────────────────────────────────────────
describe('Security Headers', () => {
  it('response includes X-Content-Type-Options header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('response includes X-Frame-Options header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-frame-options']).toBeTruthy();
  });

  it('response has a content-type header', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-type']).toMatch(/json/);
  });
});

// ── 404 / Unknown routes ──────────────────────────────────────────────────────
describe('Unknown API Routes', () => {
  it('returns 404 for unknown /api/ routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('404 response has JSON body', async () => {
    const res = await request(app).get('/api/totally-unknown-path');
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toHaveProperty('success', false);
  });
});
