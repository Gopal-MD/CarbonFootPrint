/**
 * @fileoverview BaseDB — Abstract Firestore database access layer.
 *
 * Provides a typed, reusable interface over Firebase Admin Firestore.
 * All application database logic MUST go through this class (or subclasses)
 * to ensure consistent error handling, logging, and testability.
 *
 * Design decisions:
 * - Generic methods (`getDoc<T>`, `addDoc<T>`) allow callers to specify the
 *   exact document shape — no `any` leaks across the boundary.
 * - All caught errors are narrowed from `unknown` before accessing `.message`.
 * - Timestamps are normalised to ISO strings at the deserialization layer.
 *
 * @module services/BaseDB
 */

import { initializeApp, getApps, getApp, cert, App } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp, Firestore } from 'firebase-admin/firestore';
import { createModuleLogger } from '../utils/logger.js';
import type { FirestoreFilter, QueryOptions } from '../types/eco_types.js';

const logger = createModuleLogger('BaseDB');

// ── Firebase Admin Initialization (singleton) ────────────────────────────────
/**
 * Initializes (or retrieves) the Firebase Admin App singleton.
 * Supports both JSON string (Cloud Run secrets) and file path credential styles.
 *
 * @returns Firebase Admin App instance.
 * @throws {Error} If FIREBASE_SERVICE_ACCOUNT_JSON is malformed JSON.
 */
function initializeFirebaseAdmin(): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set.');
  }

  let serviceAccount: object;
  try {
    serviceAccount = JSON.parse(serviceAccountJson) as object;
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON. ' +
        'Ensure the entire service account JSON is set as the environment variable value.'
    );
  }

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

let _db: Firestore | null = null;

/**
 * Lazily initializes and returns the Firestore instance.
 *
 * @returns Firestore instance.
 */
function getDb(): Firestore {
  if (!_db) {
    initializeFirebaseAdmin();
    _db = getFirestore();
    // Use Timestamps instead of Date objects for consistency
    _db.settings({ timestampsInSnapshots: true });
  }
  return _db;
}

// ── Error message helper ──────────────────────────────────────────────────────
/**
 * Safely extracts a string message from an unknown thrown value.
 *
 * @param error - Unknown thrown value from a catch block.
 * @returns Human-readable error message string.
 */
function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return JSON.stringify(error);
}

// ── BaseDB Class ──────────────────────────────────────────────────────────────
/**
 * Abstract base class for Firestore database operations.
 * Provides generic CRUD methods with consistent error handling and logging.
 * Extend this class in domain-specific service classes.
 */
export class BaseDB {
  constructor() {
    if (new.target === BaseDB) {
      throw new Error('BaseDB is abstract. Extend it instead of instantiating directly.');
    }
  }

  /**
   * Returns the Firestore instance.
   *
   * @protected
   */
  protected get db(): Firestore {
    return getDb();
  }

  /**
   * Retrieves a single document by path and returns it typed as T.
   *
   * @template T - Expected document shape.
   * @param collectionPath - Firestore collection path (e.g., 'users').
   * @param docId - Document ID.
   * @returns The document data with its ID typed as T, or null if not found.
   * @throws {Error} On Firestore read failure.
   *
   * @example
   * const record = await db.getDoc<EmissionRecord>('users/uid/emissions', 'rec123');
   */
  async getDoc<T extends object>(collectionPath: string, docId: string): Promise<(T & { id: string }) | null> {
    try {
      const ref = this.db.collection(collectionPath).doc(docId);
      const snap = await ref.get();

      if (!snap.exists) {
        logger.debug(`Document not found: ${collectionPath}/${docId}`);
        return null;
      }

      return { id: snap.id, ...this._deserialize(snap.data() ?? {}) } as T & { id: string };
    } catch (error: unknown) {
      const message = toErrorMessage(error);
      logger.error(`Failed to get document ${collectionPath}/${docId}`, { error: message });
      throw new Error(`Database read failed: ${message}`);
    }
  }

  /**
   * Creates or overwrites a document at the given path.
   *
   * @template T - Document data shape (must be a plain object).
   * @param collectionPath - Firestore collection path.
   * @param docId - Document ID.
   * @param data - Data to write. `createdAt` is automatically added if absent.
   * @returns The document ID.
   * @throws {Error} On Firestore write failure.
   */
  async setDoc<T extends object>(collectionPath: string, docId: string, data: T): Promise<{ id: string }> {
    try {
      const ref = this.db.collection(collectionPath).doc(docId);
      const payload = {
        ...data,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: (data as Record<string, unknown>).createdAt ?? FieldValue.serverTimestamp(),
      };

      await ref.set(payload);
      logger.debug(`Document set: ${collectionPath}/${docId}`);
      return { id: docId };
    } catch (error: unknown) {
      const message = toErrorMessage(error);
      logger.error(`Failed to set document ${collectionPath}/${docId}`, { error: message });
      throw new Error(`Database write failed: ${message}`);
    }
  }

