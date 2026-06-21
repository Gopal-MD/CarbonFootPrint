/**
 * @fileoverview Request Data Transfer Objects (DTOs).
 *
 * Explicitly types all incoming HTTP request payloads. DTOs are intentionally
 * separate from domain models (eco_types.ts) to allow the public API contract
 * to evolve independently of the internal data layer.
 *
 * All field-level validation is still performed by the express-validator chains
 * in each route. These types serve as the static contract layer.
 *
 * @module dto/requests
 */

import type { TravelMode, VehicleFuelType, EmissionCategory } from '../types/eco_types.js';

/**
 * Request payload for POST /api/commute.
 *
 * Calculates CO₂e emissions for a commute leg using Google Maps
 * real-world distance data and DEFRA 2024 emission factors.
 */
export interface CommuteRequestDto {
  /** Starting address or coordinate string (max 500 chars). */
  origin: string;
  /** Destination address or coordinate string (max 500 chars). */
  destination: string;
  /** Google Maps travel mode. */
  travelMode: TravelMode;
  /** Number of one-way trips to calculate (default: 1, max: 100). */
  trips?: number;
  /** Vehicle fuel type — only applicable when travelMode is DRIVING. */
  fuelType?: VehicleFuelType;
  /**
   * When true, persists a commute EmissionRecord to Firestore after
   * a successful calculation. Requires a valid Firebase ID token.
   */
  saveRecord?: boolean;
}

/**
 * Request payload for POST /api/scan.
 *
 * Submits a Base64-encoded utility bill image for Gemini Vision
 * extraction of kWh consumption and provider metadata.
 */
export interface ScanRequestDto {
  /** Base64-encoded image data (no data-URI prefix). */
  imageBase64: string;
  /** MIME type of the source image. */
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif';
}

/**
 * Request payload for POST /api/insights.
 *
 * Provides the user's monthly carbon breakdown to the Gemini AI model,
 * which responds with personalised reduction strategies. Supports
 * an optional rules-engine fallback when Gemini is unavailable.
 */
export interface InsightsRequestDto {
  /** User's total monthly carbon footprint (kg CO₂e). Must be ≥ 0. */
  monthlyKgCO2e: number;
  /** Commute portion of the monthly total (kg CO₂e). */
  commuteKg?: number;
  /** Utility portion of the monthly total (kg CO₂e). */
  utilityKg?: number;
  /** Primary travel mode — used to personalise commute-specific tips. */
  travelMode?: TravelMode | 'MIXED';
}

/**
 * Request payload for POST /api/emissions.
 *
 * Manually saves an emission record (e.g., food or lifestyle) directly
 * to Firestore. The userId is always sourced from the verified token,
 * never from the request body.
 */
export interface EmissionRecordRequestDto {
  /** Emission category. */
  category: EmissionCategory;
  /** Carbon emissions in kg CO₂ equivalent. Must be in range 0–100 000. */
  kgCO2e: number;
  /** ISO 8601 date string (YYYY-MM-DD) for the emission event. */
  date: string;
  /** Optional category-specific extra data (see EmissionMetadata). */
  metadata?: Record<string, unknown>;
}

/**
 * Request payload for POST /api/auth/verify.
 *
 * Verifies a Firebase ID token server-side and returns the decoded
 * claims. Used by the client to confirm a token is still valid.
 */
export interface AuthVerifyRequestDto {
  /** Firebase ID token string obtained from the client SDK. */
  idToken: string;
}
