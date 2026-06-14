/**
 * @fileoverview Express application entry point.
 *
 * Startup sequence (order is intentional):
 * 1. Load environment variables (dotenv)
 * 2. Validate required env vars — crash fast if missing
 * 3. Initialize logger
 * 4. Create Express app with security middleware
 * 5. Mount routes
 * 6. Start HTTP server
 * 7. Register graceful shutdown handlers (SIGTERM for Cloud Run)
 *
 * @module server
 */

// ── Step 1: Load environment variables BEFORE any other imports ──────────────
import 'dotenv/config';

// ── Step 2: Validate env vars — crash immediately if critical keys missing ───
import { validateEnv, getEnv, isProduction } from './utils/validateEnv.js';
validateEnv();

// ── Now safe to import other modules ─────────────────────────────────────────
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';

import logger from './utils/logger.js';
import router from './routes/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Express Application Setup
// ─────────────────────────────────────────────────────────────────────────────
const app = express();
const PORT = parseInt(getEnv('PORT', '8080'), 10);

// ── Security: Helmet (secure HTTP headers) ────────────────────────────────────
/**
 * Helmet configuration with strict CSP.
 * Allows Google Fonts, Maps API, and Firebase endpoints.
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // Required for Vite module scripts & Google Identity
          'https://maps.googleapis.com',
          'https://maps.gstatic.com',
          'https://apis.google.com',
          'https://accounts.google.com',
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // Required for Google Maps inline styles
          'https://fonts.googleapis.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://*.googleapis.com',
          'https://*.gstatic.com',
          'https://*.google.com',
        ],
        connectSrc: [
          "'self'",
          'https://*.googleapis.com',
          'https://*.google.com',
          'https://firestore.googleapis.com',
          'https://identitytoolkit.googleapis.com', // Firebase Auth REST API
          'https://securetoken.googleapis.com',     // Firebase token refresh
          'https://*.firebaseio.com',
          'wss://*.firebaseio.com',
          'https://*.cloudfunctions.net',
          'https://carbonfootprint-984604014815.asia-south1.run.app',
        ],
        frameSrc: [
          'https://accounts.google.com',   // Google Sign-In popup
          'https://*.firebaseapp.com',     // Firebase Auth popup
          'https://carbonfootprint-97b87.firebaseapp.com',
        ],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: isProduction() ? [] : null,
      },
    },
    hsts: isProduction()
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    crossOriginEmbedderPolicy: false, // Disabled to allow Google Maps iframes
  })
);

// ── Security: CORS ────────────────────────────────────────────────────────────
const allowedOriginsEnv = getEnv('CORS_ALLOWED_ORIGINS', '');
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:8080',
  'https://carbonfootprint-984604014815.asia-south1.run.app',
  ...( allowedOriginsEnv ? allowedOriginsEnv.split(',').map((o) => o.trim()).filter(Boolean) : [] ),
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, same-origin SPA)
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Allow any Cloud Run *.run.app URL (may have multiple subdomain levels)
      if (/^https:\/\/.+\.run\.app$/.test(origin)) {
        return callback(null, true);
      }
      logger.warn(`[CORS] Rejected request from origin: ${origin}`);
      return callback(new Error(`CORS: Origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    credentials: true,
    maxAge: 86400, // Cache preflight for 24h
  })
);


// ── Security: Rate Limiting ────────────────────────────────────────────────────
/**
 * Global API rate limit: 100 requests per 15-minute window per IP.
 * Stricter limits are applied to AI endpoints (scan, insights).
 */
const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true, // RateLimit-* headers
  legacyHeaders: false,
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests. Please try again in 15 minutes.',
    statusCode: 429,
  },
  skip: (req) => req.path === '/health', // Don't rate-limit health checks
  handler: (req, res) => {
    logger.warn(`[RateLimit] IP ${req.ip} exceeded global rate limit`);
    res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
      statusCode: 429,
    });
  },
});

/**
 * Strict rate limit for AI endpoints: 10 requests per 15-minute window.
 * Protects against Gemini API cost abuse.
 */
const aiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Key by user ID (from body) + IP for more accurate limiting
    return `${req.body?.userId || 'anon'}_${req.ip}`;
  },
  handler: (req, res) => {
    logger.warn(`[RateLimit] AI endpoint rate limit exceeded for IP ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'AI_RATE_LIMIT_EXCEEDED',
      message: 'AI request limit reached. Please wait 15 minutes.',
      statusCode: 429,
    });
  },
});

// ── Parsing & Logging ─────────────────────────────────────────────────────────
app.use(express.json({ limit: '15mb' })); // 15 MB to accommodate base64 images
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// HTTP request logging
const morganFormat = isProduction() ? 'combined' : 'dev';
app.use(
  morgan(morganFormat, {
    stream: {
      write: (message) => logger.http(message.trim()),
    },
    skip: (req) => req.path === '/health', // Suppress health check noise
  })
);

// ── Trust proxy (required for Cloud Run / load balancers) ─────────────────────
app.set('trust proxy', 1);

// ── Rate Limiting (applied AFTER static files — assets must never be rate-limited) ────
// NOTE: Registered here so CSS/JS/image asset requests bypass rate limiting entirely.
app.use((req, res, next) => {
  // Skip rate limiting for all static asset paths
  if (req.path.startsWith('/assets/') || req.path === '/favicon.svg' || req.path === '/manifest.json') {
    return next();
  }
  return globalRateLimit(req, res, next);
});

// ── Apply strict AI rate limit to expensive endpoints ─────────────────────────
app.use('/api/scan', aiRateLimit);
app.use('/api/insights', aiRateLimit);

// ── Static file serving (React frontend in production) ────────────────────────
if (isProduction()) {
  const { fileURLToPath } = await import('url');
  const { dirname, join } = await import('path');
  const { createReadStream, existsSync } = await import('fs');

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const frontendDistPath = join(__dirname, '..', 'frontend', 'dist');

  if (existsSync(frontendDistPath)) {
    // Serve static assets
    const serveStatic = (await import('express')).default.static;
    app.use(serveStatic(frontendDistPath, {
      maxAge: '1y', // Long cache for hashed assets
      etag: true,
      setHeaders: (res, path) => {
        // Don't cache HTML (for CSP / routing)
        if (path.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      },
    }));

    // SPA fallback: serve index.html for all non-API routes
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path === '/health') {
        return next();
      }
      res.sendFile(join(frontendDistPath, 'index.html'));
    });

    logger.info(`Serving frontend static files from: ${frontendDistPath}`);
  } else {
    logger.warn(`Frontend dist not found at ${frontendDistPath}. Run: npm run build --workspace=frontend`);
  }
}

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/', router);

// ─────────────────────────────────────────────────────────────────────────────
// Global Error Handler
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Centralized error handling middleware.
 * Converts all thrown errors into consistent JSON error responses.
 * Must be registered AFTER all routes.
 *
 * @param {Error} err - The error object.
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} _next - Express next (required signature).
 * @returns {void}
 */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  // Log with full context
  logger.error('[GlobalErrorHandler]', {
    message: err.message,
    stack: isProduction() ? undefined : err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    retriesExhausted: err.retriesExhausted,
    operationName: err.operationName,
  });

  // CORS errors
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({
      success: false,
      error: 'CORS_ERROR',
      message: err.message,
      statusCode: 403,
    });
  }

  // Validation errors from express-validator that weren't caught in routes
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'INVALID_JSON',
      message: 'Request body contains invalid JSON.',
      statusCode: 400,
    });
  }

  // Request body too large (multer / bodyParser)
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      success: false,
      error: 'PAYLOAD_TOO_LARGE',
      message: 'Request body exceeds the maximum allowed size of 15 MB.',
      statusCode: 413,
    });
  }

  // Generic 500 — never expose internal details in production
  const statusCode = err.statusCode || err.status || 500;
  return res.status(statusCode).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: isProduction()
      ? 'An unexpected error occurred. Please try again later.'
      : err.message,
    statusCode,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Server Start
// ─────────────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  logger.info(`
╔══════════════════════════════════════════════════════════════╗
║         EcoTrack — Carbon Footprint Platform Backend         ║
╠══════════════════════════════════════════════════════════════╣
║  Status:       RUNNING                                       ║
║  Port:         ${String(PORT).padEnd(44)} ║
║  Environment:  ${(process.env.NODE_ENV || 'development').padEnd(44)} ║
║  Node:         ${process.version.padEnd(44)} ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

// ─────────────────────────────────────────────────────────────────────────────
// Graceful Shutdown (Cloud Run SIGTERM handling)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Handles SIGTERM signal from Cloud Run for graceful shutdown.
 * Stops accepting new connections, waits for in-flight requests to complete,
 * then exits cleanly.
 *
 * Cloud Run sends SIGTERM and waits up to 10 seconds before SIGKILL.
 */
function gracefulShutdown(signal) {
  logger.info(`[Shutdown] Received ${signal}. Starting graceful shutdown...`);

  server.close((err) => {
    if (err) {
      logger.error('[Shutdown] Error during graceful shutdown:', { error: err.message });
      process.exit(1);
    }
    logger.info('[Shutdown] HTTP server closed. All connections drained. Exiting.');
    process.exit(0);
  });

  // Force exit after 8 seconds (before Cloud Run's 10s SIGKILL timeout)
  setTimeout(() => {
    logger.error('[Shutdown] Timeout reached. Forcing exit.');
    process.exit(1);
  }, 8000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions and rejections (last resort)
process.on('uncaughtException', (err) => {
  logger.error('[FATAL] Uncaught exception:', { message: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('[FATAL] Unhandled promise rejection:', { reason });
  process.exit(1);
});

export { app, server };
