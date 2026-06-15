/**
 * @fileoverview Google Maps Directions API service.
 *
 * Wraps the Google Maps Directions REST API to compute driving/transit/walking/
 * bicycling distances and durations between two points. Combines the route data
 * with emission factors to produce carbon footprint calculations.
 *
 * Uses native Node 20 `fetch` with the withRetry utility for resilience.
 * Supports a stub mode (MAPS_STUB=true) for testing without a billing-enabled project.
 *
 * @module services/MapsService
 */

import { withRetry } from '../utils/withRetry.js';
import { createModuleLogger } from '../utils/logger.js';
import { isStubEnabled } from '../utils/validateEnv.js';
import { TravelMode, CommuteInput, CommuteResult } from '../../shared/types/index.js';

const logger = createModuleLogger('MapsService');

const MAPS_DIRECTIONS_BASE_URL = 'https://maps.googleapis.com/maps/api/directions/json';

/**
 * Emission factors in kg CO₂e per passenger-km.
 * Sources: UK DEFRA 2023 Greenhouse Gas Reporting.
 */
const EMISSION_FACTORS_KG_PER_KM: Record<TravelMode, number> = {
  DRIVING: 0.17046,   // Average petrol car
  TRANSIT: 0.03549,   // UK rail average
  WALKING: 0.0,
  BICYCLING: 0.0,
};

/**
 * Maps Google Maps travel mode strings to Directions API mode parameter values.
 */
const MODE_MAP: Record<TravelMode, string> = {
  DRIVING: 'driving',
  TRANSIT: 'transit',
  WALKING: 'walking',
  BICYCLING: 'bicycling',
};

interface DirectionsResult {
  distanceKm: number;
  durationMinutes: number;
  originAddress: string;
  destinationAddress: string;
}

interface MapsError extends Error {
  status?: number;
}

interface GoogleMapsDirectionsLeg {
  distance: { value: number; text: string };
  duration: { value: number; text: string };
  start_address: string;
  end_address: string;
}

interface GoogleMapsDirectionsRoute {
  legs: GoogleMapsDirectionsLeg[];
}

interface GoogleMapsDirectionsResponse {
  status: string;
  error_message?: string;
  routes: GoogleMapsDirectionsRoute[];
}

/**
 * Calls the Google Maps Directions API and returns distance and duration.
 *
 * @param origin - Starting address or lat/lng.
 * @param destination - Ending address or lat/lng.
 * @param travelMode - One of DRIVING, TRANSIT, WALKING, BICYCLING.
 * @param apiKey - Google Maps API key.
 * @returns Directions info on success.
 * @throws {Error} If the API returns no routes or an error status.
 */
async function fetchDirections(
  origin: string,
  destination: string,
  travelMode: TravelMode,
  apiKey: string
): Promise<DirectionsResult> {
  const modeKey = travelMode.toUpperCase() as TravelMode;
  const mode = MODE_MAP[modeKey] || 'driving';

  const url = new URL(MAPS_DIRECTIONS_BASE_URL);
  url.searchParams.set('origin', origin);
  url.searchParams.set('destination', destination);
  url.searchParams.set('mode', mode);
  url.searchParams.set('units', 'metric');
  url.searchParams.set('key', apiKey);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000), // 10s timeout
  });

  if (!response.ok) {
    const err: MapsError = new Error(`Maps API HTTP error: ${response.status} ${response.statusText}`);
    err.status = response.status;
    throw err;
  }

  const data = (await response.json()) as GoogleMapsDirectionsResponse;

  if (data.status === 'ZERO_RESULTS') {
    throw new Error(
      `No route found between "${origin}" and "${destination}" for mode ${travelMode}. ` +
        'Check addresses and travel mode.'
    );
  }

  if (data.status !== 'OK') {
    const err: MapsError = new Error(
      `Google Maps API error: ${data.status}. ${data.error_message || ''}`
    );
    // Map API status to HTTP-like status for retry logic
    if (data.status === 'OVER_DAILY_LIMIT' || data.status === 'OVER_QUERY_LIMIT') {
      err.status = 429;
    }
    throw err;
  }

  const leg = data.routes?.[0]?.legs?.[0];
  if (!leg) {
    throw new Error('Maps API returned routes but no legs data.');
  }

  return {
    distanceKm: leg.distance.value / 1000, // meters → km
    durationMinutes: Math.round(leg.duration.value / 60), // seconds → minutes
    originAddress: leg.start_address,
    destinationAddress: leg.end_address,
  };
}

// ── MapsService Class ─────────────────────────────────────────────────────────
/**
 * Service for computing commute carbon emissions using the Google Maps Directions API.
 */
export class MapsService {
  private _apiKey?: string;

  /**
   * @param apiKey - Google Maps API key.
   */
  constructor(apiKey?: string) {
    if (!apiKey && !isStubEnabled('MAPS')) {
      throw new Error('MapsService requires a valid GOOGLE_MAPS_API_KEY');
    }
    this._apiKey = apiKey;
    logger.info(`MapsService initialized. Stub mode: ${isStubEnabled('MAPS')}`);
  }

  /**
   * Calculates the carbon emissions for a commute route.
   * Calls Google Maps Directions API, extracts distance, and applies emission factors.
   *
   * @param input - Commute parameters.
   * @returns Commute emission details.
   * @throws {Error} If the Maps API fails after all retries.
   */
  async calculateCommuteEmissions(input: CommuteInput): Promise<CommuteResult> {
    const { origin, destination, travelMode, trips = 1 } = input;

    if (isStubEnabled('MAPS')) {
      return this._stubResult(origin, destination, travelMode, trips);
    }

    logger.info(`[MapsService] Calculating route: ${origin} → ${destination} (${travelMode})`);

    const directions = await withRetry(
      () => fetchDirections(origin, destination, travelMode, this._apiKey || ''),
      { maxAttempts: 3, initialDelayMs: 1000 },
      'maps-directions'
    );

    const modeKey = travelMode.toUpperCase() as TravelMode;
    const factor = EMISSION_FACTORS_KG_PER_KM[modeKey] ?? 0;
    const kgCO2e = Math.round(directions.distanceKm * trips * factor * 10000) / 10000;

    logger.info(
      `[MapsService] Route computed: ${directions.distanceKm.toFixed(1)} km, ` +
        `${directions.durationMinutes} min, ${kgCO2e} kg CO₂e`
    );

    return {
      distanceKm: Math.round(directions.distanceKm * 100) / 100,
      durationMinutes: directions.durationMinutes,
      kgCO2e,
      travelMode: modeKey,
      originAddress: directions.originAddress,
      destinationAddress: directions.destinationAddress,
    };
  }

  /**
   * Returns a deterministic stub result for testing without a billing-enabled project.
   */
  private _stubResult(origin: string, destination: string, travelMode: TravelMode, trips: number): CommuteResult {
    logger.info('[MapsService] Returning stub result (MAPS_STUB=true)');
    const distanceKm = 12.5;
    const modeKey = travelMode.toUpperCase() as TravelMode;
    const factor = EMISSION_FACTORS_KG_PER_KM[modeKey] ?? 0;
    return {
      distanceKm,
      durationMinutes: 22,
      kgCO2e: Math.round(distanceKm * trips * factor * 10000) / 10000,
      travelMode: modeKey,
      originAddress: origin,
      destinationAddress: destination,
    };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
let _instance: MapsService | null = null;

/**
 * Returns the singleton MapsService instance.
 */
export function getMapsService(): MapsService {
  if (!_instance) {
    _instance = new MapsService(process.env.GOOGLE_MAPS_API_KEY);
  }
  return _instance;
}
