/**
 * @fileoverview Repository interface for emission records.
 *
 * Decouples API handlers from persistence layers (Firestore).
 * Swappable with in-memory implementations for mock-free unit tests.
 *
 * @module repositories/IEmissionRepository
 */

import type { EmissionRecord, EmissionCategory } from '../types/eco_types.js';

export interface IEmissionRepository {
  /**
   * Persist a new emission record.
   *
   * @param userId - Firebase UID of the record owner.
   * @param record - Emission record to add.
   * @returns Added document ID.
   */
  add(
    userId: string,
    record: Omit<EmissionRecord, 'id'>
  ): Promise<{ id: string }>;

  /**
   * Retrieve records for a user with optional filters and limits.
   *
   * @param userId - Firebase UID of the record owner.
   * @param options - Pagination and category filtering options.
   * @returns Sorted emission records array.
   */
  getRecords(
    userId: string,
    options?: { category?: EmissionCategory; limit?: number }
  ): Promise<EmissionRecord[]>;

  /**
   * Delete an emission record.
   *
   * @param userId - Firebase UID of the record owner.
   * @param recordId - Document ID to delete.
   */
  delete(userId: string, recordId: string): Promise<void>;
}
