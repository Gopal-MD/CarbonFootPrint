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

# Copy source and build
COPY frontend/ ./
RUN npm run build

# ─────────────────────────────────────────────────
# Stage 2: Prepare Backend (Node.js + Express)
# ─────────────────────────────────────────────────
FROM node:20-alpine AS builder-backend

LABEL stage="builder-backend"

RUN apk add --no-cache libc6-compat

WORKDIR /app/backend

# Copy dependency manifests
COPY backend/package.json backend/package-lock.json* ./

# Install ONLY production dependencies
RUN npm install --omit=dev --ignore-scripts

# Copy backend source
COPY backend/ ./

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

# Copy backend (with node_modules) from builder-backend
COPY --from=builder-backend --chown=appuser:appgroup /app/backend ./backend

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
