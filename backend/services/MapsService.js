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

const logger = createModuleLogger('MapsService');

const MAPS_DIRECTIONS_BASE_URL = 'https://maps.googleapis.com/maps/api/directions/json';

/**
 * Emission factors in kg CO₂e per passenger-km.
 * Sources: UK DEFRA 2023 Greenhouse Gas Reporting.
 *
 * @readonly
 * @type {Record<string, number>}
 */
const EMISSION_FACTORS_KG_PER_KM = {
  DRIVING: 0.17046,   // Average petrol car
  TRANSIT: 0.03549,   // UK rail average
  WALKING: 0.0,
  BICYCLING: 0.0,
};

/**
 * Maps Google Maps travel mode strings to Directions API mode parameter values.
 *
 * @readonly
 * @type {Record<string, string>}
 */
const MODE_MAP = {
  DRIVING: 'driving',
  TRANSIT: 'transit',
  WALKING: 'walking',
  BICYCLING: 'bicycling',
};

/**
 * @typedef {object} DirectionsResult
 * @property {number} distanceKm - Route distance in kilometers.
 * @property {number} durationMinutes - Route duration in minutes.
 * @property {string} originAddress - Resolved origin address from Maps API.
 * @property {string} destinationAddress - Resolved destination address from Maps API.
 */

/**
 * Calls the Google Maps Directions API and returns distance and duration.
 *
 * @param {string} origin - Starting address or lat/lng.
 * @param {string} destination - Ending address or lat/lng.
 * @param {string} travelMode - One of DRIVING, TRANSIT, WALKING, BICYCLING.
 * @param {string} apiKey - Google Maps API key.
 * @returns {Promise<DirectionsResult>}
 * @throws {Error} If the API returns no routes or an error status.
 */
async function fetchDirections(origin, destination, travelMode, apiKey) {
  const mode = MODE_MAP[travelMode.toUpperCase()] || 'driving';

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
    const err = new Error(`Maps API HTTP error: ${response.status} ${response.statusText}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();

  if (data.status === 'ZERO_RESULTS') {
    throw new Error(
      `No route found between "${origin}" and "${destination}" for mode ${travelMode}. ` +
        'Check addresses and travel mode.'
    );
  }

  if (data.status !== 'OK') {
    const err = new Error(
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
 *
 * @class
 */
export class MapsService {
  /**
   * @param {string} apiKey - Google Maps API key.
   */
  constructor(apiKey) {
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
   * @param {import('../types/eco_types.js').CommuteInput} input - Commute parameters.
   * @returns {Promise<import('../types/eco_types.js').CommuteResult>}
   * @throws {Error} If the Maps API fails after all retries.
   *
   * @example
   * const result = await mapsService.calculateCommuteEmissions({
   *   origin: 'London Bridge, London',
   *   destination: 'Canary Wharf, London',
   *   travelMode: 'TRANSIT',
   *   trips: 2,
   * });
   */
  async calculateCommuteEmissions(input) {
    const { origin, destination, travelMode, trips = 1 } = input;

    if (isStubEnabled('MAPS')) {
      return this._stubResult(origin, destination, travelMode, trips);
    }

    logger.info(`[MapsService] Calculating route: ${origin} → ${destination} (${travelMode})`);

    const directions = await withRetry(
      () => fetchDirections(origin, destination, travelMode, this._apiKey),
      { maxAttempts: 3, initialDelayMs: 1000 },
      'maps-directions'
    );

    const factor = EMISSION_FACTORS_KG_PER_KM[travelMode.toUpperCase()] ?? 0;
    const kgCO2e = Math.round(directions.distanceKm * trips * factor * 10000) / 10000;

    logger.info(
      `[MapsService] Route computed: ${directions.distanceKm.toFixed(1)} km, ` +
        `${directions.durationMinutes} min, ${kgCO2e} kg CO₂e`
    );

    return {
      distanceKm: Math.round(directions.distanceKm * 100) / 100,
      durationMinutes: directions.durationMinutes,
      kgCO2e,
      travelMode: travelMode.toUpperCase(),
      originAddress: directions.originAddress,
      destinationAddress: directions.destinationAddress,
    };
  }

  /**
   * Returns a deterministic stub result for testing without a billing-enabled project.
   *
   * @param {string} origin - Origin address.
   * @param {string} destination - Destination address.
   * @param {string} travelMode - Travel mode.
   * @param {number} trips - Number of trips.
   * @returns {import('../types/eco_types.js').CommuteResult}
   * @private
   */
  _stubResult(origin, destination, travelMode, trips) {
    logger.info('[MapsService] Returning stub result (MAPS_STUB=true)');
    const distanceKm = 12.5;
    const factor = EMISSION_FACTORS_KG_PER_KM[travelMode.toUpperCase()] ?? 0;
    return {
      distanceKm,
      durationMinutes: 22,
      kgCO2e: Math.round(distanceKm * trips * factor * 10000) / 10000,
      travelMode: travelMode.toUpperCase(),
      originAddress: origin,
      destinationAddress: destination,
    };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
let _instance = null;

/**
 * Returns the singleton MapsService instance.
 *
 * @returns {MapsService}
 */
export function getMapsService() {
  if (!_instance) {
    _instance = new MapsService(process.env.GOOGLE_MAPS_API_KEY);
  }
  return _instance;
}
