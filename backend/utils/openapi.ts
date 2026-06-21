/**
 * @fileoverview OpenAPI 3.0 specification for the EcoTrack API.
 *
 * The spec is generated at startup and served via:
 *  - GET /api/docs          → Swagger UI (interactive)
 *  - GET /api/docs.json     → Raw OpenAPI JSON spec
 *
 * @module utils/openapi
 */

import swaggerJsdoc from 'swagger-jsdoc';

/** @type {swaggerJsdoc.Options} */
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'EcoTrack — Carbon Footprint API',
      version: '1.0.0',
      description: `
## Overview

EcoTrack is a personal carbon footprint tracker that combines Google Maps,
Gemini AI, and Firebase to help users understand and reduce their environmental impact.

## Authentication

All protected endpoints require a **Firebase ID token** in the Authorization header:

\`\`\`
Authorization: Bearer <firebase-id-token>
\`\`\`

Obtain a token via Firebase Authentication on the client side.

## Rate Limiting

- **Global**: 100 requests per 15 minutes per IP
- **AI endpoints** (/api/scan, /api/insights): 10 requests per 15 minutes per user

## Error Response Format

All errors return a consistent JSON envelope:

\`\`\`json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable description",
  "statusCode": 4xx
}
\`\`\`
      `.trim(),
      contact: {
        name: 'EcoTrack Team',
        url: 'https://github.com/Gopal-MD/CarbonFootPrint',
      },
      license: {
        name: 'Apache 2.0',
        url: 'http://www.apache.org/licenses/LICENSE-2.0.html',
      },
    },
    servers: [
      {
        url: 'https://carbonfootprint-984604014815.asia-south1.run.app',
        description: 'Production (Cloud Run)',
      },
      {
        url: 'http://localhost:8080',
        description: 'Local development',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'Firebase ID Token',
          description: 'Firebase Authentication ID token from the client SDK.',
        },
      },
      schemas: {
        SuccessEnvelope: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object', description: 'Endpoint-specific payload' },
            statusCode: { type: 'integer', example: 200 },
            message: { type: 'string', description: 'Optional human-readable message' },
          },
          required: ['success', 'statusCode'],
        },
        ErrorEnvelope: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'string',
              description: 'Machine-readable error code',
              example: 'VALIDATION_ERROR',
            },
            message: { type: 'string', description: 'Human-readable error description' },
            statusCode: { type: 'integer', example: 422 },
            details: {
              type: 'array',
              description: 'Validation error details (only present on 422)',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          required: ['success', 'error', 'message', 'statusCode'],
        },
        TravelMode: {
          type: 'string',
          enum: ['DRIVING', 'TRANSIT', 'WALKING', 'BICYCLING'],
          description: 'Google Maps travel mode.',
        },
        EmissionCategory: {
          type: 'string',
          enum: ['commute', 'food', 'utility', 'other'],
          description: 'Carbon emission category.',
        },
        CommuteRequest: {
          type: 'object',
          required: ['origin', 'destination', 'travelMode'],
          properties: {
            origin: {
              type: 'string',
              maxLength: 500,
              example: '123 MG Road, Bengaluru, Karnataka',
              description: 'Starting address or coordinates.',
            },
            destination: {
              type: 'string',
              maxLength: 500,
              example: '456 Electronic City, Bengaluru, Karnataka',
              description: 'Ending address or coordinates.',
            },
            travelMode: { $ref: '#/components/schemas/TravelMode' },
            trips: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 1,
              description: 'Number of one-way trips (e.g., 2 for round trip).',
            },
          },
        },
        CommuteResponse: {
          type: 'object',
          properties: {
            distanceKm: { type: 'number', example: 12.5 },
            durationMinutes: { type: 'integer', example: 28 },
            kgCO2e: { type: 'number', example: 2.131 },
            travelMode: { $ref: '#/components/schemas/TravelMode' },
            originAddress: { type: 'string', example: '123 MG Road, Bengaluru' },
            destinationAddress: { type: 'string', example: '456 Electronic City, Bengaluru' },
          },
        },
        ScanRequest: {
          type: 'object',
          required: ['imageBase64', 'mimeType'],
          properties: {
            imageBase64: {
              type: 'string',
              description: 'Base64-encoded image of the utility bill.',
              example: '/9j/4AAQSkZJRgAB...',
            },
            mimeType: {
              type: 'string',
              enum: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
              example: 'image/jpeg',
            },
          },
        },
        ScanResponse: {
          type: 'object',
          properties: {
            kWhExtracted: { type: 'number', nullable: true, example: 245.3 },
            kgCO2e: { type: 'number', example: 112.1 },
            billProvider: { type: 'string', nullable: true, example: 'BESCOM' },
            billingPeriod: { type: 'string', nullable: true, example: 'June 2026' },
            confidence: { type: 'number', minimum: 0, maximum: 1, example: 0.92 },
            source: {
              type: 'string',
              enum: ['vision', 'fallback'],
              description: '"vision" = Gemini Vision; "fallback" = manual entry guidance.',
            },
          },
        },
        InsightsRequest: {
          type: 'object',
          required: ['monthlyKgCO2e'],
          properties: {
            monthlyKgCO2e: {
              type: 'number',
              minimum: 0,
              maximum: 100000,
              example: 142.5,
            },
            commuteKg: { type: 'number', example: 48.3 },
            utilityKg: { type: 'number', example: 78.2 },
            foodKg: { type: 'number', example: 16.0 },
            travelMode: { $ref: '#/components/schemas/TravelMode' },
          },
        },
        InsightsResponse: {
          type: 'object',
          properties: {
            insightText: {
              type: 'string',
              description: 'AI-generated or rules-based personalised eco-insight.',
            },
            tips: {
              type: 'array',
              items: { type: 'string' },
              description: 'Actionable reduction tips.',
            },
            cached: { type: 'boolean', description: 'Whether this response came from cache.' },
            generatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'ISO 8601 timestamp of when the insight was generated.',
            },
            source: {
              type: 'string',
              enum: ['gemini', 'rules'],
              description: '"gemini" = AI-generated; "rules" = rules engine fallback.',
            },
          },
        },
        EmissionRecord: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'abc123xyz' },
            userId: { type: 'string', example: 'firebase-uid-here' },
            category: { $ref: '#/components/schemas/EmissionCategory' },
            kgCO2e: { type: 'number', example: 4.82 },
            date: { type: 'string', format: 'date', example: '2026-06-20' },
            createdAt: { type: 'string', format: 'date-time' },
            metadata: { type: 'object', description: 'Category-specific additional data.' },
          },
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'healthy' },
            timestamp: { type: 'string', format: 'date-time' },
            version: { type: 'string', example: '0.1.0' },
            environment: { type: 'string', example: 'production' },
            uptime: { type: 'integer', description: 'Server uptime in seconds', example: 3600 },
          },
        },
      },
    },
    paths: {
      '/health': {
        get: {
          tags: ['System'],
          summary: 'Server health check',
          description: 'Returns 200 with server metadata. Used by Cloud Run readiness/liveness probes. No authentication required.',
          operationId: 'getHealth',
          responses: {
            200: {
              description: 'Server is healthy',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthResponse' },
                },
              },
            },
          },
        },
      },
      '/api/commute': {
        post: {
          tags: ['Carbon Calculation'],
          summary: 'Calculate commute carbon emissions',
          description: 'Calls the Google Maps Directions API to compute distance, then applies DEFRA 2024 emission factors to return kgCO₂e. Supports graceful fallback in stub mode.',
          operationId: 'calculateCommuteEmissions',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CommuteRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Commute emissions calculated successfully',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/SuccessEnvelope' },
                      {
                        properties: {
                          data: { $ref: '#/components/schemas/CommuteResponse' },
                        },
                      },
                    ],
                  },
                },
              },
            },
            401: { description: 'Missing or invalid Firebase ID token' },
            403: { description: 'Token UID does not match userId in request body' },
            422: { description: 'Input validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
            429: { description: 'Rate limit exceeded' },
          },
        },
      },
      '/api/commute/modes': {
        get: {
          tags: ['Carbon Calculation'],
          summary: 'List available transport modes',
          description: 'Returns all supported travel modes with their emission factors. Public endpoint — no authentication required.',
          operationId: 'getCommuteModes',
          responses: {
            200: {
              description: 'List of transport modes',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/SuccessEnvelope' },
                      {
                        properties: {
                          data: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { $ref: '#/components/schemas/TravelMode' },
                                label: { type: 'string', example: 'Car (Petrol/Diesel)' },
                                kgPerKm: { type: 'number', example: 0.17046 },
                                description: { type: 'string' },
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
      '/api/scan': {
        post: {
          tags: ['Bill Scanning'],
          summary: 'Scan utility bill for kWh and carbon emissions',
          description: 'Sends base64-encoded bill image to Gemini Vision API for kWh extraction. Falls back to structured manual-entry guidance if AI is unavailable.',
          operationId: 'scanUtilityBill',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ScanRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Bill scan result (AI or fallback)',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/SuccessEnvelope' },
                      {
                        properties: {
                          data: { $ref: '#/components/schemas/ScanResponse' },
                        },
                      },
                    ],
                  },
                },
              },
            },
            401: { description: 'Authentication required' },
            403: { description: 'UID mismatch' },
            413: { description: 'Image exceeds 15 MB limit' },
            422: { description: 'Validation error (missing imageBase64 or invalid mimeType)' },
            429: { description: 'AI rate limit exceeded (10/15 min)' },
          },
        },
      },
      '/api/insights': {
        post: {
          tags: ['AI Insights'],
          summary: 'Generate personalized eco-insights',
          description: 'Sends the user\'s monthly emission breakdown to Gemini AI to generate actionable reduction tips. Falls back to a deterministic rules engine if AI is unavailable.',
          operationId: 'generateInsights',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/InsightsRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Personalized eco-insight (cached or freshly generated)',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/SuccessEnvelope' },
                      {
                        properties: {
                          data: { $ref: '#/components/schemas/InsightsResponse' },
                        },
                      },
                    ],
                  },
                },
              },
            },
            401: { description: 'Authentication required' },
            422: { description: 'Validation error' },
            429: { description: 'AI rate limit exceeded (10/15 min)' },
          },
        },
      },
      '/api/emissions': {
        post: {
          tags: ['Emissions'],
          summary: 'Save a carbon emission record',
          description: 'Persists a manual or calculated emission event to Firestore under the authenticated user\'s collection.',
          operationId: 'saveEmission',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['category', 'kgCO2e', 'date'],
                  properties: {
                    category: { $ref: '#/components/schemas/EmissionCategory' },
                    kgCO2e: { type: 'number', minimum: 0, maximum: 100000, example: 4.82 },
                    date: { type: 'string', format: 'date', example: '2026-06-20' },
                    metadata: { type: 'object', description: 'Optional category-specific data.' },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Emission record saved',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/SuccessEnvelope' },
                      {
                        properties: {
                          data: {
                            type: 'object',
                            properties: { id: { type: 'string', example: 'abc123' } },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            401: { description: 'Authentication required' },
            403: { description: 'UID mismatch' },
            422: { description: 'Validation error' },
          },
        },
        get: {
          tags: ['Emissions'],
          summary: 'Get emission history',
          description: 'Returns paginated emission records for the authenticated user, optionally filtered by category.',
          operationId: 'getEmissions',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'category',
              in: 'query',
              schema: { $ref: '#/components/schemas/EmissionCategory' },
              description: 'Filter by emission category.',
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
              description: 'Maximum number of records to return.',
            },
            {
              name: 'userId',
              in: 'query',
              schema: { type: 'string' },
              description: 'Must match the authenticated user\'s UID (returns 403 otherwise).',
            },
          ],
          responses: {
            200: {
              description: 'Paginated emission history',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/SuccessEnvelope' },
                      {
                        properties: {
                          data: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/EmissionRecord' },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            401: { description: 'Authentication required' },
            403: { description: 'userId param does not match token UID' },
          },
        },
      },
      '/api/auth/verify': {
        post: {
          tags: ['Authentication'],
          summary: 'Verify Firebase ID token',
          description: 'Server-side verification of a Firebase ID token using Firebase Admin SDK. Returns normalized user claims for the frontend to store.',
          operationId: 'verifyToken',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['idToken'],
                  properties: {
                    idToken: {
                      type: 'string',
                      minLength: 100,
                      description: 'Firebase ID token from the client SDK.',
                      example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6...',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Token is valid — user claims returned',
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/SuccessEnvelope' },
                      {
                        properties: {
                          data: {
                            type: 'object',
                            properties: {
                              uid: { type: 'string' },
                              email: { type: 'string', format: 'email' },
                              emailVerified: { type: 'boolean' },
                              displayName: { type: 'string' },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
            401: {
              description: 'Invalid, expired, or revoked token',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorEnvelope' },
                  examples: {
                    expired: {
                      summary: 'Token expired',
                      value: { success: false, error: 'TOKEN_EXPIRED', message: 'Firebase ID token has expired.', statusCode: 401 },
                    },
                    revoked: {
                      summary: 'Token revoked',
                      value: { success: false, error: 'TOKEN_REVOKED', message: 'Session has been revoked.', statusCode: 401 },
                    },
                  },
                },
              },
            },
            422: { description: 'Missing or malformed idToken field' },
          },
        },
      },
    },
    tags: [
      { name: 'System', description: 'Health checks and server status' },
      { name: 'Authentication', description: 'Firebase token verification' },
      { name: 'Carbon Calculation', description: 'Commute emission calculations via Google Maps' },
      { name: 'Bill Scanning', description: 'AI-powered utility bill analysis via Gemini Vision' },
      { name: 'AI Insights', description: 'Personalized eco-tips via Gemini AI' },
      { name: 'Emissions', description: 'Emission history storage and retrieval via Firestore' },
    ],
  },
  apis: [],
};

/**
 * Pre-built OpenAPI specification object.
 * Generated from the inline definition above.
 */
export const openapiSpec = swaggerJsdoc(options);
