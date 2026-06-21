/**
 * @fileoverview Tests for pure calculator functions.
 *
 * Runs without mocks, network connection, or DB operations.
 */

import { describe, it, expect } from 'vitest';
import { calculateCommuteEmissions, calculateElectricityEmissions } from '../../domain/calculator.js';

describe('calculateCommuteEmissions', () => {
  it('calculates driving emissions correctly', () => {
    const result = calculateCommuteEmissions(10, 'DRIVING', 2, 'PETROL');
    expect(result).toBeCloseTo(10 * 2 * 0.12, 4);
  });

  it('handles other fuel types like EV', () => {
    const result = calculateCommuteEmissions(10, 'DRIVING', 2, 'EV');
    expect(result).toBeCloseTo(10 * 2 * 0.04, 4);
  });

  it('returns 0 for walking', () => {
    const result = calculateCommuteEmissions(15, 'WALKING', 5);
    expect(result).toBe(0);
  });

  it('throws for negative inputs', () => {
    expect(() => calculateCommuteEmissions(-5, 'DRIVING', 1)).toThrow();
    expect(() => calculateCommuteEmissions(5, 'DRIVING', -1)).toThrow();
  });
});

describe('calculateElectricityEmissions', () => {
  it('calculates emissions correctly', () => {
    const result = calculateElectricityEmissions(100);
    expect(result).toBeCloseTo(100 * 0.233, 4);
  });

  it('throws for negative kWh', () => {
    expect(() => calculateElectricityEmissions(-10)).toThrow();
  });
});
