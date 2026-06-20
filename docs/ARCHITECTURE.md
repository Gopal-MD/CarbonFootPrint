# EcoTrack Architecture Guide

> A living technical reference for contributors, reviewers, and evaluators.
> Last updated: June 2026 | Commit: `cf64dc7`

---

## 1. System Overview

EcoTrack is a full-stack carbon footprint tracking platform that helps users understand, measure, and reduce their personal CO₂ emissions. The system combines real-time distance data (Google Maps), AI-generated insights (Gemini), and computer-vision bill parsing (Gemini Vision) behind a Firebase-authenticated REST API.

```
┌──────────────────────────────────────────────────────┐
│              Client (Browser / Mobile)               │
│                                                      │
│   React 18 + TypeScript + Vite                       │
│   ├─ Dashboard    (chart.js visualizations)          │
│   ├─ Carbon Calculator  (commute + utility)          │
│   ├─ Bill Scanner UI    (base64 image upload)        │
│   └─ Auth Pages   (Firebase email/OAuth)             │
└────────────────────────┬─────────────────────────────┘
                         │  HTTPS
                         │  Authorization: Bearer <firebase-id-token>
                         ▼
┌──────────────────────────────────────────────────────┐
│           Backend (Cloud Run · Node 20 · TS)         │
│                                                      │
│   Express.js REST API  (port 8080)                   │
│   ├─ /api/commute   → MapsService                    │
│   ├─ /api/scan      → AIServiceManager (Vision)      │
│   ├─ /api/insights  → AIServiceManager (Gemini)      │
│   ├─ /api/emissions → BaseDB (Firestore CRUD)        │
│   └─ /api/auth      → Firebase Admin SDK             │
└────┬──────────────┬──────────────┬───────────────────┘
     │              │              │
     ▼              ▼              ▼
  Google         Gemini        Firebase
  Maps API    2.0 Flash       (Auth + Firestore)
```

---

## 2. Repository Layout

```
CarbonFootPrint/
├── frontend/                   # React SPA (Vite)
│   ├── src/
│   │   ├── components/         # Reusable UI atoms
│   │   ├── pages/              # Route-level components
│   │   ├── hooks/              # Custom React hooks
│   │   ├── contexts/           # AuthContext, EmissionsContext
│   │   └── lib/                # API client, firebase init
│   └── dist/                   # Build output (served by Express)
│
├── backend/                    # Express API (TypeScript)
│   ├── constants/index.ts      # Cited emission factors & config
│   ├── middleware/             # Auth, rate-limit, request-id
│   ├── routes/                 # HTTP handlers (thin layer)
│   ├── services/               # External API clients
│   ├── types/eco_types.ts      # Backend-specific TS interfaces
│   ├── utils/                  # apiResponse, withRetry, logger
│   └── server.ts               # Express app bootstrap
│
├── shared/
│   └── types/index.ts          # Shared TS contracts (front ↔ back)
│
├── docs/
│   └── ARCHITECTURE.md         # This file
│
├── Dockerfile                  # Multi-stage production build
├── cloudbuild.yaml             # Cloud Build → Cloud Run CI/CD
├── firestore.rules             # Firestore security rules
└── SECURITY.md                 # Active security controls
```

---

## 3. Layer Architecture

EcoTrack follows a strict **inward-dependency** rule: outer layers depend on inner interfaces, never the reverse.

```
  ┌───────────────────────────────────────┐
  │         HTTP Routes (outer)           │  ← validateInput · call service · respond
  ├───────────────────────────────────────┤
  │         Services / Domain (mid)       │  ← external calls · business logic
  ├───────────────────────────────────────┤
  │         Persistence (BaseDB)          │  ← Firestore CRUD · typed generics
  ├───────────────────────────────────────┤
  │      Shared Contracts (inner)         │  ← interfaces · no runtime code
  └───────────────────────────────────────┘
```

| Layer | Key Files | Constraint |
|---|---|---|
| **HTTP Routes** | `routes/*.ts` | Thin: validate → delegate → respond. No business logic. |
| **Services** | `AIServiceManager`, `MapsService` | One external concern each. Cacheable. Retryable. |
| **Persistence** | `BaseDB<T>` | Firestore CRUD only. Returns typed domain objects. |
| **Middleware** | `authMiddleware`, `requestId` | Cross-cutting concerns. Stateless. |
| **Shared Contracts** | `shared/types/index.ts`, `types/eco_types.ts` | Pure TypeScript — no runtime imports. |
| **Constants** | `constants/index.ts` | All values cited to primary sources (IPCC/EPA/ICCT). |

---

## 4. Data Flow — Commute Calculation

