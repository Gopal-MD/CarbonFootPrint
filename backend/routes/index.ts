/**
 * @fileoverview Express route index — mounts all API route modules.
 * Acts as the single registration point for all backend endpoints.
 *
 * Route structure:
 *  GET  /health           → Server health check (no auth required)
 *  POST /api/commute      → Commute carbon calculation (Google Maps)
 *  POST /api/scan         → Utility bill scan (Gemini Vision)
 *  POST /api/insights     → Personalized AI eco-insights (Gemini Text)
 *  GET  /api/emissions    → User emission history (Firestore)
 *  POST /api/emissions    → Save an emission record (Firestore)
 *  POST /api/auth/verify  → Verify Firebase ID token
 *
 * @module routes/index
 */

import { Router, Request, Response, NextFunction } from 'express';
import { commuteRouter } from './commute.js';
import { scanRouter } from './scan.js';
import { insightsRouter } from './insights.js';
import { emissionsRouter } from './emissions.js';
import { authRouter } from './auth.js';
import logger from '../utils/logger.js';

const router = Router();

// ── Health Check (no auth, no rate limit) ───────────────────────────────────
/**
 * GET /health
 * Cloud Run readiness and liveness probe endpoint.
 * Returns 200 with server metadata if the process is running.
 */
router.get('/health', (req: Request, res: Response): void => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: Math.floor(process.uptime()),
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
router.use('/api/commute', (req: Request, _res: Response, next: NextFunction): void => {
  logger.http(`${req.method} /api/commute`);
  next();
}, commuteRouter);

router.use('/api/scan', (req: Request, _res: Response, next: NextFunction): void => {
  logger.http(`${req.method} /api/scan`);
  next();
}, scanRouter);

router.use('/api/insights', (req: Request, _res: Response, next: NextFunction): void => {
  logger.http(`${req.method} /api/insights`);
  next();
}, insightsRouter);

router.use('/api/emissions', (req: Request, _res: Response, next: NextFunction): void => {
  logger.http(`${req.method} /api/emissions`);
  next();
}, emissionsRouter);

router.use('/api/auth', (req: Request, _res: Response, next: NextFunction): void => {
  logger.http(`${req.method} /api/auth`);
  next();
}, authRouter);

// ── 404 Handler for unknown API routes ──────────────────────────────────────
router.use('/api/*', (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `API route not found: ${req.method} ${req.originalUrl}`,
    statusCode: 404,
  });
});

export default router;
