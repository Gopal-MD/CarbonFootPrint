# Security Policy — EcoTrack Carbon Footprint Platform

## Table of Contents

1. [Threat Model (STRIDE)](#1-threat-model-stride)
2. [OWASP Top 10 Compliance Checklist](#2-owasp-top-10-compliance-checklist)
3. [Security Controls Summary](#3-security-controls-summary)
4. [Supported Versions](#4-supported-versions)
5. [Reporting a Vulnerability](#5-reporting-a-vulnerability)
6. [Incident Response Procedures](#6-incident-response-procedures)
7. [Security Architecture](#7-security-architecture)

---

## 1. Threat Model (STRIDE)

### System Context

EcoTrack processes user-submitted data (addresses, bill images, personal emissions data) and communicates with Google APIs (Gemini, Maps, Firebase, Cloud Vision). The threat model covers the web frontend, Express backend, Firebase Firestore, and Google Cloud services.

### STRIDE Analysis

| Threat | Category | Risk | Mitigation |
|---|---|---|---|
| Unauthenticated access to emission data | **Spoofing** | HIGH | Firebase ID token verification on all protected endpoints; `verifyIdToken(token, checkRevoked=true)` |
| Forged Firebase tokens | **Spoofing** | HIGH | Server-side Firebase Admin SDK verification; revocation checks on every request |
| Modified emission records in transit | **Tampering** | MEDIUM | HTTPS enforced (Cloud Run); Helmet HSTS header |
| Injecting malicious content via API | **Tampering** | HIGH | `express-validator` strict input sanitization on ALL endpoints; length limits; allowlists |
| Accessing other users' data | **Information Disclosure** | HIGH | Firestore paths scoped to `userId`; server validates userId matches token `uid` |
| Leaking API keys in bundle | **Information Disclosure** | HIGH | Backend keys never exposed to frontend; Vite env vars only for Firebase client config |
| AI prompt injection via bill content | **Tampering** | MEDIUM | Gemini safety filters (BLOCK_MEDIUM_AND_ABOVE); output treated as untrusted text |
| Denial of service via AI endpoint spam | **Denial of Service** | HIGH | Dual rate limiting: global (100 req/15min), AI-specific (10 req/15min per user+IP) |
| Container escape / privilege escalation | **Elevation of Privilege** | LOW | Non-root user (UID 1001); read-only filesystem where possible; dumb-init PID 1 |
| Compromised dependency supply chain | **Tampering** | MEDIUM | `npm audit` in CI; `--audit-level=moderate` gate; Dependabot alerts |

---

## 2. OWASP Top 10 Compliance Checklist

### A01:2021 — Broken Access Control ✅
- [x] Firebase ID token verified server-side on all protected routes
- [x] Token revocation checked (`checkRevoked: true`)
- [x] Firestore data scoped to authenticated user's UID
- [x] No client-supplied `userId` trusted without token validation
- [x] CORS allowlist prevents cross-origin requests from unauthorized domains

### A02:2021 — Cryptographic Failures ✅
- [x] HTTPS enforced via Cloud Run (all traffic encrypted in transit)
- [x] HSTS header set in production (`max-age=31536000; includeSubDomains; preload`)
- [x] API keys stored in Cloud Run secrets (never in source code or Docker image)
- [x] Firebase service account in Secret Manager (not committed to VCS)
- [x] No sensitive data logged (API keys, tokens, image data)

### A03:2021 — Injection ✅
- [x] `express-validator` validates and sanitizes ALL user inputs
- [x] Firestore queries use Admin SDK (parameterized, no string interpolation)
- [x] Base64 image format validated with regex before processing
- [x] MIME type allowlist for bill uploads
- [x] No `eval()`, `new Function()`, or dynamic `require()` in codebase
- [x] ESLint rules: `no-eval`, `no-implied-eval`, `no-new-func` set to `error`

### A04:2021 — Insecure Design ✅
- [x] Threat model documented (STRIDE above)
- [x] Defense in depth: multiple layers (CORS → Helmet → RateLimit → Validation → Auth)
- [x] Fail-fast env validation prevents misconfigured deployments
- [x] Stub modes allow secure testing without real API credentials
- [x] AI responses treated as untrusted content (no `dangerouslySetInnerHTML`)

### A05:2021 — Security Misconfiguration ✅
- [x] Helmet.js configures 11 security headers including CSP, X-Frame-Options, HSTS
- [x] CSP restricts script sources to `'self'` + specific Google APIs
- [x] Error responses in production never expose stack traces or internal details
- [x] Non-root Docker user (UID/GID 1001)
- [x] `dumb-init` prevents zombie processes and handles signals correctly

### A06:2021 — Vulnerable and Outdated Components ✅
- [x] `npm audit --audit-level=moderate` in CI pipeline
- [x] `npm run security:audit` script in root `package.json`
- [x] Node.js 20 (current LTS) base image in Dockerfile
- [x] `node:20-alpine` minimizes attack surface vs. full Debian image
- [ ] Dependabot auto-update PRs (configure in `.github/dependabot.yml`)

### A07:2021 — Identification and Authentication Failures ✅
- [x] Firebase Authentication with email/password and Google OAuth
- [x] Minimum password length enforced on frontend (8 chars) and Firebase settings
- [x] Firebase ID tokens are short-lived (1 hour) and automatically refreshed
- [x] Token revocation support (`signOut` on all devices via Firebase)
- [x] No session cookies (stateless JWT-based auth via Firebase)

### A08:2021 — Software and Data Integrity Failures ✅
- [x] `npm ci` used in Dockerfile (not `npm install`) for reproducible builds
- [x] `package-lock.json` committed for dependency pinning
- [x] Docker build uses specific node version tag (`node:20-alpine`), not `latest`
- [x] No `--ignore-scripts` flags removed (scripts disabled in Docker build)

### A09:2021 — Security Logging and Monitoring Failures ✅
- [x] Winston structured JSON logging in production (Cloud Logging compatible)
- [x] HTTP request logging via Morgan (all requests)
- [x] Rate limit exceeded events logged with IP address
- [x] CORS violations logged with origin
- [x] Authentication failures logged at WARN level
- [x] Sensitive data never logged (API keys, image data, tokens)

### A10:2021 — Server-Side Request Forgery (SSRF) ✅
- [x] Google Maps origin/destination addresses passed to Maps SDK (not HTTP client)
- [x] No user-controlled URLs fetched server-side
- [x] Image data processed as base64 in-memory (no filesystem writes)
- [x] External API calls only to Google services (Gemini, Maps, Firebase)

---

## 3. Security Controls Summary

### HTTP Security Headers (Helmet.js)

| Header | Value |
|---|---|
| `Content-Security-Policy` | Strict allowlist (self + Google APIs) |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `X-XSS-Protection` | `0` (CSP is superior) |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` (prod) |
| `Cross-Origin-Opener-Policy` | `same-origin` |

### Rate Limiting

| Endpoint | Limit | Window |
|---|---|---|
| All API endpoints | 100 requests | 15 minutes |
| `/api/scan` | 10 requests | 15 minutes |
| `/api/insights` | 10 requests | 15 minutes |
| `/health` | Unlimited | — |

### Input Validation (express-validator)

All user inputs validated for:
- Type safety (string, number, ISO date)
- Length limits (max 500 chars for addresses, 128 for IDs)
- Format validation (base64 regex, MIME type allowlists)
- Range validation (kWh, CO₂e values must be non-negative, bounded)

---

## 4. Supported Versions

| Version | Security Updates |
|---|---|
| 0.1.x (current) | ✅ Active |

---

## 5. Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Please report security vulnerabilities by emailing:

📧 `security@ecotrack.example.com`

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Your suggested fix (if any)

**Response SLA:**
- Acknowledgement: within 48 hours
- Initial assessment: within 5 business days
- Resolution target: within 30 days for critical, 90 days for moderate

---

## 6. Incident Response Procedures

### Severity Classification

| Severity | Criteria | Response Time |
|---|---|---|
| **P1 Critical** | Data breach, account takeover, API key leak | < 2 hours |
| **P2 High** | Auth bypass, significant data exposure | < 24 hours |
| **P3 Medium** | Rate limit bypass, non-sensitive info disclosure | < 7 days |
| **P4 Low** | Security hardening improvements | Next release |

### P1 Critical Response Steps

1. **Contain** — Immediately revoke affected API keys in Google Cloud Console
2. **Isolate** — Scale Cloud Run service to 0 instances to stop traffic
3. **Assess** — Review Cloud Logging for extent of unauthorized access
4. **Notify** — Notify affected users within 72 hours (GDPR requirement)
5. **Remediate** — Deploy patched version with new credentials
6. **Review** — Post-mortem within 5 business days

### API Key Rotation Procedure

```bash
# 1. Generate new key in Google Cloud Console
# 2. Update Cloud Run secret
gcloud secrets versions add gemini-api-key --data-file=new-key.txt
# 3. Update Cloud Run to use new secret version
gcloud run services update ecotrack --update-secrets GOOGLE_GEMINI_API_KEY=gemini-api-key:latest
# 4. Verify service health
curl https://your-service-url/health
# 5. Revoke old key in Cloud Console
```

### Firebase Security Incident

```bash
# Revoke all active sessions for a compromised user
firebase auth revokeRefreshTokens <uid>

# Disable a compromised account
firebase auth updateUser <uid> --disabled
```

---

## 7. Security Architecture

```
Internet
    │
    ▼
[Google Cloud Load Balancer] ← HTTPS only, TLS 1.2+
    │
    ▼
[Cloud Run] ← Non-root, no privileged ports, min instances=0
    │
    ├── [Helmet CSP] ← Blocks unauthorized script execution
    ├── [CORS Allowlist] ← Only approved origins
    ├── [Rate Limiter] ← Prevents DoS/abuse
    ├── [express-validator] ← Sanitizes all inputs
    ├── [Firebase Token Verify] ← Cryptographic auth
    │
    ├── /api/commute → [Google Maps SDK] ← Server-to-server only
    ├── /api/scan → [Gemini Vision SDK] ← Server-to-server only
    ├── /api/insights → [Gemini Text SDK] ← Server-to-server only
    └── /api/emissions → [Firestore Admin] ← Service account auth
```

All credentials stored in **Google Cloud Secret Manager** and injected at runtime as environment variables. Never stored in Docker images or source code.

---

## 8. Verified Implementations & Mitigations

### Route Authorization & Data Scoping
All data-bearing routes (`/api/commute`, `/api/scan`, `/api/insights`, `/api/emissions`) mount the `requireAuth` middleware, which parses and verifies the Firebase ID token in the `Authorization: Bearer <idToken>` header. 
- **Authenticity validation**: Decryption and cryptographic validation are executed on the Express server.
- **Enforced Access Control**: Data queries are locked to the user UID (`req.user.uid`) retrieved from the token claims. If a client attempts to pass a custom `userId` in the body or query parameters, the server verifies `req.body.userId === req.user.uid` (or `req.query.userId === req.user.uid`) and blocks any mismatch with a `403 Forbidden` response.

### NAT-Safe Rate Limiting
To resolve the DoS risk for multiple users behind a corporate VPN or NAT sharing a public IP address:
- **Middleware ordering**: `optionalAuth` is registered before the `aiRateLimit` middlewares on `/api`.
- **Key generation**: The rate limiter `keyGenerator` keys off `req.user.uid` for authenticated sessions, falling back to `req.ip` only for anonymous or unauthenticated requests. This separates rate limit pools per authenticated user even when sharing a public IP.
