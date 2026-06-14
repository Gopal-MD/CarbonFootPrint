/**
 * @fileoverview Unit tests for carbon calculation utilities.
 * Covers happy paths, edge cases, and invalid inputs.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateElectricityEmissions,
  calculateCommuteEmissions,
  formatEmissions,
  getCarbonCategory,
  EMISSION_FACTORS,
} from '../utils/carbonCalc.js';

describe('calculateElectricityEmissions', () => {
  it('calculates emissions correctly for a typical monthly bill (250 kWh)', () => {
    const result = calculateElectricityEmissions(250);
    expect(result).toBeCloseTo(250 * EMISSION_FACTORS.ELECTRICITY_KWH, 4);
  });

  it('returns 0 for 0 kWh consumption', () => {
    expect(calculateElectricityEmissions(0)).toBe(0);
  });

  it('handles fractional kWh values', () => {
    const result = calculateElectricityEmissions(0.5);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });

  it('throws for negative kWh', () => {
    expect(() => calculateElectricityEmissions(-10)).toThrow('Invalid kWh value');
  });

  it('throws for NaN', () => {
    expect(() => calculateElectricityEmissions(NaN)).toThrow('Invalid kWh value');
  });

  it('throws for Infinity', () => {
    expect(() => calculateElectricityEmissions(Infinity)).toThrow('Invalid kWh value');
  });
});

describe('calculateCommuteEmissions', () => {
  it('calculates driving emissions for a 10 km trip', () => {
    const result = calculateCommuteEmissions(10, 'DRIVING', 1);
    expect(result).toBeCloseTo(10 * EMISSION_FACTORS.DRIVING_PETROL, 4);
  });

  it('returns 0 for walking (0 emissions)', () => {
    expect(calculateCommuteEmissions(5, 'WALKING', 1)).toBe(0);
  });

  it('returns 0 for bicycling (0 emissions)', () => {
    expect(calculateCommuteEmissions(10, 'BICYCLING', 2)).toBe(0);
  });

  it('multiplies by trip count for round trips', () => {
    const oneWay = calculateCommuteEmissions(10, 'DRIVING', 1);
    const roundTrip = calculateCommuteEmissions(10, 'DRIVING', 2);
    expect(roundTrip).toBeCloseTo(oneWay * 2, 4);
  });

  it('handles transit mode (rail)', () => {
    const result = calculateCommuteEmissions(20, 'TRANSIT', 1);
    expect(result).toBeCloseTo(20 * EMISSION_FACTORS.TRANSIT_RAIL, 4);
  });

  it('is case-insensitive for travelMode', () => {
    const upper = calculateCommuteEmissions(10, 'DRIVING', 1);
    const lower = calculateCommuteEmissions(10, 'driving', 1);
    expect(upper).toBe(lower);
  });

  it('throws for negative distance', () => {
    expect(() => calculateCommuteEmissions(-5, 'DRIVING', 1)).toThrow('Invalid distanceKm');
  });

  it('throws for unknown travel mode', () => {
    expect(() => calculateCommuteEmissions(10, 'HELICOPTER', 1)).toThrow('Unknown travelMode');
  });

  it('throws for invalid trips count', () => {
    expect(() => calculateCommuteEmissions(10, 'DRIVING', 0)).toThrow('Invalid trips count');
  });

  it('throws for NaN distance', () => {
    expect(() => calculateCommuteEmissions(NaN, 'DRIVING', 1)).toThrow('Invalid distanceKm');
  });
});

describe('formatEmissions', () => {
  it('formats small values in grams', () => {
    const { value, unit } = formatEmissions(0.5);
    expect(unit).toBe('g CO₂e');
    expect(value).toBe('500');
  });

  it('formats moderate values in kg', () => {
    const { value, unit } = formatEmissions(12.5);
    expect(unit).toBe('kg CO₂e');
    expect(value).toBe('12.50');
  });

  it('formats large values in tonnes', () => {
    const { value, unit } = formatEmissions(1500);
    expect(unit).toBe('t CO₂e');
    expect(value).toBe('1.50');
  });

  it('formats exactly 1 kg as kg (not grams)', () => {
    const { unit } = formatEmissions(1);
    expect(unit).toBe('kg CO₂e');
  });

  it('formats exactly 1000 kg as tonnes', () => {
    const { value, unit } = formatEmissions(1000);
    expect(unit).toBe('t CO₂e');
    expect(value).toBe('1.00');
  });
});

describe('getCarbonCategory', () => {
  it('returns Excellent for footprint < 50 kg/month', () => {
    const { label, level } = getCarbonCategory(30);
    expect(label).toBe('Excellent');
    expect(level).toBe('low');
  });

  it('returns Good for footprint between 50 and 149 kg/month', () => {
    const { label } = getCarbonCategory(100);
    expect(label).toBe('Good');
  });

  it('returns Moderate for footprint between 150 and 299 kg/month', () => {
    const { label, level } = getCarbonCategory(200);
    expect(label).toBe('Moderate');
    expect(level).toBe('high');
  });

  it('returns High Impact for footprint >= 300 kg/month', () => {
    const { label, level } = getCarbonCategory(500);
    expect(label).toBe('High Impact');
    expect(level).toBe('critical');
  });

  it('returns correct colorClass for each level', () => {
    expect(getCarbonCategory(20).colorClass).toBe('badge--green');
    expect(getCarbonCategory(100).colorClass).toBe('badge--blue');
    expect(getCarbonCategory(200).colorClass).toBe('badge--yellow');
    expect(getCarbonCategory(400).colorClass).toBe('badge--red');
  });
});
