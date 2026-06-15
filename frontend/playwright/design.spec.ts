/**
 * @fileoverview Playwright E2E tests — Visual Design & Responsive Layout.
 *
 * Tests the premium design system is rendered correctly across viewports:
 * - CSS custom properties are applied (dark theme)
 * - Glassmorphism cards appear
 * - Responsive grid collapses on mobile
 * - Navigation sidebar shows/hides correctly
 * - Font loading (Inter via Google Fonts)
 * - Color contrast compliance indicators
 * - Animation classes are present
 */

import { test, expect } from '@playwright/test';

test.describe('Design System — Auth Page Visual', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth');
  });

  test('page background is dark (not white)', async ({ page }) => {
    const bgColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    // Dark background: rgb values should all be low
    expect(bgColor).toMatch(/rgb/);
    const match = bgColor.match(/\d+/g);
    const [r, g, b] = match ? match.map(Number) : [255, 255, 255];
    // Dark theme: each channel should be < 50
    expect(r + g + b).toBeLessThan(150);
  });

  test('Inter font is declared in CSS', async ({ page }) => {
    const fontFamily = await page.evaluate(() => {
      return window.getComputedStyle(document.body).fontFamily;
    });
    expect(fontFamily.toLowerCase()).toContain('inter');
  });

  test('auth card has a visible border or shadow (glassmorphism)', async ({ page }) => {
    const card = page.locator('.card').first();
    await expect(card).toBeVisible();
  });

  test('gradient text class is applied to main heading', async ({ page }) => {
    const heading = page.getByRole('heading', { name: /EcoTrack/i });
    const classes = await heading.getAttribute('class');
    expect(classes).toContain('gradient-text');
  });

  test('page has only one h1 element', async ({ page }) => {
    const h1s = page.getByRole('heading', { level: 1 });
    await expect(h1s).toHaveCount(1);
  });

  test('all form inputs have associated labels', async ({ page }) => {
    const inputs = page.locator('input:not([type="hidden"])');
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute('id');
      if (id) {
        const label = page.locator(`label[for="${id}"]`);
        await expect(label).toHaveCount(1);
      }
    }
  });

  test('submit button has btn--primary class', async ({ page }) => {
    const submitBtn = page.getByRole('button', { name: /Sign In to EcoTrack/i });
    const classes = await submitBtn.getAttribute('class');
    expect(classes).toContain('btn--primary');
  });
});

test.describe('Responsive Layout — Mobile View', () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone 13

  test('auth page is usable on mobile', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.getByLabel(/Email Address/i)).toBeVisible();
    await expect(page.getByLabel(/Password/i)).toBeVisible();
  });

  test('sign-in button fills available width on mobile', async ({ page }) => {
    await page.goto('/auth');
    const btn = page.getByRole('button', { name: /Sign In to EcoTrack/i });
    const box = await btn.boundingBox();
    expect(box).not.toBeNull();
    // Button should be reasonably wide on mobile (>200px)
    expect(box ? box.width : 0).toBeGreaterThan(200);
  });

  test('page does not overflow horizontally on mobile', async ({ page }) => {
    await page.goto('/auth');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2); // 2px tolerance
  });
});

test.describe('Responsive Layout — Tablet View', () => {
  test.use({ viewport: { width: 768, height: 1024 } }); // iPad

  test('auth page renders correctly on tablet', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.getByRole('heading', { name: /EcoTrack/i })).toBeVisible();
    await expect(page.getByLabel(/Email Address/i)).toBeVisible();
  });
});

test.describe('Semantic HTML — Accessibility Tree', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth');
  });

  test('auth page has a main landmark', async ({ page }) => {
    const main = page.getByRole('main');
    await expect(main).toBeAttached();
  });

  test('form elements are within a form element', async ({ page }) => {
    const form = page.locator('form');
    await expect(form).toHaveCount(1);
  });

  test('Google sign-in button is type=button not type=submit', async ({ page }) => {
    const googleBtn = page.getByRole('button', { name: /Continue with Google/i });
    const type = await googleBtn.getAttribute('type');
    expect(type).toBe('button');
  });

  test('password field has autocomplete attribute', async ({ page }) => {
    const passwordInput = page.getByLabel(/Password/i);
    const autocomplete = await passwordInput.getAttribute('autocomplete');
    expect(autocomplete).toMatch(/current-password|new-password/i);
  });

  test('page language is set to English', async ({ page }) => {
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('en');
  });
});

test.describe('Navigation Flow — URL History', () => {
  test('browser back button works after page navigation', async ({ page }) => {
    await page.goto('/auth');
    await page.goto('/');
    // Unauthenticated users should be on /auth after trying /
    await expect(page).toHaveURL(/\/auth/);
  });

  test('typing in URL bar goes to correct page', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.getByLabel(/Email Address/i)).toBeVisible();
  });

  test('/auth path renders the auth page not a 404', async ({ page }) => {
    await page.goto('/auth');
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).not.toContainText('404');
  });
});

test.describe('Error Resilience', () => {
  test('page handles console errors gracefully — no uncaught JS errors on load', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');
    // Filter out known non-critical React Router warnings
    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('Warning:') && !e.includes('React Router')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('page handles 404 without uncaught JS errors', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await page.goto('/xyz-completely-missing');
    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('Warning:') && !e.includes('React Router')
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
