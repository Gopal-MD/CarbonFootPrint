# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned (Step 3)
- Full Google Maps Directions API integration in Commute Tracker
- Gemini Vision multimodal bill scanning UI (file upload + camera capture)
- Personalized AI Eco-Insights page with Gemini 2.0 Flash
- Firestore emission history charts (recharts)
- Firebase Authentication flow polished with protected routes
- Playwright E2E test suites for all critical journeys

---

## [0.1.0] — 2026-06-14

### Added (Step 1: Project Scaffolding & Configs)

#### Repository Structure
- Initialized npm workspaces monorepo (`frontend/`, `backend/`)
- Root `package.json` with `dev`, `build`, `lint`, `test`, `security:audit` scripts
- `.gitignore` covering Node, Vite, env files, test artifacts, Docker, OS files
- `.prettierrc` with Google-style formatting (single quotes, 2-space, trailing commas)
- `.dockerignore` excluding secrets, build artifacts, and dev files

#### Frontend (`frontend/`)
- **React 18 + Vite** application initialized
- `eslint.config.mjs` — Flat config with `eslint:recommended` + `react` + `react-hooks` + `jsx-a11y/strict` (zero-warning enforcement)
- `vite.config.js` — Code splitting (vendor-react, vendor-firebase, vendor-maps chunks), Terser minification, dev proxy to backend
- `index.html` — Semantic HTML5, SEO meta tags, Open Graph, Google Fonts preconnect, `aria-live` announcer region
- `src/main.jsx` — React 18 `createRoot` with `StrictMode` and `BrowserRouter`
- `src/App.jsx` — Lazy-loaded routes, `ProtectedRoute`, `PageLoader` with aria announcements
- `src/firebase.js` — Firebase SDK initialization with env var validation, singleton pattern, emulator support
- `src/index.css` — Complete design system: 100+ CSS custom properties, dark/light themes, glassmorphism cards, button system, form system, skeleton loaders, responsive grid
- `src/context/AuthContext.jsx` — Firebase Auth context with sign-in, sign-up, Google OAuth, sign-out, password reset
- `src/utils/ariaAnnouncer.js` — Polite `aria-live` announcer utility for screen readers
- `src/utils/carbonCalc.js` — Pure emission calculation functions with IPCC/DEFRA factors
- `src/components/layout/AppShell.jsx` — Sidebar navigation with NavLink active states, skip link, user profile
- `src/components/ui/LoadingSpinner.jsx` — Accessible spinner with `role="status"` and `aria-label`
- `src/pages/DashboardPage.jsx` — Hero stats, emission breakdown, progress bar, quick actions
- `src/pages/AuthPage.jsx` — Sign-in/sign-up with email/password and Google OAuth
- `src/pages/CommutePage.jsx` — Stub (Step 3)
- `src/pages/ScanPage.jsx` — Stub (Step 3)
- `src/pages/InsightsPage.jsx` — Stub (Step 3)
- `src/pages/NotFoundPage.jsx` — Accessible 404 page
- `src/test/setup.js` — Vitest global setup with Firebase mock and jsdom polyfills
- `src/test/carbonCalc.test.js` — 20 unit tests covering happy paths and edge cases
- `playwright.config.js` — Multi-browser E2E config (Chrome, Firefox, Safari, Mobile)

#### Backend (`backend/`)
- **Node.js + Express** server initialized
- `server.js` — Full production server: dotenv → validateEnv → Helmet → CORS → rate limits → Morgan → routes → global error handler → graceful SIGTERM
- `types/eco_types.js` — JSDoc `@typedef` for all data models: `UserProfile`, `EmissionRecord`, `CommuteInput`, `CommuteResult`, `BillScanResult`, `EcoInsight`, `EcoInsightTip`, `ApiSuccessResponse`, `ApiErrorResponse`, `RetryConfig`
- `utils/validateEnv.js` — Fail-fast env validation with descriptive startup errors; `getEnv`, `isProduction`, `isStubEnabled` helpers
- `utils/withRetry.js` — Exponential backoff retry (±25% jitter, configurable `shouldRetry`, retryable status codes: 429/502/503/504)
- `utils/logger.js` — Winston logger (dev: colorized, prod: structured JSON for Cloud Logging) with `createModuleLogger`
- `services/BaseDB.js` — Abstract Firestore layer with `getDoc`, `setDoc`, `updateDoc`, `addDoc`, `queryCollection`, `deleteDoc`; Timestamp deserialization
- `services/AIServiceManager.js` — Gemini 2.0 Flash wrapper with TTL LRU cache (100 entries, 1hr), `generateInsight`, `analyzeImageBase64`, stub mode
- `routes/index.js` — Route mounting with health check and API 404 handler
- `routes/commute.js` — Input validation, stub mode, Step 3 placeholder
- `routes/scan.js` — Base64/MIME validation, Gemini Vision integration
- `routes/insights.js` — Personalized prompt builder, Gemini text generation
- `routes/emissions.js` — Firestore CRUD with `EmissionsDB` subclass
- `routes/auth.js` — Firebase token verification with revocation checking
- `.env.example` — All required/optional env vars documented
- `tests/withRetry.test.js` — 9 unit tests: success, network retry, 400 no-retry, 429 retry, exhaustion, custom predicate, timeout
- `vitest.config.js` — Backend test configuration

#### Documentation
- `README.md` — Architecture diagram, Google services table, quick start, project structure, testing strategy, accessibility, performance, security overview
- `SECURITY.md` — STRIDE threat model, OWASP Top 10 checklist (all 10), security controls tables, vulnerability reporting SLA, incident response runbook (P1 API key rotation, Firebase breach), security architecture diagram
- `CHANGELOG.md` — This file

#### Infrastructure
- `Dockerfile` — 3-stage build: `builder-frontend` (Vite) → `builder-backend` (prod deps) → `production` (non-root UID 1001, dumb-init, HEALTHCHECK, port 8080)
- `.dockerignore` — Excludes secrets, build artifacts, and dev tools

### Security
- Helmet.js with CSP, HSTS, X-Frame-Options, nosniff
- CORS allowlist (env-configurable)
- Global rate limit: 100 req/15min
- AI endpoint rate limit: 10 req/15min per user+IP
- All inputs validated and sanitized via `express-validator`
- Fail-fast env validation on startup
- Non-root Docker container (UID 1001)
- Firebase token revocation checking

---

[Unreleased]: https://github.com/Gopal-MD/CarbonFootPrint/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Gopal-MD/CarbonFootPrint/releases/tag/v0.1.0