A single `POST /api/commute` request travels through all layers:

```
Client
  │  POST /api/commute
  │  { origin, destination, travelMode: "DRIVING", trips: 5 }
  │  Authorization: Bearer <idToken>
  ▼
authMiddleware (requireAuth)
  │  verifyIdToken(idToken)  →  Firebase Admin SDK
  │  Attaches req.user.uid (trusted claim)
  ▼
validateCommuteInput (express-validator)
  │  Sanitizes + validates all fields
  │  Returns 422 if invalid
  ▼
commuteRouter.post handler
  │  Extracts userId from req.user.uid (never req.body)
  ▼
MapsService.calculateCommuteEmissions()
  │  Calls Google Maps Directions API
  │  Applies emission factor from constants/index.ts
  │  withRetry() wraps the HTTP call (3 attempts, exp. backoff)
  ▼
(optional) CommuteEmissionsDB.save()
  │  BaseDB.addDoc<EmissionRecord>() → Firestore
  ▼
sendSuccess(res, { distanceKm, kgCO2e, ... })
  │  Envelope: { success: true, data: {...}, statusCode: 200 }
  ▼
Client receives typed CommuteResult
```

---

## 5. Type Safety Strategy

All 26 historical `any` occurrences have been eliminated. The type system is enforced at every boundary:

### Generic Persistence Layer

```typescript
// Callers declare the document shape at the call site
const record = await db.getDoc<EmissionRecord>('users/uid/emissions', id);
// TypeScript knows: record is (EmissionRecord & { id: string }) | null
```

### Safe Error Narrowing

```typescript
// Pattern used throughout all catch blocks
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  // ↑ never throws — unknown narrowed before access
}
```

### Generic Cache

```typescript
// Cache stores typed values — no implicit any on retrieval
const cached = getFromCache<BillScanResult>(cacheKey);
// TypeScript knows: cached is BillScanResult | null
```

### Route Handler Returns

```typescript
// Explicit about the two possible returns — avoids implicit any
async (req, res): Promise<void | Response> => {
  if (!valid) return sendError(res, ...);   // Response
  return sendSuccess(res, data);            // Response
  // or falls through to next() → void
}
```

---

## 6. Service Design

### AIServiceManager

- **Single responsibility**: Wraps all Gemini API calls.
- **LRU Cache**: `Map<string, CacheEntry<T>>` with 1-hour TTL and 100-entry cap. Generics prevent type drift.
- **Retry**: `withRetry()` wraps every Gemini call with exponential backoff (3 attempts).
- **Prompt injection defense**: `sanitizePrompt()` rejects known injection patterns before every API call.
- **Graceful degradation**: `GEMINI_STUB=true` env var activates realistic stub responses — the endpoint always returns data.
- **Stub mode**: `VISION_STUB=true` returns deterministic bill scan stubs for CI and development.

### MapsService

- **Single responsibility**: Google Maps Directions API wrapper.
- **Emission calculation**: Distance × emission factor from `constants/index.ts` (DEFRA/EPA cited).
- **Stub mode**: `MAPS_STUB=true` returns fixed route data for tests.

### BaseDB

- **Abstract base**: Domain services extend it (`EmissionsDB`, `CommuteEmissionsDB`).
- **Generics**: `addDoc<T>()`, `queryCollection<T>()` — document shapes declared at call sites.
- **Timestamp normalization**: `_deserialize()` converts Firestore `Timestamp` → ISO strings automatically.
- **Singleton Firestore**: Lazy initialization avoids cold-start overhead.

---

## 7. Security Architecture

```
Request
  │
  ├─ Rate Limit (express-rate-limit)
  │    ├─ AI endpoints: 10 req / 15 min (keyed by uid || IP)
  │    └─ General endpoints: 100 req / 15 min
  │
  ├─ requireAuth (Firebase Admin verifyIdToken)
  │    ├─ Decodes JWT from Authorization: Bearer header
  │    ├─ checkRevoked=true (server-side session invalidation)
  │    └─ Attaches req.user.uid (trusted, server-side claim)
  │
  ├─ Cross-user Guard (routes)
  │    └─ if (req.body.userId && req.body.userId !== req.user.uid) → 403
  │
  ├─ express-validator sanitization (per route)
  │    ├─ .escape() on address inputs (XSS prevention)
  │    ├─ .isFloat({ min, max }) on numeric inputs
  │    └─ .isIn([...]) on enum inputs
  │
  └─ Firestore Security Rules
       └─ Allow read/write only when request.auth.uid == userId path segment
```

See [SECURITY.md](../SECURITY.md) for full details on each control.

