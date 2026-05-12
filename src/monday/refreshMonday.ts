/**
 * src/monday/refreshMonday.ts
 * Fetches all active jobs from Monday.com and upserts them into SQLite.
 */

import { getDb } from '../db/client.js';
import { fetchJobsFromMonday } from './fetchJobs.js';
import type { Job } from '../types/index.js';

export function upsertJobsToDb(jobs: Job[]): void {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO jobs (
      id, job_number, item_name, customer_name, address, city, client_type,
      job_type, status, material_status, material_ready, equipment_needed,
      trailer_needed, driver_needed, logistics_status, promised_date, notes, synced_at
    ) VALUES (
      @id, @jobNumber, @itemName, @customerName, @address, @city, @clientType,
      @jobType, @status, @materialStatus, @materialReady, @equipmentNeeded,
      @trailerNeeded, @driverNeeded, @logisticsStatus, @promisedDate, @notes, @syncedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      item_name = excluded.item_name,
      status = excluded.status,
      material_status = excluded.material_status,
      material_ready = excluded.material_ready,
      logistics_status = excluded.logistics_status,
      notes = excluded.notes,
      synced_at = excluded.synced_at
  `);

  const upsertMany = db.transaction((jobList: Job[]) => {
    for (const job of jobList) {
      upsert.run({
        ...job,
        materialReady: job.materialReady === null ? null : job.materialReady ? 1 : 0,
        driverNeeded: job.driverNeeded ? 1 : 0,
        equipmentNeeded: JSON.stringify(job.equipmentNeeded),
        trailerNeeded: JSON.stringify(job.trailerNeeded),
      });
    }
  });

  upsertMany(jobs);
}

export async function refreshMonday(): Promise<void> {
  console.log('[refreshMonday] Fetching jobs from Monday.com...');
  const jobs = await fetchJobsFromMonday();
  upsertJobsToDb(jobs);
  console.log(`[refreshMonday] Upserted ${jobs.length} jobs into SQLite`);
}

// Run directly when invoked as a script
const isMain = process.argv[1]
  ? import.meta.url === new URL(process.argv[1], 'file://').href
  : false;

if (isMain) {
  refreshMonday().catch(err => {
    console.error('[refreshMonday] Fatal error:', err);
    process.exit(1);
  });
}
