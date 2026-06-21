/**
 * @fileoverview Firestore implementation of IEmissionRepository.
 *
 * Production implementation storing emission records under `users/{userId}/emissions`.
 *
 * @module repositories/FirestoreEmissionRepository
 */

import { BaseDB } from '../services/BaseDB.js';
import type { EmissionRecord, EmissionCategory, FirestoreFilter } from '../types/eco_types.js';
import type { IEmissionRepository } from './IEmissionRepository.js';

export class FirestoreEmissionRepository extends BaseDB implements IEmissionRepository {
  /**
   * Persist a new emission record to Firestore.
   */
  async add(userId: string, record: Omit<EmissionRecord, 'id'>): Promise<{ id: string }> {
    return this.addDoc<EmissionRecord>(`users/${userId}/emissions`, record);
  }

  /**
   * Retrieve emissions for a user, sorted descending by date.
   */
  async getRecords(
    userId: string,
    options: { category?: EmissionCategory; limit?: number } = {}
  ): Promise<EmissionRecord[]> {
    const filters: FirestoreFilter[] = [];
    if (options.category) {
      filters.push(['category', '==', options.category]);
    }
    return this.queryCollection<EmissionRecord>(`users/${userId}/emissions`, filters, {
      orderBy: 'createdAt',
      orderDirection: 'desc',
      limit: options.limit ?? 20,
    });
  }

  /**
   * Delete an emission record from Firestore.
   */
  async delete(userId: string, recordId: string): Promise<void> {
    await this.deleteDoc(`users/${userId}/emissions`, recordId);
  }
}
