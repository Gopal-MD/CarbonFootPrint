/**
 * @fileoverview BaseDB — Abstract Firestore database access layer.
 *
 * Provides a typed, reusable interface over Firebase Admin Firestore.
 * All application database logic MUST go through this class (or subclasses)
 * to ensure consistent error handling, logging, and testability.
 *
 * @module services/BaseDB
 */

import { initializeApp, getApps, getApp, cert, App } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp, Firestore, WhereFilterOp } from 'firebase-admin/firestore';
import { createModuleLogger } from '../utils/logger.js';

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

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
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

// ── BaseDB Class ──────────────────────────────────────────────────────────────
/**
 * Abstract base class for Firestore database operations.
 * Provides CRUD methods with consistent error handling and logging.
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
   * Retrieves a single document by path.
   *
   * @param collectionPath - Firestore collection path (e.g., 'users').
   * @param docId - Document ID.
   * @returns The document data with its ID, or null if not found.
   * @throws {Error} On Firestore read failure.
   */
  async getDoc(collectionPath: string, docId: string): Promise<any> {
    try {
      const ref = this.db.collection(collectionPath).doc(docId);
      const snap = await ref.get();

      if (!snap.exists) {
        logger.debug(`Document not found: ${collectionPath}/${docId}`);
        return null;
      }

      return { id: snap.id, ...snap.data() };
    } catch (error: any) {
      logger.error(`Failed to get document ${collectionPath}/${docId}`, { error: error.message });
      throw new Error(`Database read failed: ${error.message}`);
    }
  }

  /**
   * Creates or overwrites a document at the given path.
   *
   * @param collectionPath - Firestore collection path.
   * @param docId - Document ID.
   * @param data - Data to write. `createdAt` is automatically added if absent.
   * @returns The document ID.
   * @throws {Error} On Firestore write failure.
   */
  async setDoc(collectionPath: string, docId: string, data: any): Promise<{ id: string }> {
    try {
      const ref = this.db.collection(collectionPath).doc(docId);
      const payload = {
        ...data,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: data.createdAt || FieldValue.serverTimestamp(),
      };

      await ref.set(payload);
      logger.debug(`Document set: ${collectionPath}/${docId}`);
      return { id: docId };
    } catch (error: any) {
      logger.error(`Failed to set document ${collectionPath}/${docId}`, { error: error.message });
      throw new Error(`Database write failed: ${error.message}`);
    }
  }

  /**
   * Partially updates an existing document (merge semantics).
   *
   * @param collectionPath - Firestore collection path.
   * @param docId - Document ID.
   * @param data - Fields to update. Missing fields are preserved.
   * @returns The document ID.
   * @throws {Error} On Firestore update failure.
   */
  async updateDoc(collectionPath: string, docId: string, data: any): Promise<{ id: string }> {
    try {
      const ref = this.db.collection(collectionPath).doc(docId);
      await ref.update({ ...data, updatedAt: FieldValue.serverTimestamp() });
      logger.debug(`Document updated: ${collectionPath}/${docId}`);
      return { id: docId };
    } catch (error: any) {
      logger.error(`Failed to update document ${collectionPath}/${docId}`, { error: error.message });
      throw new Error(`Database update failed: ${error.message}`);
    }
  }

  /**
   * Adds a new document to a collection with an auto-generated ID.
   *
   * @param collectionPath - Firestore collection path.
   * @param data - Data to write.
   * @returns The auto-generated document ID.
   * @throws {Error} On Firestore write failure.
   */
  async addDoc(collectionPath: string, data: any): Promise<{ id: string }> {
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
    } catch (error: any) {
      logger.error(`Failed to add document to ${collectionPath}`, { error: error.message });
      throw new Error(`Database write failed: ${error.message}`);
    }
  }

  /**
   * Queries a collection with optional filters, ordering, and pagination.
   *
   * @param collectionPath - Firestore collection path.
   * @param filters - Where clauses.
   * @param options - Query options.
   * @returns Array of document data objects with IDs.
   * @throws {Error} On Firestore query failure.
   */
  async queryCollection(
    collectionPath: string,
    filters: Array<[string, WhereFilterOp, any]> = [],
    options: { orderBy?: string; orderDirection?: 'asc' | 'desc'; limit?: number } = {}
  ): Promise<any[]> {
    try {
      let query: import('firebase-admin/firestore').Query = this.db.collection(collectionPath);

      for (const [field, op, value] of filters) {
        query = query.where(field, op, value);
      }

      if (options.orderBy) {
        query = query.orderBy(options.orderBy, options.orderDirection || 'desc');
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const snapshot = await query.get();

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...this._deserialize(doc.data()),
      }));
    } catch (error: any) {
      logger.error(`Failed to query collection ${collectionPath}`, { error: error.message });
      throw new Error(`Database query failed: ${error.message}`);
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
    } catch (error: any) {
      logger.error(`Failed to delete document ${collectionPath}/${docId}`, { error: error.message });
      throw new Error(`Database delete failed: ${error.message}`);
    }
  }

  /**
   * Converts Firestore Timestamps to ISO strings in a document.
   * Ensures consistent serialization across the API boundary.
   *
   * @param data - Raw Firestore document data.
   * @returns Data with Timestamps converted to ISO strings.
   * @private
   */
  private _deserialize(data: any): any {
    const result = { ...data };
    for (const [key, value] of Object.entries(result)) {
      if (value instanceof Timestamp) {
        result[key] = value.toDate().toISOString();
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this._deserialize(value);
      }
    }
    return result;
  }
}

export { FieldValue };
