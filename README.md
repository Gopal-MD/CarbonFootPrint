# 🌍 EcoTrack — Carbon Footprint Awareness Platform

[![Google Solution Challenge](https://img.shields.io/badge/Google%20Solution%20Challenge-2025-4285F4?logo=google&logoColor=white)](https://developers.google.com/community/gdsc-solution-challenge)
[![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)](.github/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=nodedotjs)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18.x-61DAFB?logo=react)](https://react.dev)

> **AI-powered platform to help individuals understand, track, and reduce their personal carbon footprint** — built for the Google Solution Challenge using 5 core Google services.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    EcoTrack Platform                            │
│                                                                 │
│  ┌──────────────────────┐    ┌──────────────────────────────┐   │
│  │   React 18 + Vite    │    │   Node.js + Express          │   │
│  │   Frontend           │───▶│   Backend (Cloud Run)        │   │
│  │                      │    │                              │   │
│  │  • Dashboard         │    │  • /api/commute  (Maps)      │   │
│  │  • Commute Tracker   │    │  • /api/scan     (Vision)    │   │
│  │  • Bill Scanner      │    │  • /api/insights (Gemini)    │   │
│  │  • Eco Insights      │    │  • /api/emissions (Firestore)│   │
│  └──────────────────────┘    └──────────────────────────────┘   │
│                                        │                        │
│              ┌─────────────────────────┼──────────────────────┐ │
│              │     Google Services     │                      │ │
│              │                        │                      │ │
│    ┌─────────┴──┐  ┌──────────┐  ┌───┴──────┐  ┌──────────┐ │ │
│    │  Firebase  │  │  Gemini  │  │  Maps    │  │  Cloud   │ │ │
│    │  Auth +    │  │  2.0     │  │  API     │  │  Run     │ │ │
│    │  Firestore │  │  Flash   │  │ (Directions│  │ (Deploy) │ │ │
│    └────────────┘  └──────────┘  └──────────┘  └──────────┘ │ │
│                                                               │ │
│              └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 🔧 5 Google Services Integrated

| Service | Purpose | Implementation |
|---|---|---|
| **Google Cloud Run** | Containerized deployment | Multi-stage Dockerfile, port 8080, graceful SIGTERM |
| **Firebase Auth + Firestore** | Authentication & data persistence | Google OAuth, email/password, Firestore CRUD |
| **Gemini 2.0 Flash** | AI Eco-Assistant + Bill Vision | Text insights + multimodal image analysis |
| **Google Maps API** | Commute distance & emissions | Directions API, distance matrix |
| **Gemini Vision** | Utility bill scanning | Multimodal extraction of kWh from bill images |

---

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 20.0.0
- npm ≥ 10.0.0
- Docker (for Cloud Run deployment)
- Firebase project with Auth and Firestore enabled
- Google Cloud project with required APIs enabled

### 1. Clone & Install

```bash
git clone https://github.com/Gopal-MD/CarbonFootPrint.git
cd CarbonFootPrint
npm install
```

### 2. Configure Environment

```bash
# Backend
cp backend/.env.example backend/.env
# Fill in all required API keys in backend/.env

# Frontend
cp frontend/.env.example frontend/.env.local
# Fill in Firebase config values
```

**Required backend environment variables:**

| Variable | Description |
|---|---|
| `GOOGLE_GEMINI_API_KEY` | From [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `GOOGLE_MAPS_API_KEY` | Maps + Directions API enabled |
| `GOOGLE_CLOUD_PROJECT_ID` | Your GCP project ID |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Service account JSON from Firebase Console |

### 3. Development

```bash
npm run dev
# Frontend: http://localhost:5173
# Backend:  http://localhost:8080
```

### 4. Testing

```bash
# Unit tests (Vitest)
npm run test

# E2E tests (Playwright)
npm run test:e2e --workspace=frontend

# Security audit
npm run security:audit
```

### 5. Production Build

```bash
npm run build
```

### 6. Docker / Cloud Run

```bash
# Build the multi-stage image
docker build -t ecotrack .

# Run locally
docker run -p 8080:8080 \
  -e GOOGLE_GEMINI_API_KEY=your_key \
  -e GOOGLE_MAPS_API_KEY=your_key \
  -e GOOGLE_CLOUD_PROJECT_ID=your_project \
  -e FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account"...}' \
  ecotrack

# Deploy to Cloud Run
gcloud run deploy ecotrack \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets GOOGLE_GEMINI_API_KEY=gemini-api-key:latest \
  --set-secrets FIREBASE_SERVICE_ACCOUNT_JSON=firebase-sa:latest
```

---

## 📁 Project Structure

```
CarbonFootPrint/
├── frontend/                    # React 18 + Vite
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/          # AppShell
│   │   │   └── ui/              # LoadingSpinner, etc.
│   │   ├── context/             # AuthContext (Firebase)
│   │   ├── pages/               # Route components
│   │   ├── services/            # API client utilities
│   │   ├── utils/               # carbonCalc, ariaAnnouncer
│   │   ├── test/                # Vitest setup & tests
│   │   ├── App.jsx              # Router with lazy loading
│   │   ├── firebase.js          # Firebase initialization
│   │   └── index.css            # Global design system
│   ├── playwright/              # E2E tests
│   ├── eslint.config.mjs        # Flat ESLint config
│   ├── playwright.config.js
│   └── vite.config.js
│
├── backend/                     # Node.js + Express
│   ├── routes/                  # API endpoints
│   │   ├── commute.js           # Google Maps integration
│   │   ├── scan.js              # Gemini Vision bill scanner
│   │   ├── insights.js          # Gemini text insights
│   │   ├── emissions.js         # Firestore CRUD
│   │   └── auth.js              # Firebase token verification
│   ├── services/
│   │   ├── BaseDB.js            # Abstract Firestore layer
│   │   └── AIServiceManager.js  # Gemini + LRU cache
│   ├── utils/
│   │   ├── validateEnv.js       # Fail-fast env validation
│   │   ├── withRetry.js         # Exponential backoff retry
│   │   └── logger.js            # Winston structured logging
│   ├── types/
│   │   └── eco_types.js         # JSDoc @typedef models
│   ├── tests/                   # Vitest backend tests
│   └── server.js                # Express entry point
│
├── Dockerfile                   # Multi-stage production build
├── .dockerignore
├── .prettierrc
├── SECURITY.md
├── CHANGELOG.md
└── package.json                 # npm workspaces root
```

---

## 🧪 Testing Strategy

### Unit Tests (Vitest)
- `frontend/src/test/carbonCalc.test.js` — Emission calculations, edge cases
- `backend/tests/withRetry.test.js` — Retry logic, all error classes

### E2E Tests (Playwright)
- Critical user journeys: Auth → Dashboard → Commute → Scan → Insights
- Multi-browser: Chromium, Firefox, WebKit, Mobile Chrome

### Test Commands
```bash
npm run test                     # All unit tests with coverage
npm run test:e2e --workspace=frontend  # Playwright E2E
```

---

## ♿ Accessibility

- **WCAG 2.1 AA** compliant throughout
- Keyboard-navigable with visible focus rings
- `aria-live` polite regions for AI loading states
- Screen reader announcements via `ariaAnnouncer.js`
- Skip-to-main-content link on all pages
- Semantic HTML5 landmarks (`<main>`, `<nav>`, `<header>`, `<aside>`)

---

## ⚡ Performance

- **Lighthouse target**: 98+ on all categories
- Code splitting by route (React.lazy + Suspense)
- Manual chunk strategy: vendor-react, vendor-firebase, vendor-maps
- Terser minification with console stripping in production
- 1-year asset cache for hashed bundles
- AI response LRU cache (100 entries, 1-hour TTL)

---

## 🔐 Security

See [SECURITY.md](SECURITY.md) for the full threat model, OWASP compliance, and incident response procedures.

**Key measures:**
- Helmet.js with strict CSP
- Express rate limiting (global: 100/15min, AI: 10/15min)
- Input sanitization via `express-validator`
- Environment variable fail-fast validation
- Firebase Admin token verification with revocation checking
- Non-root Docker container (UID 1001)
- `dumb-init` for proper signal handling

---

## 📄 License

MIT © 2025 EcoTrack Team