---

## 8. Resilience & Graceful Degradation

EcoTrack is designed so that **external API failures degrade gracefully** — the application continues to function:

| Scenario | Behavior |
|---|---|
| Gemini API down | `/api/insights` falls back to a rules-based insight engine; always returns recommendations |
| Gemini Vision down | `/api/scan` returns a structured "manual entry" fallback with kWh=null and guidance message |
| Maps API down | `/api/commute` returns 503 with a retry-friendly error (not a 500 crash) |
| Firestore write fails | Calculation result is still returned; persistence failure is logged separately |
| All stubs enabled | Every endpoint returns deterministic data — full UI works with zero external calls |

**Implementation pattern** (insights route):
```
Try Gemini → success → return AI insights
           ↓ fail (log + continue)
Try rules engine → success → return rule-based insights
                 ↓ fail (log)
Return 500 with structured error
```

---

## 9. Constants — Scientific Citations

All emission factors in `backend/constants/index.ts` are sourced from authoritative primary sources:

| Constant | Value | Source |
|---|---|---|
| `GLOBAL_AVG_ANNUAL_KG_CO2E` | 4,500 kg | IPCC AR6 WG3 (2022), Table 5.1 |
| `SUSTAINABLE_TARGET_ANNUAL_KG_CO2E` | 2,300 kg | IPCC SR1.5 (2018), SPM Table 2 |
| `VEHICLE_EMISSION_FACTORS_KG_PER_KM.PETROL` | 0.120 | EPA (2024) + ICCT (2023) |
| `ELECTRICITY_KG_PER_KWH` | 0.233 | EPA eGRID 2023 national average |
| `GAS_KG_PER_KWH` | 0.205 | UK DEFRA GHG Conversion Factors 2024 |

> Keeping constants in one file with citations makes them auditable and versionable. When science updates (e.g., grid becomes cleaner), one file change propagates everywhere.

---

## 10. CI/CD Pipeline

```
git push main
     │
     ▼
Cloud Build (cloudbuild.yaml)
     │
     ├─ npm install (all workspaces)
     ├─ npm run lint (ESLint, 0 warnings enforced)
     ├─ npm run test (102 tests: 60 frontend + 42 backend)
     ├─ tsc --noEmit (0 type errors enforced)
     │
     ├─ docker build (multi-stage)
     │   ├─ Stage 1: Install all deps
     │   ├─ Stage 2: Build frontend (Vite) + backend (tsc)
     │   └─ Stage 3: Production image (node:20-alpine, dumb-init)
     │
     └─ gcloud run deploy
          └─ Cloud Run (asia-south1, min-instances=0, port=8080)
```

**Gate**: Any lint error, test failure, or TypeScript error aborts the pipeline. Production deployments are guaranteed to be type-safe.

---

## 11. Local Development

```bash
# Install all workspaces
npm install

# Start frontend (Vite, port 5173) + backend (tsx watch, port 8080)
npm run dev

# Type-check backend
npx tsc --project backend/tsconfig.json --noEmit

# Run all tests with coverage
npm run test

# Lint all workspaces (0 warnings = green)
npm run lint
```

**Environment variables** (`.env` at project root):
```
GOOGLE_MAPS_API_KEY=...
GOOGLE_GEMINI_API_KEY=...
FIREBASE_SERVICE_ACCOUNT_JSON=...

# Stub modes (no external calls)
MAPS_STUB=true
GEMINI_STUB=true
VISION_STUB=true
```

---

## 12. Design Decisions & Rationale

### Why TypeScript with `strict: true`?
Catches bugs at compile time (during development) rather than at runtime (in production). Generic `BaseDB<T>` means adding a new document type is one line — the compiler validates every call site.

### Why multi-stage Docker builds?
The production image contains only compiled JavaScript (`dist/`) and production `node_modules`. Build tools (`tsc`, `vite`, `typescript`) never reach production — smaller image, smaller attack surface.

### Why Cloud Run over App Engine?
Scale-to-zero billing (cost-efficient for a hackathon), per-request billing, automatic TLS, and container portability. The backend runs identically locally, in Docker, and on Cloud Run.

### Why an in-memory LRU cache for AI responses?
Gemini API has rate limits and latency. The same user asking for insights on the same footprint data shouldn't pay for two API calls. One hour TTL balances freshness with cost efficiency.

### Why `withRetry()` instead of SDK-level retries?
Composable: the retry logic is tested in isolation, works across all service types (Maps, Gemini, Firestore), and can be configured per-call-site. The default — 3 attempts, 500ms initial, 2× backoff, ±25% jitter — follows the thundering herd prevention pattern.
