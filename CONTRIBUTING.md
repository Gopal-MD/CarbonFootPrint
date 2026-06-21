# Contributing to EcoTrack 🌍

Thank you for your interest in contributing to EcoTrack! This guide explains how to set up, develop, test, and submit contributions.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)
- [Testing Requirements](#testing-requirements)
- [Commit Message Convention](#commit-message-convention)
- [Pull Request Process](#pull-request-process)
- [Security Policy](#security-policy)

---

## Development Setup

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20.0.0 | [nodejs.org](https://nodejs.org) |
| npm | ≥ 10.0.0 | Bundled with Node.js |
| Git | ≥ 2.40.0 | [git-scm.com](https://git-scm.com) |

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/Gopal-MD/CarbonFootPrint.git
cd CarbonFootPrint

# 2. Install all workspace dependencies
npm install

# 3. Copy the environment template
cp backend/.env.example backend/.env
# Edit backend/.env with your API keys

# 4. Start the development server
npm run dev

# Frontend runs at: http://localhost:5173
# Backend runs at:  http://localhost:8080
# API Docs at:      http://localhost:8080/api/docs
```

### Environment Variables

See [`backend/.env.example`](backend/.env.example) for a full list.

**Stub modes** (no real API calls required for local development):

```bash
MAPS_STUB=true        # Use canned Google Maps responses
GEMINI_STUB=true      # Use canned Gemini AI responses
VISION_STUB=true      # Use canned Vision API responses
```

---

## Project Structure

```
CarbonFootPrint/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml           # CI: lint, typecheck, test, build
│   │   └── codeql.yml       # Security scanning
│   └── dependabot.yml       # Automated dependency updates
│
├── frontend/                # React 18 + TypeScript (Vite)
│   └── src/
│
├── backend/                 # Express + TypeScript (Node 20)
│   ├── constants/           # Scientific emission constants
│   ├── middleware/          # Auth, error handler, request-id
│   ├── routes/              # HTTP handlers (thin layer)
│   ├── services/            # External API clients
│   ├── tests/
│   │   ├── routes.test.ts   # Integration tests
│   │   └── unit/            # Unit tests per module
│   ├── types/               # Backend TypeScript interfaces
│   └── utils/               # apiResponse, withRetry, logger
│
├── shared/
│   └── types/index.ts       # Shared TypeScript contracts
│
└── docs/
    └── ARCHITECTURE.md
```

---

## Development Workflow

### Running Tests

```bash
# All tests (frontend + backend)
npm run test

# Backend tests only
npm run test --workspace=backend

# Frontend tests only
npm run test --workspace=frontend

# Backend tests in watch mode
npm run test:watch --workspace=backend
```

### Running Linter

```bash
# Check all workspaces (must pass 0 warnings)
npm run lint

# Auto-fix where possible
npm run lint:fix --workspace=backend
```

### Type Checking

```bash
# Check backend
npx tsc --project backend/tsconfig.json --noEmit

# Check frontend
npx tsc --project frontend/tsconfig.json --noEmit
```

### View API Documentation

Start the dev server and visit: **http://localhost:8080/api/docs**

---

## Code Standards

### TypeScript

- **Strict mode**: `strict: true` in all tsconfig files
- **Zero `any` types**: all values must be explicitly typed
- **Error narrowing**: always use `catch (error: unknown)` with `instanceof Error` guards
- **Generic patterns**: use `T` generics for reusable functions, e.g., `BaseDB.getDoc<T>()`

### Function Length

Keep functions **under 50 lines**. Extract helpers where needed.

### Complexity

Cognitive complexity **≤ 15** (enforced by SonarJS ESLint rule).

### Documentation

All exported functions require JSDoc:

```typescript
/**
 * Brief one-line description.
 *
 * @param userId - Firebase UID from verified token.
 * @param record - Emission data to persist.
 * @returns The new document ID.
 * @throws {Error} If the Firestore write fails.
 */
export async function saveEmission(userId: string, record: EmissionInput): Promise<{ id: string }>
```

### Security

- Never log sensitive data (tokens, passwords, PII)
- Always use `req.user.uid` from the verified token — never from `req.body`
- Use `express-validator` with `.escape()` on all string inputs
- Catch blocks must use `unknown`, never `any`

---

## Testing Requirements

All PRs must maintain or improve test coverage:

| Metric | Threshold |
|---|---|
| Lines | ≥ 80% |
| Functions | ≥ 80% |
| Branches | ≥ 75% |
| Statements | ≥ 80% |

The CI pipeline fails if coverage drops below these thresholds.

### What to Test

- **Unit tests** (`tests/unit/`): pure functions, utilities, services
- **Integration tests** (`tests/routes.test.ts`): HTTP contract tests via supertest
- **Edge cases**: empty inputs, boundary values, error paths
- **Authentication**: 401 without token, 403 on UID mismatch, expired/revoked tokens

### Test File Convention

```
tests/
├── routes.test.ts           # Integration tests (supertest)
└── unit/
    ├── utils.test.ts        # Unit tests: withRetry, apiResponse, validateEnv
    ├── services.test.ts     # Unit tests: MapsService, AIServiceManager
    └── middleware.test.ts   # Unit tests: auth, errorHandler
```

---

## Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

### Types

| Type | When to Use |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code change (no new feature, no bug fix) |
| `test` | Adding or updating tests |
| `docs` | Documentation only |
| `chore` | Build, CI, dependencies |
| `perf` | Performance improvement |
| `security` | Security fix |

### Examples

```bash
feat(commute): add fuel type selection for EV/hybrid vehicles
fix(auth): handle expired Firebase tokens with 401 TOKEN_EXPIRED
refactor(emissions): extract BaseDB generics for type-safe queries
test(middleware): add 8 unit tests for requireAuth edge cases
docs(api): add OpenAPI schema for /api/scan endpoint
chore(deps): update firebase-admin to 12.4.0
security(cors): restrict allowed origins to production domains
```

---

## Pull Request Process

1. **Fork** the repository and create a branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Write tests** before writing code (TDD preferred)

3. **Run the full check** locally before pushing:
   ```bash
   npm run lint
   npx tsc --project backend/tsconfig.json --noEmit
   npm run test
   ```

4. **Push** and open a PR against `main`

5. **PR checklist**:
   - [ ] All CI checks pass (lint, typecheck, tests, build)
   - [ ] Coverage maintained at ≥80%
   - [ ] JSDoc added for all new exported functions
   - [ ] No `any` types introduced
   - [ ] CHANGELOG.md updated (if user-facing change)

6. **Review**: at least one approval required before merge

---

## Security Policy

For security vulnerabilities, please **do not** open a public GitHub issue.

Instead, follow the process documented in [SECURITY.md](SECURITY.md).

---

## Questions?

Open a GitHub Discussion or reach out via the issue tracker.

Thank you for making EcoTrack better! 🌱
