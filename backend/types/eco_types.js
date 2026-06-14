/**
 * @fileoverview Core data type definitions for the Carbon Footprint Platform.
 * All types are defined as JSDoc @typedef for use across backend modules.
 * These serve as the shared contract between routes, services, and the database.
 *
 * @module types/eco_types
 */

// ─────────────────────────────────────────────────────────────────────────────
// USER DOMAIN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A registered user profile, stored in Firestore under `users/{uid}`.
 *
 * @typedef {object} UserProfile
 * @property {string} uid - Firebase Authentication UID (document ID).
 * @property {string} email - User's email address.
 * @property {string|null} displayName - Optional display name.
 * @property {string|null} photoURL - Optional avatar URL.
 * @property {number} monthlyGoalKg - Monthly CO₂e reduction goal in kg.
 * @property {string} createdAt - ISO 8601 creation timestamp.
 * @property {string} updatedAt - ISO 8601 last-updated timestamp.
 */

// ─────────────────────────────────────────────────────────────────────────────
// EMISSION RECORDS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Emission categories supported by the platform.
 *
 * @typedef {'commute'|'utility'|'food'|'other'} EmissionCategory
 */

/**
 * A single carbon emission record, stored in Firestore under
 * `users/{uid}/emissions/{recordId}`.
 *
 * @typedef {object} EmissionRecord
 * @property {string} id - Auto-generated Firestore document ID.
 * @property {string} userId - The owning user's Firebase UID.
 * @property {EmissionCategory} category - Source category of the emission.
 * @property {number} kgCO2e - Emission quantity in kg CO₂ equivalent.
 * @property {string} date - ISO 8601 date string (YYYY-MM-DD) for the emission event.
 * @property {string} createdAt - ISO 8601 creation timestamp.
 * @property {EmissionMetadata} metadata - Category-specific metadata.
 */

/**
 * Category-specific metadata attached to an EmissionRecord.
 * Fields are optional and vary by category.
 *
 * @typedef {object} EmissionMetadata
 * @property {string} [origin] - Commute: start address.
 * @property {string} [destination] - Commute: end address.
 * @property {string} [travelMode] - Commute: DRIVING | TRANSIT | WALKING | BICYCLING.
 * @property {number} [distanceKm] - Commute: distance in kilometers.
 * @property {number} [kWh] - Utility: energy consumption in kWh.
 * @property {string} [billProvider] - Utility: energy provider name extracted from bill.
 * @property {string} [billPeriod] - Utility: billing period (e.g., "July 2025").
 * @property {number} [confidence] - Utility: Vision API extraction confidence (0–1).
 */

// ─────────────────────────────────────────────────────────────────────────────
// COMMUTE INPUTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valid Google Maps travel mode strings.
 *
 * @typedef {'DRIVING'|'TRANSIT'|'WALKING'|'BICYCLING'} TravelMode
 */

/**
 * Input payload for the commute carbon calculation endpoint.
 *
 * @typedef {object} CommuteInput
 * @property {string} origin - Starting address or lat/lng string.
 * @property {string} destination - Ending address or lat/lng string.
 * @property {TravelMode} travelMode - Mode of transportation.
 * @property {number} [trips=1] - Number of one-way trips (2 for round trip).
 */

/**
 * Response payload from the commute calculation endpoint.
 *
 * @typedef {object} CommuteResult
 * @property {number} distanceKm - Calculated distance in kilometers.
 * @property {number} durationMinutes - Estimated travel time in minutes.
 * @property {number} kgCO2e - Carbon emissions in kg CO₂ equivalent.
 * @property {TravelMode} travelMode - The travel mode used for calculation.
 * @property {string} originAddress - Resolved origin address from Maps API.
 * @property {string} destinationAddress - Resolved destination address from Maps API.
 */

// ─────────────────────────────────────────────────────────────────────────────
// BILL SCANNING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of scanning a utility bill image with Gemini Vision.
 *
 * @typedef {object} BillScanResult
 * @property {number|null} kWhExtracted - Energy consumption in kWh, or null if not found.
 * @property {number} kgCO2e - Calculated CO₂ emissions from the extracted kWh.
 * @property {string|null} billProvider - Energy provider name, or null if not found.
 * @property {string|null} billPeriod - Billing period string, or null if not found.
 * @property {number} confidence - Extraction confidence score (0–1).
 * @property {string} rawSummary - Raw summary text from Gemini Vision response.
 * @property {boolean} cached - Whether this result was served from cache.
 */

// ─────────────────────────────────────────────────────────────────────────────
// AI INSIGHTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A personalized eco-insight generated by the Gemini AI model.
 * Stored in Firestore under `users/{uid}/insights/{insightId}`.
 *
 * @typedef {object} EcoInsight
 * @property {string} id - Auto-generated Firestore document ID.
 * @property {string} userId - The owning user's Firebase UID.
 * @property {string} prompt - The prompt sent to Gemini (for audit/debugging).
 * @property {string} responseText - The generated insight markdown text.
 * @property {EcoInsightTip[]} tips - Parsed actionable tips from the response.
 * @property {string} generatedAt - ISO 8601 timestamp when the insight was created.
 * @property {boolean} cached - Whether this insight was served from the response cache.
 */

/**
 * A single actionable tip extracted from an EcoInsight.
 *
 * @typedef {object} EcoInsightTip
 * @property {string} title - Short title of the tip.
 * @property {string} description - Detailed description of the action.
 * @property {EmissionCategory} category - Which emission category this tip addresses.
 * @property {number} estimatedSavingKg - Estimated monthly CO₂e saving in kg if tip is followed.
 * @property {'easy'|'medium'|'hard'} difficulty - Implementation difficulty rating.
 */

// ─────────────────────────────────────────────────────────────────────────────
// API REQUEST / RESPONSE ENVELOPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Standard success response envelope for all API endpoints.
 *
 * @typedef {object} ApiSuccessResponse
 * @property {true} success - Always true for success responses.
 * @property {*} data - The response payload.
 * @property {string} [message] - Optional human-readable message.
 * @property {number} [statusCode] - HTTP status code (defaults to 200).
 */

/**
 * Standard error response envelope for all API endpoints.
 *
 * @typedef {object} ApiErrorResponse
 * @property {false} success - Always false for error responses.
 * @property {string} error - Error type identifier (e.g., "VALIDATION_ERROR").
 * @property {string} message - Human-readable error description.
 * @property {Array<{field: string, message: string}>} [details] - Field-level validation errors.
 * @property {number} statusCode - HTTP status code.
 */

/**
 * Retry configuration for the withRetry utility.
 *
 * @typedef {object} RetryConfig
 * @property {number} [maxAttempts=3] - Maximum number of total attempts.
 * @property {number} [initialDelayMs=500] - Initial backoff delay in milliseconds.
 * @property {number} [backoffFactor=2] - Exponential backoff multiplier.
 * @property {number} [maxDelayMs=10000] - Maximum delay cap in milliseconds.
 * @property {Function} [shouldRetry] - Optional function(error) => boolean to customize retry logic.
 */

export {};
