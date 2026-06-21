/**
 * @fileoverview Repositories index export.
 *
 * Provides swappable database access patterns.
 *
 * @module repositories/index
 */

import { FirestoreEmissionRepository } from './FirestoreEmissionRepository.js';
import type { IEmissionRepository } from './IEmissionRepository.js';

export type { IEmissionRepository } from './IEmissionRepository.js';
export { FirestoreEmissionRepository } from './FirestoreEmissionRepository.js';
export { InMemoryEmissionRepository } from './InMemoryEmissionRepository.js';

let _repoInstance: IEmissionRepository | null = null;

/**
 * Returns the singleton emissions repository (uses Firestore in production).
 *
 * @returns IEmissionRepository instance.
 */
export function getEmissionsRepository(): IEmissionRepository {
  if (!_repoInstance) {
    _repoInstance = new FirestoreEmissionRepository();
  }
  return _repoInstance;
}
