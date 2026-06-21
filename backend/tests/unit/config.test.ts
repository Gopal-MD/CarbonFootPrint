/**
 * @fileoverview Unit tests for application config loading.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getConfig, TEST_CONFIG } from '../../config.js';

describe('getConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('loads default values when env vars are missing', () => {
    delete process.env.GEMINI_STUB;
    delete process.env.VISION_STUB;
    delete process.env.MAPS_STUB;

    const config = getConfig();
    expect(config.GEMINI_STUB).toBe(false);
    expect(config.VISION_STUB).toBe(false);
    expect(config.MAPS_STUB).toBe(false);
  });

  it('correctly parses set variables', () => {
    process.env.GEMINI_STUB = 'true';
    process.env.PORT = '9000';

    const config = getConfig();
    expect(config.GEMINI_STUB).toBe(true);
    expect(config.PORT).toBe(9000);
  });
});

describe('TEST_CONFIG', () => {
  it('has testing mode stubs enabled by default', () => {
    expect(TEST_CONFIG.GEMINI_STUB).toBe(true);
    expect(TEST_CONFIG.VISION_STUB).toBe(true);
    expect(TEST_CONFIG.LOG_LEVEL).toBe('error');
  });
});
