/**
 * @fileoverview Application service and repository interfaces.
 *
 * Business-level contracts that define what each service must do, without
 * prescribing how it does it. Enables:
 *  - Multiple implementations (e.g., Gemini vs. rules engine)
 *  - Mock-free unit testing via InMemory implementations
 *  - Dependency inversion for clean architecture
 *
 * These interfaces complement the repository interfaces in
 * `repositories/IEmissionRepository.ts`.
 *
 * @module interfaces
 */

import type { TravelMode, VehicleFuelType } from '../types/eco_types.js';
import type { CommuteResponseDto } from '../dto/responses.js';

// ─────────────────────────────────────────────────────────────────────────────
// Carbon Calculator Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure carbon calculation contract.
 *
 * Implementations must be:
 * - **Deterministic**: Same inputs always produce the same output.
 * - **Side-effect-free**: No I/O, logging, or external calls.
 * - **Synchronous-friendly**: May be implemented as sync or async.
 */
export interface ICalculatorService {
  /**
   * Calculate commute CO₂ emissions for a given route and travel mode.
   *
   * @param distanceKm - One-way route distance in kilometres.
   * @param travelMode - Google Maps travel mode.
   * @param trips - Number of one-way trips.
   * @param fuelType - Fuel type (relevant for DRIVING only).
   * @returns Calculated CO₂e in kg.
   */
  calculateCommuteEmissions(
    distanceKm: number,
    travelMode: TravelMode,
    trips: number,
    fuelType?: VehicleFuelType
  ): number;

  /**
   * Calculate CO₂ emissions from electricity consumption.
   *
   * @param kWh - Electricity consumed in kilowatt-hours.
   * @returns Calculated CO₂e in kg.
   */
  calculateElectricityEmissions(kWh: number): number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Maps Service Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Route calculation contract.
 *
 * Production implementation calls Google Maps Directions API.
 * Stub implementation returns fixed distances for offline testing.
 */
export interface IMapsService {
  /**
   * Calculate a route between two addresses.
   *
   * @param origin - Starting address or coordinates.
   * @param destination - Destination address or coordinates.
   * @param travelMode - Google Maps travel mode.
   * @returns Route result with distance and duration.
   * @throws When Google Maps API returns an error or no route is found.
   */
  calculateRoute(
    origin: string,
    destination: string,
    travelMode: TravelMode
  ): Promise<CommuteResponseDto>;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Service Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AI insight generation contract.
 *
 * Production implementation calls Gemini API.
 * Stub returns canned responses for testing.
 */
export interface IAIService {
  /**
   * Generate a personalised eco-insight from the user's monthly data.
   *
   * @param prompt - Formatted prompt string for the AI model.
   * @param skipCache - When true, bypasses in-memory response cache.
   * @returns The generated insight text and cache metadata.
   */
  generateInsight(
    prompt: string,
    skipCache?: boolean
  ): Promise<{ text: string; cached: boolean; generatedAt: string }>;

  /**
   * Extract energy consumption data from a Base64-encoded utility bill image.
   *
   * @param imageBase64 - Base64 image string (no data-URI prefix).
   * @param mimeType - MIME type of the source image.
   * @returns Structured extraction result.
   */
  analyzeImageBase64(
    imageBase64: string,
    mimeType: string
  ): Promise<{
    kWh: number | null;
    billProvider: string | null;
    billPeriod: string | null;
    confidence: number;
    rawSummary: string;
    cached: boolean;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification Service Interface (extensible contract)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * User notification contract.
 *
 * Placeholder interface enabling future push-notification integration
 * (Firebase Cloud Messaging, email, etc.) without changing existing code.
 */
export interface INotificationService {
  /**
   * Send a general notification to a user.
   *
   * @param userId - Firebase UID of the recipient.
   * @param message - Notification message body.
   */
  notifyUser(userId: string, message: string): Promise<void>;

  /**
   * Notify a user that they've hit a carbon-reduction milestone.
   *
   * @param userId - Firebase UID of the recipient.
   * @param milestone - Milestone identifier (e.g., "50kg_saved").
   */
  notifyMilestone(userId: string, milestone: string): Promise<void>;
}
