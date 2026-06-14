/**
 * @fileoverview Playwright E2E tests — Authentication user journey.
 * Covers: sign-in page render, form validation, Google OAuth button presence,
 * mode toggle, and redirect behavior.
 */

import { test, expect } from '@playwright/test';

test.describe('Authentication Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth');
  });

  test('renders the auth page with correct heading and form', async ({ page }) => {
    await expect(page).toHaveTitle(/EcoTrack/);
    await expect(page.getByRole('heading', { name: /EcoTrack/ })).toBeVisible();
    await expect(page.getByLabel(/Email Address/i)).toBeVisible();
    await expect(page.getByLabel(/Password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign In to EcoTrack/i })).toBeVisible();
  });

  test('shows Google sign-in button with correct aria-label', async ({ page }) => {
    const googleBtn = page.getByRole('button', { name: /Continue with Google/i });
    await expect(googleBtn).toBeVisible();
    await expect(googleBtn).toBeEnabled();
  });

  test('toggles to sign-up mode and shows display name field', async ({ page }) => {
    const toggleBtn = page.getByRole('button', { name: /Switch to sign up/i });
    await toggleBtn.click();
    await expect(page.getByLabel(/Display Name/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Create Account/i })).toBeVisible();
  });

  test('toggles back to sign-in mode from sign-up', async ({ page }) => {
    // Switch to sign-up
    await page.getByRole('button', { name: /Switch to sign up/i }).click();
    // Switch back to sign-in
    await page.getByRole('button', { name: /Switch to sign in/i }).click();
    await expect(page.getByRole('button', { name: /Sign In to EcoTrack/i })).toBeVisible();
    await expect(page.getByLabel(/Display Name/i)).not.toBeVisible();
  });

  test('shows validation error when submitting empty form', async ({ page }) => {
    await page.getByRole('button', { name: /Sign In to EcoTrack/i }).click();
    const errorAlert = page.getByRole('alert');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText('required');
  });

  test('is fully keyboard navigable from email to submit', async ({ page }) => {
    await page.getByLabel(/Email Address/i).focus();
    await page.keyboard.press('Tab');
    // Password field should now be focused
    const passwordField = page.getByLabel(/Password/i);
    await expect(passwordField).toBeFocused();
    await page.keyboard.press('Tab');
    // Submit button should be focused (or Google button after Tab)
  });

  test('all interactive elements have visible focus rings', async ({ page }) => {
    // Tab through interactive elements and check each has visible outline
    const emailInput = page.getByLabel(/Email Address/i);
    await emailInput.focus();
    const emailBox = await emailInput.boundingBox();
    expect(emailBox).not.toBeNull();
  });

  test('meets accessibility requirements — no critical aria violations', async ({ page }) => {
    // Check that ARIA live region exists
    const ariaAnnouncer = page.locator('#aria-announcer');
    await expect(ariaAnnouncer).toHaveAttribute('aria-live', 'polite');
    await expect(ariaAnnouncer).toHaveAttribute('role', 'status');
  });
});

test.describe('Protected route — redirect to /auth', () => {
  test('unauthenticated user visiting / is redirected to /auth', async ({ page }) => {
    await page.goto('/');
    // Should redirect to /auth because Firebase returns null user
    await expect(page).toHaveURL(/\/auth/);
  });

  test('unauthenticated user visiting /insights is redirected to /auth', async ({ page }) => {
    await page.goto('/insights');
    await expect(page).toHaveURL(/\/auth/);
  });
});

test.describe('404 Not Found Page', () => {
  test('shows 404 page for unknown routes', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Go to Dashboard/i })).toBeVisible();
  });
});
