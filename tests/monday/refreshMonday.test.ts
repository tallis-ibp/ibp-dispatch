import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBegin = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
  const mockTx = vi.fn().mockResolvedValue([]);
  await fn(mockTx);
});
const mockSql = Object.assign(vi.fn().mockResolvedValue([]), { begin: mockBegin });

vi.mock('../../src/db/client.js', () => ({
  getSql: () => mockSql,
}));

import { upsertJobsToDb } from '../../src/monday/refreshMonday.js';
import type { Job } from '../../src/types/index.js';

const sampleJob: Job = {
  id: 'item-1',
  jobNumber: '600049',
  itemName: 'GILROY #600049',
  customerName: 'GILROY',
  address: '123 Main St',
  city: 'Orlando',
  clientType: 'builder',
  jobType: 'deck',
  status: 'NEED_TO_SCHEDULE',
  materialStatus: 'ready',
  materialReady: true,
  equipmentNeeded: [],
  trailerNeeded: ['flat'],
  driverNeeded: true,
  logisticsStatus: null,
  promisedDate: null,
  notes: null,
  syncedAt: '2026-05-12T06:00:00Z',
};

describe('upsertJobsToDb', () => {
  beforeEach(() => { mockBegin.mockClear(); mockSql.mockClear(); });

  // Phase 2.1 — sql.begin removed (PgBouncer transaction mode is unreliable for it).
  // Sequential statements are now used instead.
  it('runs one tagged-template upsert per job sequentially (no sql.begin)', async () => {
    await upsertJobsToDb([sampleJob, { ...sampleJob, id: 'item-2', jobNumber: '600050' }]);
    expect(mockBegin).not.toHaveBeenCalled();
    // mockSql is called as a tagged template, once per job
    expect(mockSql).toHaveBeenCalledTimes(2);
  });

  it('handles an empty job list without error', async () => {
    await expect(upsertJobsToDb([])).resolves.toBeUndefined();
    expect(mockSql).not.toHaveBeenCalled();
  });
});
