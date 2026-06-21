/**
 * @fileoverview DTO barrel — re-exports all request and response DTOs.
 *
 * Import all DTO types from this single entry point:
 *
 * ```typescript
 * import type { CommuteRequestDto, CommuteResponseDto } from '../dto/index.js';
 * ```
 *
 * @module dto
 */

export type {
  CommuteRequestDto,
  ScanRequestDto,
  InsightsRequestDto,
  EmissionRecordRequestDto,
  AuthVerifyRequestDto,
} from './requests.js';

export type {
  CommuteResponseDto,
  ScanResponseDto,
  InsightsResponseDto,
  InsightsTipDto,
  EmissionRecordResponseDto,
  EmissionsListResponseDto,
  EmissionSaveResponseDto,
  AuthVerifyResponseDto,
  HealthResponseDto,
} from './responses.js';
