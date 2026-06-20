/**
 * @fileoverview EcoTrack platform constants with scientific citations.
 *
 * Every emission factor, rate limit, and benchmark constant is sourced from
 * peer-reviewed literature or authoritative government data. When science
 * updates, constants can be versioned here with new citations — no magic
 * numbers scattered across service files.
 *
 * @module constants
 */

// ── Global Carbon Benchmarks ───────────────────────────────────────────────────

/**
 * Average annual carbon footprint per capita globally (kg CO₂e/year).
 *
 * Source: IPCC AR6 Working Group III (2022) — Chapter 5, Table 5.1.
 * Reported range: 4,200–4,800 kg CO₂e. We use the midpoint (4,500 kg).
 *
 * @see https://www.ipcc.ch/report/ar6/wg3/
 */
export const GLOBAL_AVG_ANNUAL_KG_CO2E = 4_500;

/**
 * Sustainable per-capita carbon budget target for a 2 °C pathway (kg CO₂e/year).
 *
 * Source: IPCC SR1.5 (2018) — Summary for Policymakers, Table SPM.2.
 * Developed economies need to converge to ~2,300 kg CO₂e/capita by 2050.
 *
 * @see https://www.ipcc.ch/sr15/
 */
export const SUSTAINABLE_TARGET_ANNUAL_KG_CO2E = 2_300;

// ── Passenger Vehicle Emission Factors ────────────────────────────────────────

/**
 * Lifecycle emission factors per kilometre for passenger vehicles (kg CO₂e/km).
 *
 * Source: EPA (2024) — "Greenhouse Gas Emissions from a Typical Passenger Vehicle"
 * + ICCT (2023) — "A global comparison of the life-cycle greenhouse gas emissions
 * of combustion engine and electric passenger cars."
 *
 * These are well-to-wheel (WTW) values using the US average electricity grid mix.
 *
 * @see https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle
 * @see https://theicct.org/publication/icct-lcghg-2023-apr23/
 */
export const VEHICLE_EMISSION_FACTORS_KG_PER_KM = {
  /** Standard gasoline combustion engine. */
  PETROL:  0.120,
  /** Diesel combustion engine (~13% more fuel-efficient than petrol). */
  DIESEL:  0.105,
  /** Battery-electric vehicle (US grid average 2024). */
  EV:      0.040,
  /** Plug-in or conventional hybrid vehicle. */
  HYBRID:  0.060,
} as const;

/**
 * Default vehicle emission factor when fuel type is unspecified (kg CO₂e/km).
 * Uses the petrol average as the conservative baseline.
 */
export const DEFAULT_VEHICLE_KG_PER_KM = VEHICLE_EMISSION_FACTORS_KG_PER_KM.PETROL;

// ── Public Transit Emission Factors ───────────────────────────────────────────

/**
 * Average emission factors for public transit modes (kg CO₂e/passenger-km).
 *
 * Source: ICCT (2019) — "CO₂ emissions from cars: the facts."
 * Based on average occupancy rates (bus: 40%, rail: 30%).
 *
 * @see https://theicct.org/publication/co2-emissions-from-cars-the-facts/
 */
export const TRANSIT_EMISSION_FACTORS_KG_PER_KM = {
  BUS:     0.089,
  RAIL:    0.041,
  WALKING: 0.000,
  CYCLING: 0.000,
} as const;

// ── Electricity & Gas Emission Factors ────────────────────────────────────────

/**
 * US average electricity grid emission factor (kg CO₂e/kWh).
 *
 * Source: EPA eGRID 2023 — National Weighted Average CO₂ output emission rate.
 * This includes coal, natural gas, nuclear, hydro, wind, solar, and other sources.
 *
 * Regional variation: EU ~0.190 kg/kWh; Nordic ~0.050 kg/kWh; India ~0.710 kg/kWh.
 *
 * @see https://www.epa.gov/egrid
 */
export const ELECTRICITY_KG_PER_KWH = 0.233;

/**
 * Natural gas combustion emission factor (kg CO₂e/kWh of gas energy content).
 *
 * Source: UK DEFRA 2024 — "UK Government GHG Conversion Factors for Company Reporting."
 * Covers scope 1 direct combustion only (not upstream extraction/leakage).
 *
 * @see https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2024
 */
export const GAS_KG_PER_KWH = 0.205;

// ── Time Conversion Constants ──────────────────────────────────────────────────

/** Weeks in a calendar year. */
export const WEEKS_PER_YEAR = 52;

/** Months in a calendar year. */
export const MONTHS_PER_YEAR = 12;

/** Working days in a typical year (Mon–Fri, excluding 10 public holidays). */
export const WORKING_DAYS_PER_YEAR = 245;

// ── API Caching ────────────────────────────────────────────────────────────────

/**
 * TTL for Gemini AI response cache entries (milliseconds).
 *
 * Gemini API calls are expensive and non-deterministic for identical prompts.
 * One hour is aggressive enough to serve repeat requests cheaply, yet fresh
 * enough that users don't see stale insights from yesterday's data.
 */
export const AI_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Maximum number of entries in the in-memory AI response LRU cache. */
export const AI_CACHE_MAX_SIZE = 100;

// ── Rate Limiting ─────────────────────────────────────────────────────────────

/**
 * Maximum AI endpoint requests per user per 15-minute window.
 *
 * AI endpoints (Gemini Vision, Gemini Text) are expensive.
 * Keyed by Firebase UID to avoid NAT/VPN IP sharing issues.
 */
export const AI_RATE_LIMIT_PER_WINDOW = 10;

/** Rate limit window duration for AI endpoints (milliseconds). */
export const AI_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Maximum general API requests per IP per 15-minute window.
 * Applied to non-AI endpoints (commute, emissions CRUD, etc.).
 */
export const GENERAL_RATE_LIMIT_PER_WINDOW = 100;

/** Rate limit window duration for general endpoints (milliseconds). */
export const GENERAL_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// ── Input Validation ──────────────────────────────────────────────────────────

/** Maximum address string length accepted by the commute endpoint. */
export const MAX_ADDRESS_LENGTH = 500;

/** Maximum plausible single-trip emission value accepted by the emissions endpoint. */
export const MAX_EMISSION_KG_CO2E = 100_000;

/** Minimum valid kWh value for utility bill extraction. */
export const MIN_KWH_CONSUMPTION = 0;

/** Maximum plausible monthly kWh for a residential bill (very large household). */
export const MAX_KWH_MONTHLY = 10_000;
