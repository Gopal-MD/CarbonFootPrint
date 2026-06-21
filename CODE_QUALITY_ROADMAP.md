# Code Quality Improvement Roadmap
## Current: 88/100 → Target: 95/100

---

## 1. TYPE SAFETY (88→92: +4 points) — ~3 hours

### High Priority: Replace `any` in Data Transfer Objects
These 6 files are the **critical path** for typing (70% of issues):

**Backend:**
- `backend/services/BaseDB.ts`: 9 `any` types (generic DB operations)
- `backend/utils/apiResponse.ts`: 4 `any` types (response data)
- `backend/routes/commute.ts`: 2 `any` types (record data)
- `backend/routes/emissions.ts`: 2 `any` types (record/filter data)
- `backend/routes/scan.ts`: 1 `any` type (image analysis result)
- `backend/services/AIServiceManager.ts`: 3 `any` types (cache/response data)

**Frontend:**
- `frontend/src/context/AuthContext.tsx`: 5 `any` (error handling)
- `frontend/src/pages/*.tsx`: 3 `any` (event handlers)

### Solution Pattern:

```typescript
// BEFORE
async save(userId: string, record: any): Promise<{ id: string }>

// AFTER
interface EmissionRecordInput {
  category: 'commute' | 'utility' | 'food' | 'other';
  kgCO2e: number;
  date: string;
  metadata?: Record<string, unknown>;
}

async save(userId: string, record: EmissionRecordInput): Promise<{ id: string }>
```

### New Type Files to Create:
1. **`backend/types/api.ts`** — Request/Response DTOs
2. **`backend/types/services.ts`** — Service return types
3. **`backend/types/errors.ts`** — Error handling types

---

## 2. DOCUMENTATION (+2 points) — ~2 hours

### Add JSDoc to 15 Public Functions

**Critical functions without docs:**
- `backend/utils/apiResponse.ts`: `sendSuccess`, `sendError`
- `backend/utils/withRetry.ts`: `withRetry` function
- `backend/middleware/authMiddleware.ts`: `requireAuth`
- `backend/routes/insights.ts`: `buildInsightPrompt`

### Add Source Citations for Constants

Replace magic numbers with documented constants:

```typescript
// BEFORE
const ELECTRICITY_FACTOR = 0.21233; // kg CO₂e / kWh

// AFTER
/**
 * Electricity emission factor (kg CO₂e / kWh).
 * Source: US EPA eGrid 2024 average grid mix (www.epa.gov/egrid)
 * Based on national average for grid-connected electricity generation.
 */
const ELECTRICITY_EMISSION_FACTOR_KG_CO2E_PER_KWH = 0.21233;
```

### Create `ARCHITECTURE.md`
Document the 3-layer architecture:
- **Transport Layer**: Express routes (request validation, middleware)
- **Domain Layer**: Business logic (calculations, algorithms)
- **Persistence Layer**: Firestore access (BaseDB, queries)

---

## 3. GRACEFUL DEGRADATION (+2 points) — ~4 hours

### Current Problem
Insights & Scan endpoints **hard-fail** when Gemini API is unavailable:
```typescript
const { text } = await aiManager.generateInsight(prompt);
// If Gemini down → 500 error, no fallback
```

### Solution: Implement Fallback Strategy

**Option A: Rules-Based Fallback (Simple, 1 hour)**
```typescript
const { text, usedFallback } = await aiManager.generateInsight(prompt);
if (usedFallback) {
  // Served pre-computed rules, not Gemini
  res.set('X-AI-Mode', 'rules-engine');
}
```

**Option B: Feature Flags (Medium, 2 hours)**
```typescript
if (features.isAIEnabled() && !features.isMaintenance()) {
  insight = await aiManager.generateInsight(prompt);
} else {
  insight = generateRuleBasedInsight(data);
}
```

**Option C: Graceful Degradation + Retry (Best, 3 hours)**
- Try Gemini with 2 retries
- Fall back to rules engine on failure
- Log failures for monitoring
- Add `X-AI-Mode` header to indicate source

### New File: `backend/services/InsightFallback.ts`
Pre-computed, rule-based insights when AI is unavailable.

---

## 4. LAYERING & DEPENDENCY INJECTION (+1 point) — ~6 hours (optional)

### Current Issue
Routes directly import services:
```typescript
// routes/emissions.ts
const emissionsDB = new EmissionsDB();
```

This makes testing hard (can't inject mocks) and couples layers.

### Solution: Service Locator Pattern (lightweight DI)

```typescript
// services/ServiceLocator.ts
class ServiceLocator {
  private static db: DatabaseProvider;
  
  static setDB(provider: DatabaseProvider) {
    this.db = provider;
  }
  
  static getDB(): DatabaseProvider {
    return this.db;
  }
}

// server.ts initialization
ServiceLocator.setDB(process.env.USE_MOCK_DB ? new MockDB() : new BaseDB());

// routes/emissions.ts usage
const db = ServiceLocator.getDB();
```

This lets you:
- Swap implementations without code changes
- Test without real Firestore
- Implement feature flags easily

---

## Implementation Priority & Time Breakdown

### Phase 1: Quick Wins (2 hours, +4 points) — DO THIS FIRST
1. Create `backend/types/api.ts` with response DTOs
2. Replace 10 most common `any` types in BaseDB & apiResponse
3. Add JSDoc to 5 core functions
4. Add source citations to 3 key constants

**Result: 88/100 → 92/100**

### Phase 2: Documentation (1 hour, +1 point)
1. Add JSDoc to remaining public functions
2. Create `ARCHITECTURE.md`

**Result: 92/100 → 93/100**

### Phase 3: Graceful Degradation (3 hours, +2 points)
1. Implement rules-based fallback for insights
2. Add fallback to scan endpoint
3. Add feature flags for testing

**Result: 93/100 → 95/100**

### Phase 4: Advanced (6 hours, +1 point) — SKIP IF TIME LIMITED
1. Implement Service Locator pattern
2. Refactor routes to use dependency injection
3. Add integration tests with mock DB

**Result: 95/100 → 96/100**

---

## Why This Matters

| Gap | Impact | Fix Effort | Score Gain |
|-----|--------|-----------|-----------|
| 18 `any` types | Type checker can't help | 2h | +2 |
| No JSDoc | Maintenance burden | 1h | +1 |
| Hard failures | User experience impact | 2h | +1 |
| Tight coupling | Testing difficulty | 4h | +1 |

**Sweet spot: Complete Phase 1 + 2 in 3 hours → reach 93/100 (professional tier)**

---

## Next Steps

1. **Now:** Create type files (30 min)
2. **Next:** Replace `any` types in top 5 files (1h)
3. **Then:** Add graceful degradation to insights (2h)
4. **Finally:** Refactor services if time permits (4h)

Would you like me to start with **Phase 1** (Type Safety)? I can implement all changes automatically.
