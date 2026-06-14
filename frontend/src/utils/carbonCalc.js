/**
 * @fileoverview Carbon emission calculation utilities.
 * Provides pure functions for converting energy usage and distance
 * into CO₂ equivalent emissions using IPCC / UK DEFRA emission factors.
 */

/**
 * Emission factors in kg CO₂e per unit.
 * Sources: UK DEFRA 2023, IPCC AR6 Chapter 6.
 *
 * @readonly
 * @enum {number}
 */
export const EMISSION_FACTORS = {
  // Electricity (kg CO₂e / kWh) — UK grid average
  ELECTRICITY_KWH: 0.21233,

  // Transport (kg CO₂e / passenger-km)
  DRIVING_PETROL: 0.17046,
  DRIVING_DIESEL: 0.16365,
  DRIVING_EV: 0.04716,
  TRANSIT_BUS: 0.10471,
  TRANSIT_RAIL: 0.03549,
  WALKING: 0.0,
  BICYCLING: 0.0,

  // Food (kg CO₂e / meal)
  MEAL_BEEF: 6.61,
  MEAL_CHICKEN: 1.29,
  MEAL_VEGETARIAN: 0.5,
  MEAL_VEGAN: 0.3,
};

/**
 * Maps a Google Maps travel mode string to an emission factor key.
 *
 * @type {Record<string, keyof typeof EMISSION_FACTORS>}
 */
export const TRAVEL_MODE_FACTOR_MAP = {
  DRIVING: 'DRIVING_PETROL',
  TRANSIT: 'TRANSIT_RAIL',
  WALKING: 'WALKING',
  BICYCLING: 'BICYCLING',
};

/**
 * Calculates CO₂ equivalent emissions from electricity consumption.
 *
 * @param {number} kWh - Energy consumption in kilowatt-hours. Must be >= 0.
 * @returns {number} Emissions in kg CO₂e, rounded to 4 decimal places.
 * @throws {Error} If kWh is negative or not a finite number.
 *
 * @example
 * const emissions = calculateElectricityEmissions(250);
 * // => 53.0825 kg CO₂e
 */
export function calculateElectricityEmissions(kWh) {
  if (!Number.isFinite(kWh) || kWh < 0) {
    throw new Error(`Invalid kWh value: ${kWh}. Must be a non-negative finite number.`);
  }
  return Math.round(kWh * EMISSION_FACTORS.ELECTRICITY_KWH * 10000) / 10000;
}

/**
 * Calculates CO₂ equivalent emissions from a commute.
 *
 * @param {number} distanceKm - One-way distance in kilometers. Must be >= 0.
 * @param {string} travelMode - Google Maps travel mode (DRIVING, TRANSIT, WALKING, BICYCLING).
 * @param {number} [trips=1] - Number of one-way trips (e.g., 2 for a round trip).
 * @returns {number} Total emissions in kg CO₂e, rounded to 4 decimal places.
 * @throws {Error} If distanceKm is invalid or travelMode is unrecognized.
 *
 * @example
 * const emissions = calculateCommuteEmissions(15, 'DRIVING', 2);
 * // => 5.1138 kg CO₂e (round trip, 15 km each way)
 */
export function calculateCommuteEmissions(distanceKm, travelMode, trips = 1) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new Error(`Invalid distanceKm: ${distanceKm}`);
  }
  if (!Number.isFinite(trips) || trips < 1) {
    throw new Error(`Invalid trips count: ${trips}`);
  }

  const factorKey = TRAVEL_MODE_FACTOR_MAP[travelMode?.toUpperCase()];
  if (factorKey === undefined) {
    throw new Error(
      `Unknown travelMode: "${travelMode}". Valid modes: ${Object.keys(TRAVEL_MODE_FACTOR_MAP).join(', ')}`
    );
  }

  const factor = EMISSION_FACTORS[factorKey];
  return Math.round(distanceKm * trips * factor * 10000) / 10000;
}

/**
 * Formats a CO₂e value for display, choosing appropriate unit and precision.
 *
 * @param {number} kgCO2e - Value in kg CO₂e.
 * @returns {{ value: string, unit: string }} Formatted value and display unit.
 *
 * @example
 * formatEmissions(0.5)    // => { value: '500', unit: 'g CO₂e' }
 * formatEmissions(1500)   // => { value: '1.50', unit: 't CO₂e' }
 * formatEmissions(12.5)   // => { value: '12.50', unit: 'kg CO₂e' }
 */
export function formatEmissions(kgCO2e) {
  if (kgCO2e < 1) {
    return { value: (kgCO2e * 1000).toFixed(0), unit: 'g CO₂e' };
  }
  if (kgCO2e >= 1000) {
    return { value: (kgCO2e / 1000).toFixed(2), unit: 't CO₂e' };
  }
  return { value: kgCO2e.toFixed(2), unit: 'kg CO₂e' };
}

/**
 * Returns a human-readable carbon footprint category label and color class.
 *
 * @param {number} monthlyKgCO2e - Monthly footprint in kg CO₂e.
 * @returns {{ label: string, level: 'low'|'medium'|'high'|'critical', colorClass: string }}
 */
export function getCarbonCategory(monthlyKgCO2e) {
  if (monthlyKgCO2e < 50) {
    return { label: 'Excellent', level: 'low',      colorClass: 'badge--green',  emoji: '🌿' };
  }
  if (monthlyKgCO2e < 150) {
    return { label: 'Good',      level: 'medium',   colorClass: 'badge--blue',   emoji: '✅' };
  }
  if (monthlyKgCO2e < 300) {
    return { label: 'Moderate',  level: 'high',     colorClass: 'badge--yellow', emoji: '⚠️' };
  }
  return   { label: 'High Impact', level: 'critical', colorClass: 'badge--red', emoji: '🔴' };
}
