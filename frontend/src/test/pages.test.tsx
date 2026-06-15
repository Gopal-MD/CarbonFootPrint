/**
 * @fileoverview Component tests for CommutePage, ScanPage, and InsightsPage.
 *
 * Tests cover:
 * - Rendering without errors
 * - Form validation messages
 * - Travel mode selection rendering
 * - File drop zone rendering (ScanPage)
 * - Slider and select rendering (InsightsPage)
 * - Accessible attributes (aria, roles, labels)
 * - Navigation links presence
 *
 * Stubs are enabled via GEMINI_STUB=true / MAPS_STUB=true so no real
 * Google APIs are called during the test run.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// ── Shared mocks ─────────────────────────────────────────────────────────────
const mockGetIdToken = vi.fn().mockResolvedValue('mock-id-token');
const mockUser = {
  uid: 'test-uid-123',
  displayName: 'Test User',
  email: 'test@example.com',
  getIdToken: mockGetIdToken,
};

// Mock AuthContext so pages can access useAuth()
vi.mock('@context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock fetch globally
const mockFetch = vi.fn();
(global as any).fetch = mockFetch;

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

// Mock URL.createObjectURL / revokeObjectURL
URL.createObjectURL = vi.fn(() => 'blob:mock-url');
URL.revokeObjectURL = vi.fn();

// ── Helper: wrap with router ──────────────────────────────────────────────────
const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

// ════════════════════════════════════════════════════════════════════════════
// CommutePage Tests
// ════════════════════════════════════════════════════════════════════════════
describe('CommutePage', () => {
  let CommutePage: React.ComponentType<any>;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockGetIdToken.mockResolvedValue('mock-id-token');
    const mod = await import('@pages/CommutePage');
    CommutePage = mod.default;
  });

  it('renders the page heading', () => {
    renderWithRouter(<CommutePage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Commute Carbon Tracker');
  });

  it('renders origin and destination inputs', () => {
    renderWithRouter(<CommutePage />);
    expect(screen.getByLabelText(/Origin Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Destination Address/i)).toBeInTheDocument();
  });

  it('renders all 4 travel mode radio buttons', () => {
    renderWithRouter(<CommutePage />);
    expect(screen.getByDisplayValue('DRIVING')).toBeInTheDocument();
    expect(screen.getByDisplayValue('TRANSIT')).toBeInTheDocument();
    expect(screen.getByDisplayValue('BICYCLING')).toBeInTheDocument();
    expect(screen.getByDisplayValue('WALKING')).toBeInTheDocument();
  });

  it('DRIVING is selected by default', () => {
    renderWithRouter(<CommutePage />);
    expect(screen.getByDisplayValue('DRIVING')).toBeChecked();
    expect(screen.getByDisplayValue('TRANSIT')).not.toBeChecked();
  });

  it('can switch travel mode via radio button', async () => {
    renderWithRouter(<CommutePage />);
    const transitRadio = screen.getByDisplayValue('TRANSIT');
    await userEvent.click(transitRadio);
    expect(transitRadio).toBeChecked();
    expect(screen.getByDisplayValue('DRIVING')).not.toBeChecked();
  });

  it('shows validation error when fields are empty and form submitted', async () => {
    renderWithRouter(<CommutePage />);
    const calculateBtn = screen.getByRole('button', { name: /Calculate Emissions/i });
    await userEvent.click(calculateBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/enter both origin and destination/i);
    });
  });

  it('shows API error message on Maps calculation failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, message: 'Google Maps Directions failed' }),
    });

    renderWithRouter(<CommutePage />);

    await userEvent.type(screen.getByLabelText(/Origin Address/i), 'Start Point');
    await userEvent.type(screen.getByLabelText(/Destination Address/i), 'End Point');

    const calculateBtn = screen.getByRole('button', { name: /Calculate Emissions/i });
    await userEvent.click(calculateBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Google Maps Directions failed/i);
    });
  });

  it('shows emission calculation result on successful response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          distanceKm: 15.6,
          durationMinutes: 24,
          kgCO2e: 2.659,
          travelMode: 'DRIVING',
          originAddress: 'Mocked Origin, NY',
          destinationAddress: 'Mocked Destination, NY',
        },
      }),
    });

    renderWithRouter(<CommutePage />);

    await userEvent.type(screen.getByLabelText(/Origin Address/i), '123 St');
    await userEvent.type(screen.getByLabelText(/Destination Address/i), '456 Ave');
    await userEvent.click(screen.getByRole('button', { name: /Calculate Emissions/i }));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Commute emission calculation results/i })).toBeInTheDocument();
      expect(screen.getByText('15.6')).toBeInTheDocument();
      expect(screen.getByText('24')).toBeInTheDocument();
      expect(screen.getByText('2.659')).toBeInTheDocument();
    });
  });

  it('renders "Back to Dashboard" navigation link', () => {
    renderWithRouter(<CommutePage />);
    expect(screen.getByRole('link', { name: /Back to Dashboard/i })).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// ScanPage Tests
// ════════════════════════════════════════════════════════════════════════════
describe('ScanPage', () => {
  let ScanPage: React.ComponentType<any>;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockGetIdToken.mockResolvedValue('mock-id-token');
    const mod = await import('@pages/ScanPage');
    ScanPage = mod.default;
  });

  it('renders the page heading', () => {
    renderWithRouter(<ScanPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Utility Bill Scanner');
  });

  it('renders drop zone with correct aria attributes', () => {
    renderWithRouter(<ScanPage />);
    const dropzone = screen.getByRole('button', { name: /Drop zone/i });
    expect(dropzone).toBeInTheDocument();
    expect(dropzone).toHaveAttribute('aria-describedby', 'file-requirements');
  });

  it('renders "Back to Dashboard" navigation link', () => {
    renderWithRouter(<ScanPage />);
    expect(screen.getByRole('link', { name: /Back to Dashboard/i })).toBeInTheDocument();
  });

  it('shows file preview when a valid image file is selected', async () => {
    renderWithRouter(<ScanPage />);
    const fileInput = document.querySelector('input[type="file"]')!;
    const file = new File(['fake-image-data'], 'bill.jpg', { type: 'image/jpeg' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('bill.jpg')).toBeInTheDocument();
    });
  });

  it('shows error for oversized file', async () => {
    renderWithRouter(<ScanPage />);
    const fileInput = document.querySelector('input[type="file"]')!;

    // Create a fake 11MB file
    const largeContent = new Uint8Array(11 * 1024 * 1024);
    const file = new File([largeContent], 'large.jpg', { type: 'image/jpeg' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/File too large/i);
    });
  });

  it('shows error for unsupported file type', async () => {
    renderWithRouter(<ScanPage />);
    const fileInput = document.querySelector('input[type="file"]')!;
    const file = new File(['data'], 'document.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Unsupported file type/i);
    });
  });

  it('shows scan result after successful API response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          kWhExtracted: 312,
          billMonth: 'January 2025',
          provider: 'Pacific Gas & Electric',
          kgCO2e: 66.25,
          rawText: 'Total: 312 kWh',
        },
      }),
    });

    renderWithRouter(<ScanPage />);
    const fileInput = document.querySelector('input[type="file"]')!;
    const file = new File(['img-data'], 'bill.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => screen.getByText('bill.jpg'));
    const scanBtn = screen.getByRole('button', { name: /Scan with Gemini AI/i });
    await userEvent.click(scanBtn);

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Scan result/i })).toBeInTheDocument();
      expect(screen.getByText('312 kWh')).toBeInTheDocument();
    });
  });

  it('calls fetch with authorization header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { kWhExtracted: 100, kgCO2e: 21 },
      }),
    });

    renderWithRouter(<ScanPage />);
    const fileInput = document.querySelector('input[type="file"]')!;
    const file = new File(['img-data'], 'bill.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => screen.getByText('bill.jpg'));
    await userEvent.click(screen.getByRole('button', { name: /Scan with Gemini AI/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/scan'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-id-token',
          }),
        })
      );
    });
  });

  it('shows error message on scan API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, message: 'Gemini Vision unavailable' }),
    });

    renderWithRouter(<ScanPage />);
    const fileInput = document.querySelector('input[type="file"]')!;
    const file = new File(['img-data'], 'bill.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => screen.getByText('bill.png'));
    await userEvent.click(screen.getByRole('button', { name: /Scan with Gemini AI/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Gemini Vision unavailable/i);
    });
  });

  it('remove button clears selected file', async () => {
    renderWithRouter(<ScanPage />);
    const fileInput = document.querySelector('input[type="file"]')!;
    const file = new File(['data'], 'bill.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => screen.getByText('bill.jpg'));
    await userEvent.click(screen.getByRole('button', { name: /Remove/i }));

    await waitFor(() => {
      expect(screen.queryByText('bill.jpg')).not.toBeInTheDocument();
      // Drop zone is back
      expect(screen.getByRole('button', { name: /Drop zone/i })).toBeInTheDocument();
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// InsightsPage Tests
// ════════════════════════════════════════════════════════════════════════════
describe('InsightsPage', () => {
  let InsightsPage: React.ComponentType<any>;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockGetIdToken.mockResolvedValue('mock-id-token');
    const mod = await import('@pages/InsightsPage');
    InsightsPage = mod.default;
  });

  it('renders the page heading', () => {
    renderWithRouter(<InsightsPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('AI Eco Insights');
  });

  it('renders all three sliders', () => {
    renderWithRouter(<InsightsPage />);
    expect(screen.getByLabelText(/Total Monthly Footprint/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Commute Emissions/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Utility \/ Energy Emissions/i)).toBeInTheDocument();
  });

  it('renders travel mode select with all options', () => {
    renderWithRouter(<InsightsPage />);
    const select = screen.getByLabelText(/Primary Travel Mode/i);
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Driving/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Transit/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Cycling/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Walking/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Mixed/i })).toBeInTheDocument();
  });

  it('renders Generate AI Insights button', () => {
    renderWithRouter(<InsightsPage />);
    expect(screen.getByText(/✨ Generate AI Insights/i)).toBeInTheDocument();
  });

  it('renders Gemini-powered info section before first generation', () => {
    renderWithRouter(<InsightsPage />);
    expect(screen.getByText(/Powered by Gemini 2.0 Flash/i)).toBeInTheDocument();
  });

  it('renders "Back to Dashboard" link', () => {
    renderWithRouter(<InsightsPage />);
    expect(screen.getByRole('link', { name: /Back to Dashboard/i })).toBeInTheDocument();
  });

  it('calls fetch on generate button click', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          insightText: '## Your Eco Report\n- Switch to transit\n- Use LED bulbs',
          cached: false,
          generatedAt: new Date().toISOString(),
        },
      }),
    });

    renderWithRouter(<InsightsPage />);
    const generateBtn = screen.getByRole('button', { name: /Generate personalized eco insights/i });
    await userEvent.click(generateBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/insights'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-id-token',
          }),
        })
      );
    });
  });

  it('renders AI insight result with markdown after successful response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          insightText: '## Your Eco Report\n**Switch to transit** to reduce emissions.',
          cached: false,
          generatedAt: new Date().toISOString(),
        },
      }),
    });

    renderWithRouter(<InsightsPage />);
    await userEvent.click(screen.getByRole('button', { name: /Generate personalized eco insights/i }));

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /AI-generated eco insights/i })).toBeInTheDocument();
      expect(screen.getByText('Your Eco Report')).toBeInTheDocument();
    });
  });

  it('shows cached badge when response is cached', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          insightText: 'Some insight text here.',
          cached: true,
          generatedAt: new Date().toISOString(),
        },
      }),
    });

    renderWithRouter(<InsightsPage />);
    await userEvent.click(screen.getByRole('button', { name: /Generate personalized eco insights/i }));

    await waitFor(() => {
      expect(screen.getByText(/⚡ Cached/i)).toBeInTheDocument();
    });
  });

  it('shows error alert on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, message: 'Gemini API quota exceeded' }),
    });

    renderWithRouter(<InsightsPage />);
    await userEvent.click(screen.getByRole('button', { name: /Generate personalized eco insights/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Gemini API quota exceeded/i);
    });
  });

  it('copy button triggers clipboard write', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          insightText: 'Copy this text.',
          cached: false,
          generatedAt: new Date().toISOString(),
        },
      }),
    });

    renderWithRouter(<InsightsPage />);
    await userEvent.click(screen.getByRole('button', { name: /Generate personalized eco insights/i }));

    await waitFor(() => screen.getByRole('button', { name: /Copy insights to clipboard/i }));
    await userEvent.click(screen.getByRole('button', { name: /Copy insights to clipboard/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Copy this text.');
    });
  });

  it('slider updates displayed value when changed', async () => {
    renderWithRouter(<InsightsPage />);
    const monthlySlider = screen.getByLabelText(/Total Monthly Footprint/i);

    // Default value is 142.5
    expect(monthlySlider).toHaveValue('142.5');

    // Simulate slider change
    fireEvent.change(monthlySlider, { target: { value: '200' } });
    expect(monthlySlider).toHaveValue('200');
  });

  it('travel mode select can be changed', async () => {
    renderWithRouter(<InsightsPage />);
    const select = screen.getByLabelText(/Primary Travel Mode/i);
    await userEvent.selectOptions(select, 'TRANSIT');
    expect(select).toHaveValue('TRANSIT');
  });
});

describe('DashboardPage', () => {
  let DashboardPage: React.ComponentType<any>;

  beforeEach(async () => {
    const mod = await import('@pages/DashboardPage');
    DashboardPage = mod.default;
  });

  it('renders the page heading and comparison banner', () => {
    renderWithRouter(<DashboardPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Welcome back/i);
    expect(screen.getByText(/below the global average/i)).toBeInTheDocument();
  });

  it('renders the Carbon Reduction Streak card with stats', () => {
    renderWithRouter(<DashboardPage />);
    expect(screen.getByRole('region', { name: /Gamification and Streaks/i })).toBeInTheDocument();
    expect(screen.getByText(/Carbon Reduction Streak/i)).toBeInTheDocument();
    expect(screen.getByText(/5 days/i)).toBeInTheDocument();
    expect(screen.getByText(/12 days/i)).toBeInTheDocument();
    expect(screen.getByText(/22.4 kg/i)).toBeInTheDocument();
  });
});
