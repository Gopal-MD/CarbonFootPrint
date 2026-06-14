/**
 * @fileoverview BaseDB — Abstract Firestore database access layer.
 *
 * Provides a typed, reusable interface over Firebase Admin Firestore.
 * All application database logic MUST go through this class (or subclasses)
 * to ensure consistent error handling, logging, and testability.
 *
 * @module services/BaseDB
 */

import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('BaseDB');

// ── Firebase Admin Initialization (singleton) ────────────────────────────────
/**
 * Initializes (or retrieves) the Firebase Admin App singleton.
 * Supports both JSON string (Cloud Run secrets) and file path credential styles.
 *
 * @returns {import('firebase-admin/app').App}
 * @throws {Error} If FIREBASE_SERVICE_ACCOUNT_JSON is malformed JSON.
 */
function initializeFirebaseAdmin() {
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

let _db = null;

/**
 * Lazily initializes and returns the Firestore instance.
 *
 * @returns {import('firebase-admin/firestore').Firestore}
 */
function getDb() {
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
 *
 * @abstract
 * @example
 * class EmissionsDB extends BaseDB {
 *   async addRecord(userId, record) {
 *     return this.addDoc(`users/${userId}/emissions`, record);
 *   }
 * }
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
   * @returns {import('firebase-admin/firestore').Firestore}
   * @protected
   */
  get db() {
    return getDb();
  }

  /**
   * Retrieves a single document by path.
   *
   * @param {string} collectionPath - Firestore collection path (e.g., 'users').
   * @param {string} docId - Document ID.
   * @returns {Promise<object|null>} The document data with its ID, or null if not found.
   * @throws {Error} On Firestore read failure.
   *
   * @example
   * const user = await db.getDoc('users', uid);
   */
  async getDoc(collectionPath, docId) {
    try {
      const ref = this.db.collection(collectionPath).doc(docId);
      const snap = await ref.get();

      if (!snap.exists) {
        logger.debug(`Document not found: ${collectionPath}/${docId}`);
        return null;
      }

      return { id: snap.id, ...snap.data() };
    } catch (error) {
      logger.error(`Failed to get document ${collectionPath}/${docId}`, { error: error.message });
      throw new Error(`Database read failed: ${error.message}`);
    }
  }

  /**
   * Creates or overwrites a document at the given path.
   *
   * @param {string} collectionPath - Firestore collection path.
   * @param {string} docId - Document ID.
   * @param {object} data - Data to write. `createdAt` is automatically added if absent.
   * @returns {Promise<{id: string}>} The document ID.
   * @throws {Error} On Firestore write failure.
   */
  async setDoc(collectionPath, docId, data) {
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
    } catch (error) {
      logger.error(`Failed to set document ${collectionPath}/${docId}`, { error: error.message });
      throw new Error(`Database write failed: ${error.message}`);
    }
  }

  /**
   * Partially updates an existing document (merge semantics).
   *
   * @param {string} collectionPath - Firestore collection path.
   * @param {string} docId - Document ID.
   * @param {object} data - Fields to update. Missing fields are preserved.
   * @returns {Promise<{id: string}>} The document ID.
   * @throws {Error} On Firestore update failure.
   */
  async updateDoc(collectionPath, docId, data) {
    try {
      const ref = this.db.collection(collectionPath).doc(docId);
      await ref.update({ ...data, updatedAt: FieldValue.serverTimestamp() });
      logger.debug(`Document updated: ${collectionPath}/${docId}`);
      return { id: docId };
    } catch (error) {
      logger.error(`Failed to update document ${collectionPath}/${docId}`, { error: error.message });
      throw new Error(`Database update failed: ${error.message}`);
    }
  }

  /**
   * Adds a new document to a collection with an auto-generated ID.
   *
   * @param {string} collectionPath - Firestore collection path.
   * @param {object} data - Data to write.
   * @returns {Promise<{id: string}>} The auto-generated document ID.
   * @throws {Error} On Firestore write failure.
   */
  async addDoc(collectionPath, data) {
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
    } catch (error) {
      logger.error(`Failed to add document to ${collectionPath}`, { error: error.message });
      throw new Error(`Database write failed: ${error.message}`);
    }
  }

  /**
   * Queries a collection with optional filters, ordering, and pagination.
   *
   * @param {string} collectionPath - Firestore collection path.
   * @param {Array<[string, import('firebase-admin/firestore').WhereFilterOp, *]>} [filters=[]] - Where clauses.
   * @param {object} [options={}] - Query options.
   * @param {string} [options.orderBy] - Field to order by.
   * @param {'asc'|'desc'} [options.orderDirection='desc'] - Sort direction.
   * @param {number} [options.limit] - Maximum number of results.
   * @returns {Promise<object[]>} Array of document data objects with IDs.
   * @throws {Error} On Firestore query failure.
   *
   * @example
   * const records = await db.queryCollection(
   *   `users/${uid}/emissions`,
   *   [['category', '==', 'commute']],
   *   { orderBy: 'createdAt', limit: 20 }
   * );
   */
  async queryCollection(collectionPath, filters = [], options = {}) {
    try {
      let query = this.db.collection(collectionPath);

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
    } catch (error) {
      logger.error(`Failed to query collection ${collectionPath}`, { error: error.message });
      throw new Error(`Database query failed: ${error.message}`);
    }
  }

  /**
   * Deletes a document by path and ID.
   *
   * @param {string} collectionPath - Firestore collection path.
   * @param {string} docId - Document ID.
   * @returns {Promise<void>}
   * @throws {Error} On Firestore delete failure.
   */
  async deleteDoc(collectionPath, docId) {
    try {
      await this.db.collection(collectionPath).doc(docId).delete();
      logger.debug(`Document deleted: ${collectionPath}/${docId}`);
    } catch (error) {
      logger.error(`Failed to delete document ${collectionPath}/${docId}`, { error: error.message });
      throw new Error(`Database delete failed: ${error.message}`);
    }
  }

  /**
   * Converts Firestore Timestamps to ISO strings in a document.
   * Ensures consistent serialization across the API boundary.
   *
   * @param {object} data - Raw Firestore document data.
   * @returns {object} Data with Timestamps converted to ISO strings.
   * @private
   */
  _deserialize(data) {
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