  /**
   * Partially updates an existing document (merge semantics).
   *
   * @template T - Partial document shape.
   * @param collectionPath - Firestore collection path.
   * @param docId - Document ID.
   * @param data - Fields to update. Missing fields are preserved.
   * @returns The document ID.
   * @throws {Error} On Firestore update failure.
   */
  async updateDoc<T extends object>(collectionPath: string, docId: string, data: T): Promise<{ id: string }> {
    try {
      const ref = this.db.collection(collectionPath).doc(docId);
      await ref.update({ ...data, updatedAt: FieldValue.serverTimestamp() });
      logger.debug(`Document updated: ${collectionPath}/${docId}`);
      return { id: docId };
    } catch (error: unknown) {
      const message = toErrorMessage(error);
      logger.error(`Failed to update document ${collectionPath}/${docId}`, { error: message });
      throw new Error(`Database update failed: ${message}`);
    }
  }

  /**
   * Adds a new document to a collection with an auto-generated ID.
   *
   * @template T - Document data shape (must be a plain object).
   * @param collectionPath - Firestore collection path.
   * @param data - Data to write.
   * @returns The auto-generated document ID.
   * @throws {Error} On Firestore write failure.
   *
   * @example
   * const { id } = await db.addDoc<EmissionRecord>('users/uid/emissions', record);
   */
  async addDoc<T extends object>(collectionPath: string, data: T): Promise<{ id: string }> {
    try {
      const ref = this.db.collection(collectionPath);
      const payload = {
        ...data,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      const docRef = await ref.add(payload);
      logger.debug(`Document added to ${collectionPath}: ${docRef.id}`);
      return { id: docRef.id };
    } catch (error: unknown) {
      const message = toErrorMessage(error);
      logger.error(`Failed to add document to ${collectionPath}`, { error: message });
      throw new Error(`Database write failed: ${message}`);
    }
  }

  /**
   * Queries a collection with optional filters, ordering, and pagination.
   *
   * @template T - Expected document shape for each result.
   * @param collectionPath - Firestore collection path.
   * @param filters - Where clauses as typed tuples.
   * @param options - Query options (orderBy, limit).
   * @returns Array of typed document data objects with IDs.
   * @throws {Error} On Firestore query failure.
   */
  async queryCollection<T extends object>(
    collectionPath: string,
    filters: FirestoreFilter[] = [],
    options: QueryOptions = {}
  ): Promise<(T & { id: string })[]> {
    try {
      let query: FirebaseFirestore.Query = this.db.collection(collectionPath);

      for (const [field, op, value] of filters) {
        query = query.where(field, op, value);
      }

      if (options.orderBy) {
        query = query.orderBy(options.orderBy, options.orderDirection ?? 'desc');
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const snapshot = await query.get();

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...this._deserialize(doc.data()),
      })) as (T & { id: string })[];
    } catch (error: unknown) {
      const message = toErrorMessage(error);
      logger.error(`Failed to query collection ${collectionPath}`, { error: message });
      throw new Error(`Database query failed: ${message}`);
    }
  }

  /**
   * Deletes a document by path and ID.
   *
   * @param collectionPath - Firestore collection path.
   * @param docId - Document ID.
   * @returns Promise resolving when delete completes.
   * @throws {Error} On Firestore delete failure.
   */
  async deleteDoc(collectionPath: string, docId: string): Promise<void> {
    try {
      await this.db.collection(collectionPath).doc(docId).delete();
      logger.debug(`Document deleted: ${collectionPath}/${docId}`);
    } catch (error: unknown) {
      const message = toErrorMessage(error);
      logger.error(`Failed to delete document ${collectionPath}/${docId}`, { error: message });
      throw new Error(`Database delete failed: ${message}`);
    }
  }

  /**
   * Converts Firestore Timestamps to ISO strings in a document.
   * Ensures consistent serialization across the API boundary.
   *
   * @param data - Raw Firestore document data (Record<string, unknown>).
   * @returns Data with Timestamps converted to ISO strings.
   * @private
   */
  private _deserialize(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...data };
    for (const [key, value] of Object.entries(result)) {
      if (value instanceof Timestamp) {
        result[key] = value.toDate().toISOString();
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this._deserialize(value as Record<string, unknown>);
      }
    }
    return result;
  }
}

export { FieldValue };
