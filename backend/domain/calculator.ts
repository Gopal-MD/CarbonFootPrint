/**
 * @fileoverview Pure carbon calculation engine.
 *
 * Domain layer: no I/O, no side effects, no dependencies on external services.
 * Same input always produces same output. Trivially testable.
 *
 * @module domain/calculator
 */

import {
  VEHICLE_EMISSION_FACTORS_KG_PER_KM,
  TRANSIT_EMISSION_FACTORS_KG_PER_KM,
  ELECTRICITY_KG_PER_KWH,
} from '../constants/index.js';
import type { TravelMode, VehicleFuelType } from '../types/eco_types.js';

/**
 * Calculates commute emissions (kg CO2e).
 *
 * @param distanceKm - Distance in km
 * @param travelMode - Mode of travel
 * @param trips - Number of trips
 * @param fuelType - Optional fuel type for DRIVING (PETROL, DIESEL, EV, HYBRID)
 * @returns Commute emissions in kg CO2e.
 */
export function calculateCommuteEmissions(
  distanceKm: number,
  travelMode: TravelMode,
  trips: number,
  fuelType?: VehicleFuelType
): number {
  if (distanceKm < 0) {
    throw new Error('Distance must be non-negative');
  }
  if (trips < 0) {
    throw new Error('Trips must be non-negative');
  }

  const mode = travelMode.toUpperCase() as TravelMode;

  let factor = 0;
  if (mode === 'DRIVING') {
    const fuel = (fuelType?.toUpperCase() || 'PETROL') as VehicleFuelType;
    factor = VEHICLE_EMISSION_FACTORS_KG_PER_KM[fuel] ?? VEHICLE_EMISSION_FACTORS_KG_PER_KM.PETROL;
  } else if (mode === 'TRANSIT') {
    factor = TRANSIT_EMISSION_FACTORS_KG_PER_KM.RAIL;
  } else {
    // WALKING, BICYCLING
    factor = 0;
  }

  return Math.round(distanceKm * trips * factor * 10000) / 10000;
}

/**
 * Calculates utility emissions from electricity consumption (kg CO2e).
 *
 * @param kWh - Electricity consumed in kilowatt-hours
 * @returns Utility emissions in kg CO2e.
 */
export function calculateElectricityEmissions(kWh: number): number {
  if (kWh < 0) {
    throw new Error('kWh must be non-negative');
  }
  return Math.round(kWh * ELECTRICITY_KG_PER_KWH * 10000) / 10000;
}
