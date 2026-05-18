import type { IncomingMessage, ServerResponse } from 'http';
import { getSql } from '../../db/client.js';
import { addUpdate } from '../../monday/addUpdate.js';

function safeParse<T>(json: unknown, fallback: T): T {
  if (json == null) return fallback;
  try { return JSON.parse(json as string) as T; } catch { return fallback; }
}

// GET /api/jobs?status=&materialReady=&search=&limit=&offset=
// Lists Monday-synced jobs so the dispatcher can browse them in the dashboard.
export async function handleListJobs(
  req: IncomingMessage,
  res: ServerResponse,
  filters: {
    status?: string; materialReady?: string; search?: string;
    limit?: number; offset?: number;
  } = {},
): Promise<void> {
  const sql = getSql();
  const limit  = Math.min(filters.limit ?? 100, 500);
  const offset = filters.offset ?? 0;
  const status = filters.status ?? null;
  const material = filters.materialReady ?? null;
  const search = filters.search ? `%${filters.search.toLowerCase()}%` : null;

  type Row = {
    id: string; jobNumber: string; itemName: string;
    customerName: string | null; address: string | null; city: string | null;
    clientType: string | null; jobType: string | null;
    status: string | null; materialStatus: string | null; materialReady: number | null;
    trailerNeeded: string; driverNeeded: number | null;
    logisticsStatus: string | null; promisedDate: string | null;
    notes: string | null; syncedAt: string;
  };

  const rows = await sql<Row[]>`
    SELECT
      id, job_number AS "jobNumber", item_name AS "itemName",
      customer_name AS "customerName", address, city,
      client_type AS "clientType", job_type AS "jobType",
      status, material_status AS "materialStatus", material_ready AS "materialReady",
      trailer_needed AS "trailerNeeded", driver_needed AS "driverNeeded",
      logistics_status AS "logisticsStatus", promised_date AS "promisedDate",
      notes, synced_at AS "syncedAt"
    FROM jobs
    WHERE (${status}::text IS NULL OR status = ${status})
      AND (${material}::text IS NULL OR
           (${material} = 'ready'  AND material_ready = 1) OR
           (${material} = 'unknown' AND material_ready IS NULL) OR
           (${material} = 'pending' AND material_ready = 0))
      AND (${search}::text IS NULL OR
           lower(item_name)     LIKE ${search} OR
           lower(job_number)    LIKE ${search} OR
           lower(COALESCE(customer_name, '')) LIKE ${search} OR
           lower(COALESCE(address, ''))       LIKE ${search})
    ORDER BY
      CASE WHEN material_ready = 1 THEN 0 ELSE 1 END,
      promised_date NULLS LAST,
      job_number
    LIMIT ${limit} OFFSET ${offset}
  `;

  // Lightweight transform: parse trailer_needed JSON, attach Monday URL
  const result = rows.map((r) => ({
    ...r,
    trailerNeeded: safeParse(r.trailerNeeded, [] as string[]),
    mondayItemUrl: `https://installbrickpavers-team.monday.com/boards/2214820863/pulses/${r.id}`,
  }));

  // Aggregate status counts for the filter UI
  const counts = await sql<Array<{ status: string | null; n: string }>>`
    SELECT status, COUNT(*)::text AS n FROM jobs GROUP BY status ORDER BY n DESC
  `;
  const materialCounts = await sql<Array<{ bucket: string; n: string }>>`
    SELECT
      CASE
        WHEN material_ready = 1   THEN 'ready'
        WHEN material_ready = 0   THEN 'pending'
        ELSE 'unknown'
      END AS bucket,
      COUNT(*)::text AS n
    FROM jobs GROUP BY bucket
  `;

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    jobs: result,
    statusCounts: counts.map((c) => ({ status: c.status, count: parseInt(c.n, 10) })),
    materialCounts: materialCounts.map((c) => ({ bucket: c.bucket, count: parseInt(c.n, 10) })),
    totalReturned: result.length,
  }));
}

