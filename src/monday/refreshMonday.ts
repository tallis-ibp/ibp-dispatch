import { getSql } from '../db/client.js';
import { fetchJobsFromMonday } from './fetchJobs.js';
import type { Job } from '../types/index.js';

export async function upsertJobsToDb(jobs: Job[]): Promise<void> {
  const sql = getSql();
  await sql.begin(async (tx) => {
    for (const job of jobs) {
      await tx`
        INSERT INTO jobs (
          id, job_number, item_name, customer_name, address, city, client_type,
          job_type, status, material_status, material_ready, equipment_needed,
          trailer_needed, driver_needed, logistics_status, promised_date, notes, synced_at
        ) VALUES (
          ${job.id}, ${job.jobNumber}, ${job.itemName}, ${job.customerName},
          ${job.address}, ${job.city}, ${job.clientType}, ${job.jobType},
          ${job.status}, ${job.materialStatus},
          ${job.materialReady === null ? null : job.materialReady ? 1 : 0},
          ${JSON.stringify(job.equipmentNeeded)}, ${JSON.stringify(job.trailerNeeded)},
          ${job.driverNeeded ? 1 : 0}, ${job.logisticsStatus}, ${job.promisedDate},
          ${job.notes}, ${job.syncedAt}
        )
        ON CONFLICT (id) DO UPDATE SET
          item_name = EXCLUDED.item_name,
          status = EXCLUDED.status,
          material_status = EXCLUDED.material_status,
          material_ready = EXCLUDED.material_ready,
          logistics_status = EXCLUDED.logistics_status,
          notes = EXCLUDED.notes,
          synced_at = EXCLUDED.synced_at
      `;
    }
  });
}

export async function refreshMonday(): Promise<void> {
  console.log('[refreshMonday] Fetching jobs from Monday.com...');
  const jobs = await fetchJobsFromMonday();
  await upsertJobsToDb(jobs);
  console.log(`[refreshMonday] Upserted ${jobs.length} jobs into PostgreSQL`);
}

const isMain = process.argv[1]
  ? import.meta.url === new URL(process.argv[1], 'file://').href
  : false;

if (isMain) {
  refreshMonday().catch((err) => { console.error(err); process.exit(1); });
}
