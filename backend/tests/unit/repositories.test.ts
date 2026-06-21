/**
 * @fileoverview Unit tests for repository classes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InMemoryEmissionRepository } from '../../repositories/InMemoryEmissionRepository.js';
import { FirestoreEmissionRepository } from '../../repositories/FirestoreEmissionRepository.js';

// Mock BaseDB
const mockAdd = vi.fn();
const mockQueryCollection = vi.fn();
const mockDeleteDoc = vi.fn();

vi.mock('../../services/BaseDB.js', () => {
  return {
    BaseDB: class {
      protected db = {};
      addDoc = mockAdd;
      queryCollection = mockQueryCollection;
      deleteDoc = mockDeleteDoc;
    }
  };
});

describe('InMemoryEmissionRepository', () => {
  it('adds and retrieves records correctly', async () => {
    const repo = new InMemoryEmissionRepository();
    const addResult = await repo.add('user-123', {
      userId: 'user-123',
      category: 'food',
      kgCO2e: 4.5,
      date: '2026-06-21',
      metadata: { origin: 'lunch' }
    });

    expect(addResult).toHaveProperty('id');
    const records = await repo.getRecords('user-123');
    expect(records.length).toBe(1);
    expect(records[0].category).toBe('food');
    expect(records[0].kgCO2e).toBe(4.5);
  });

  it('filters records by category correctly', async () => {
    const repo = new InMemoryEmissionRepository();
    await repo.add('user-123', { userId: 'user-123', category: 'food', kgCO2e: 1.2, date: '2026-06-21' });
    await repo.add('user-123', { userId: 'user-123', category: 'commute', kgCO2e: 5.6, date: '2026-06-21' });

    const foodRecords = await repo.getRecords('user-123', { category: 'food' });
    expect(foodRecords.length).toBe(1);
    expect(foodRecords[0].category).toBe('food');
  });

  it('deletes records correctly', async () => {
    const repo = new InMemoryEmissionRepository();
    const result = await repo.add('user-123', { userId: 'user-123', category: 'food', kgCO2e: 1.2, date: '2026-06-21' });
    
    let records = await repo.getRecords('user-123');
    expect(records.length).toBe(1);

    await repo.delete('user-123', result.id);
    records = await repo.getRecords('user-123');
    expect(records.length).toBe(0);
  });

  it('clears records correctly', async () => {
    const repo = new InMemoryEmissionRepository();
    await repo.add('user-123', { userId: 'user-123', category: 'food', kgCO2e: 1.2, date: '2026-06-21' });
    
    repo.clear();
    const records = await repo.getRecords('user-123');
    expect(records.length).toBe(0);
  });
});

describe('FirestoreEmissionRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls BaseDB addDoc correctly on add', async () => {
    mockAdd.mockResolvedValue({ id: 'doc-xyz' });
    const repo = new FirestoreEmissionRepository();
    const record = { userId: 'user-123', category: 'food' as const, kgCO2e: 1.2, date: '2026-06-21' };
    const result = await repo.add('user-123', record);
    expect(mockAdd).toHaveBeenCalledWith('users/user-123/emissions', record);
    expect(result.id).toBe('doc-xyz');
  });

  it('calls BaseDB queryCollection correctly on getRecords', async () => {
    mockQueryCollection.mockResolvedValue([{ id: 'doc-xyz', category: 'food' }]);
    const repo = new FirestoreEmissionRepository();
    const result = await repo.getRecords('user-123', { category: 'food', limit: 10 });
    expect(mockQueryCollection).toHaveBeenCalledWith('users/user-123/emissions', [['category', '==', 'food']], {
      orderBy: 'createdAt',
      orderDirection: 'desc',
      limit: 10,
    });
    expect(result.length).toBe(1);
  });

  it('calls BaseDB deleteDoc correctly on delete', async () => {
    mockDeleteDoc.mockResolvedValue(undefined);
    const repo = new FirestoreEmissionRepository();
    await repo.delete('user-123', 'doc-xyz');
    expect(mockDeleteDoc).toHaveBeenCalledWith('users/user-123/emissions', 'doc-xyz');
  });
});
