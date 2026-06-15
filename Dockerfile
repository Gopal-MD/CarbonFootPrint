# ════════════════════════════════════════════════════════════════════════════
# Carbon Footprint Awareness Platform — Multi-Stage Production Dockerfile
# Target: Google Cloud Run (port 8080, non-root, minimal attack surface)
# ════════════════════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────
# Stage 1: Build Frontend (React 18 + Vite)
# ─────────────────────────────────────────────────
FROM node:20-alpine AS builder-frontend

LABEL stage="builder-frontend"

# Install build essentials for native modules
RUN apk add --no-cache libc6-compat

WORKDIR /app/frontend

# Copy dependency manifests first (layer caching)
COPY frontend/package.json frontend/package-lock.json* ./

# Install ALL frontend deps (including devDeps needed for build)
RUN npm install --ignore-scripts

# Copy source (includes frontend/.env with VITE_ Firebase config)
COPY frontend/ ./

# Vite reads .env files natively at build time — no ARG/ENV override needed.
# The frontend/.env committed to the repo contains all VITE_FIREBASE_* values.
RUN npm run build


# ─────────────────────────────────────────────────
# Stage 2: Build & Prepare Backend
# ─────────────────────────────────────────────────
FROM node:20-alpine AS builder-backend

LABEL stage="builder-backend"

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json* ./
COPY backend/package.json ./backend/

# Install backend dependencies (including devDependencies for build)
RUN npm install --workspace=backend

# Copy source code files
COPY shared/ ./shared/
COPY backend/ ./backend/

# Compile TypeScript
RUN npx tsc --project backend/tsconfig.json

# Prepare production-only dependencies
WORKDIR /app/backend-prod
COPY backend/package.json ./
RUN npm install --omit=dev --ignore-scripts


# ─────────────────────────────────────────────────
# Stage 3: Production Runtime (minimal, non-root)
# ─────────────────────────────────────────────────
FROM node:20-alpine AS production

LABEL maintainer="Carbon Footprint Platform Team"
LABEL version="0.1.0"
LABEL description="Carbon Footprint Awareness Platform — Google Solution Challenge"

# Security hardening: install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init \
  && addgroup --system --gid 1001 appgroup \
  && adduser --system --uid 1001 --ingroup appgroup --no-create-home appuser

WORKDIR /app

# Copy backend dependencies
COPY --from=builder-backend --chown=appuser:appgroup /app/backend-prod/node_modules ./backend/node_modules
COPY --from=builder-backend --chown=appuser:appgroup /app/backend-prod/package.json ./backend/package.json

# Copy compiled backend and shared files
COPY --from=builder-backend --chown=appuser:appgroup /app/backend/dist/backend ./backend
COPY --from=builder-backend --chown=appuser:appgroup /app/backend/dist/shared ./shared

# Copy frontend build output; Express will serve static files
COPY --from=builder-frontend --chown=appuser:appgroup /app/frontend/dist ./frontend/dist

# Switch to non-root user
USER appuser

# Cloud Run mandates PORT env var; default to 8080
ENV NODE_ENV=production
ENV PORT=8080

# Expose Cloud Run port
EXPOSE 8080

# Health check — Cloud Run will probe /health
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Use dumb-init to handle PID 1 signal reaping
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "backend/server.js"]
