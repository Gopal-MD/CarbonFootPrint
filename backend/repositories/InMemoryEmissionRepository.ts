/**
 * @fileoverview In-memory implementation of IEmissionRepository.
 *
 * Used in test suites to prevent network and mock pollution.
 *
 * @module repositories/InMemoryEmissionRepository
 */

import type { EmissionRecord, EmissionCategory } from '../types/eco_types.js';
import type { IEmissionRepository } from './IEmissionRepository.js';

export class InMemoryEmissionRepository implements IEmissionRepository {
  private store = new Map<string, EmissionRecord[]>();

  /**
   * Add a new emission record.
   */
  add(userId: string, record: Omit<EmissionRecord, 'id'>): Promise<{ id: string }> {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const fullRecord: EmissionRecord = {
      ...record,
      id,
      userId,
      createdAt: new Date().toISOString(),
    };

    if (!this.store.has(userId)) {
      this.store.set(userId, []);
    }
    this.store.get(userId)!.push(fullRecord);

    return Promise.resolve({ id });
  }

  /**
   * Retrieve records.
   */
  getRecords(
    userId: string,
    options: { category?: EmissionCategory; limit?: number } = {}
  ): Promise<EmissionRecord[]> {
    let list = this.store.get(userId) || [];
    if (options.category) {
      list = list.filter((r) => r.category === options.category);
    }
    const sorted = [...list]
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, options.limit ?? 20);
    return Promise.resolve(sorted);
  }

  /**
   * Delete a record.
   */
  delete(userId: string, recordId: string): Promise<void> {
    const list = this.store.get(userId);
    if (list) {
      const index = list.findIndex((r) => r.id === recordId);
      if (index !== -1) {
        list.splice(index, 1);
      }
    }
    return Promise.resolve();
  }

  /**
   * Clear all internal data.
   */
  clear(): void {
    this.store.clear();
  }
}