// GET /api/jobs/:jobNumber
// Merged view: jobs row + brief_jobs history + recent photos + open flags.
export async function handleGetJob(
  req: IncomingMessage,
  res: ServerResponse,
  jobNumber: string,
): Promise<void> {
  if (!jobNumber) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'jobNumber is required' }));
    return;
  }
  const sql = getSql();

  type JobRow = {
    id: string; jobNumber: string; itemName: string; customerName: string | null;
    address: string | null; city: string | null; status: string | null;
    materialStatus: string | null; materialReady: number | null;
    trailerNeeded: string | null; driverNeeded: number | null;
    logisticsStatus: string | null; promisedDate: string | null; notes: string | null;
  };
  const [job] = await sql<JobRow[]>`
    SELECT
      id, job_number AS "jobNumber", item_name AS "itemName",
      customer_name AS "customerName", address, city, status,
      material_status AS "materialStatus", material_ready AS "materialReady",
      trailer_needed AS "trailerNeeded", driver_needed AS "driverNeeded",
      logistics_status AS "logisticsStatus", promised_date AS "promisedDate", notes
    FROM jobs WHERE job_number = ${jobNumber}
  `;
  if (!job) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Job not found' }));
    return;
  }

  const history = await sql<Array<{
    id: string; briefDate: string; crewKey: string; jobName: string;
    checkInStatus: string | null; sentAt: string | null; supervisor: string | null;
    riskFlags: string;
  }>>`
    SELECT
      id, brief_date AS "briefDate", crew_key AS "crewKey", job_name AS "jobName",
      check_in_status AS "checkInStatus", sent_at AS "sentAt",
      supervisor, risk_flags AS "riskFlags"
    FROM brief_jobs
    WHERE job_number = ${jobNumber}
    ORDER BY brief_date DESC
    LIMIT 20
  `;

  const photos = await sql`
    SELECT
      id, received_at AS "receivedAt", crew_key AS "crewKey",
      sender, ai_summary AS "aiSummary",
      completion_status AS "completionStatus"
    FROM photos
    WHERE job_number = ${jobNumber}
    ORDER BY received_at DESC
    LIMIT 10
  `;

  const openFlags = await sql`
    SELECT id, timestamp, sender, text, crew_key AS "crewKey"
    FROM flags
    WHERE resolved = 0
      AND text ILIKE ${`%${jobNumber}%`}
    ORDER BY timestamp DESC
    LIMIT 10
  `;

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ...job,
    trailerNeeded: safeParse(job.trailerNeeded, [] as string[]),
    mondayItemUrl: `https://groupibp.monday.com/boards/_/pulses/${job.id}`,
    history: history.map((h) => ({ ...h, riskFlags: safeParse(h.riskFlags, [] as string[]) })),
    photos,
    openFlags,
  }));
}

// GET /api/jobs/:jobNumber/material-status
export async function handleGetMaterialStatus(
  req: IncomingMessage,
  res: ServerResponse,
  jobNumber: string,
): Promise<void> {
  const sql = getSql();
  const [job] = await sql<Array<{
    id: string; materialStatus: string | null; materialReady: number | null;
    notes: string | null; syncedAt: string;
  }>>`
    SELECT id, material_status AS "materialStatus", material_ready AS "materialReady",
           notes, synced_at AS "syncedAt"
    FROM jobs WHERE job_number = ${jobNumber}
  `;
  if (!job) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Job not found' }));
    return;
  }
  // Pull supplier + PO from notes if a "Keystone · PO 88421" style line exists
  const supplierMatch = job.notes?.match(/(keystone|premier|old castle|oldcastle)[^\n]*?(?:po|order)?\s*#?\s*(\d{3,})/i);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: job.materialStatus ?? (job.materialReady === 1 ? 'Ordered, confirmed delivered' : 'Ordered, not confirmed delivered'),
    confirmed: job.materialReady === 1,
    lastUpdate: job.syncedAt,
    supplier: supplierMatch?.[1] ?? null,
    poNumber: supplierMatch?.[2] ?? null,
    riskNote: job.materialReady === 1 ? null : 'Crew may arrive with no material on site. Idle 2–4h likely.',
    mondayItemUrl: `https://groupibp.monday.com/boards/_/pulses/${job.id}`,
  }));
}

// POST /api/jobs/:jobNumber/material-status  body: { confirmed: true }
export async function handleSetMaterialStatus(
  req: IncomingMessage,
  res: ServerResponse,
  jobNumber: string,
  body: { confirmed?: boolean },
): Promise<void> {
  if (body.confirmed !== true) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'body.confirmed must be true' }));
    return;
  }
  const sql = getSql();
  const [job] = await sql<{ id: string; itemName: string }[]>`
    SELECT id, item_name AS "itemName" FROM jobs WHERE job_number = ${jobNumber}
  `;
  if (!job) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Job not found' }));
    return;
  }
  const now = new Date().toISOString();
  await sql`UPDATE jobs SET material_ready = 1, material_status = ${'Confirmed delivered'} WHERE job_number = ${jobNumber}`;

  // Best-effort Monday writeback — log but don't fail the request if Monday is down
  try {
    await addUpdate(job.id, {
      senderName: 'Dispatcher',
      timestamp: now,
      aiSummary: `Material confirmed delivered by dispatcher at ${new Date(now).toLocaleString('en-US')}`,
      completionStatus: 'confirmed',
    });
  } catch (err) {
    console.warn(`[material-status] Monday writeback failed for ${jobNumber}: ${(err as Error).message}`);
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, status: 'Confirmed delivered' }));
}
