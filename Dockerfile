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

# Copy source (includes frontend/.env with VITE_ config)
COPY frontend/ ./

# Accept VITE_ build-time args (can be passed via --build-arg in Cloud Build)
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_GOOGLE_MAPS_API_KEY

# Export ARGs as ENV so Vite (which reads process.env) can access them.
# If not passed as build-args, Vite will fall back to the .env file copied above.
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY

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
