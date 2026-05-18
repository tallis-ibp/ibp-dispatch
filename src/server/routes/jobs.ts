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

  const rows = await sql<(Row & {
    assignedCrewKey: string | null;
    assignedCrewName: string | null;
    assignedDate: string | null;
    assignedStatus: string | null;
  })[]>`
    SELECT
      j.id, j.job_number AS "jobNumber", j.item_name AS "itemName",
      j.customer_name AS "customerName", j.address, j.city,
      j.client_type AS "clientType", j.job_type AS "jobType",
      j.status, j.material_status AS "materialStatus", j.material_ready AS "materialReady",
      j.trailer_needed AS "trailerNeeded", j.driver_needed AS "driverNeeded",
      j.logistics_status AS "logisticsStatus", j.promised_date AS "promisedDate",
      j.notes, j.synced_at AS "syncedAt",
      a.crew_key AS "assignedCrewKey",
      a.crew_display AS "assignedCrewName",
      a.date AS "assignedDate",
      a.status AS "assignedStatus"
    FROM jobs j
    LEFT JOIN LATERAL (
      SELECT sp.crew_key, c.display_name AS crew_display, sp.date, sp.status
      FROM schedule_proposals sp
      LEFT JOIN crews c ON c.key = sp.crew_key
      WHERE sp.job_number = j.job_number
      ORDER BY sp.date DESC, sp.generated_at DESC
      LIMIT 1
    ) a ON TRUE
    WHERE (${status}::text IS NULL OR j.status = ${status})
      AND (${material}::text IS NULL OR
           (${material} = 'ready'  AND j.material_ready = 1) OR
           (${material} = 'unknown' AND j.material_ready IS NULL) OR
           (${material} = 'pending' AND j.material_ready = 0))
      AND (${search}::text IS NULL OR
           lower(j.item_name)     LIKE ${search} OR
           lower(j.job_number)    LIKE ${search} OR
           lower(COALESCE(j.customer_name, '')) LIKE ${search} OR
           lower(COALESCE(j.address, ''))       LIKE ${search})
    ORDER BY
      CASE WHEN j.material_ready = 1 THEN 0 ELSE 1 END,
      j.promised_date NULLS LAST,
      j.job_number
    LIMIT ${limit} OFFSET ${offset}
  `;

  // Lightweight transform: parse trailer_needed JSON, attach Monday URL, bundle assignment
  const result = rows.map((r) => ({
    ...r,
    trailerNeeded: safeParse(r.trailerNeeded, [] as string[]),
    mondayItemUrl: `https://installbrickpavers-team.monday.com/boards/2214820863/pulses/${r.id}`,
    currentAssignment: r.assignedCrewKey ? {
      crewKey: r.assignedCrewKey,
      crewName: r.assignedCrewName ?? r.assignedCrewKey,
      date: r.assignedDate,
      status: r.assignedStatus,
    } : null,
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

// POST /api/jobs/:jobNumber/assign  body: { crewKey, date? }
// Manually pair a Monday job to a crew for a given date by upserting a
// schedule_proposals row with status='approved'. The dispatcher can then
// "Generate brief" to convert approved proposals into brief_jobs.
export async function handleAssignJob(
  req: IncomingMessage,
  res: ServerResponse,
  jobNumber: string,
  body: { crewKey?: string; date?: string },
): Promise<void> {
  if (!body.crewKey) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'crewKey is required' }));
    return;
  }
  const date = body.date ?? new Date().toISOString().slice(0, 10);
  const sql = getSql();

  const [job] = await sql<{ jobNumber: string; itemName: string }[]>`
    SELECT job_number AS "jobNumber", item_name AS "itemName"
    FROM jobs WHERE job_number = ${jobNumber}
  `;
  if (!job) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Job not found' }));
    return;
  }
  const [crew] = await sql<{ key: string; displayName: string }[]>`
    SELECT key, display_name AS "displayName" FROM crews WHERE key = ${body.crewKey}
  `;
  if (!crew) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Crew not found' }));
    return;
  }

  // Remove any existing proposal for the same date+job (so we don't pile up)
  await sql`
    DELETE FROM schedule_proposals
    WHERE date = ${date} AND job_number = ${jobNumber}
  `;

  await sql`
    INSERT INTO schedule_proposals
      (id, date, generated_at, crew_key, job_number, job_name, reasoning, confidence, status)
    VALUES (
      gen_random_uuid()::text,
      ${date},
      ${new Date().toISOString()},
      ${body.crewKey},
      ${jobNumber},
      ${job.itemName},
      ${`Manually assigned by dispatcher.`},
      'high',
      'approved'
    )
  `;

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok: true,
    date,
    jobNumber,
    crewKey: body.crewKey,
    crewName: crew.displayName,
  }));
}

// GET /api/jobs/:jobNumber/assignment
// Who is the job currently assigned to (latest approved proposal for the most recent date)
export async function handleGetJobAssignment(
  req: IncomingMessage,
  res: ServerResponse,
  jobNumber: string,
): Promise<void> {
  const sql = getSql();
  const rows = await sql<Array<{
    date: string; crewKey: string; status: string;
    crewName: string | null;
  }>>`
    SELECT
      sp.date,
      sp.crew_key AS "crewKey",
      sp.status,
      c.display_name AS "crewName"
    FROM schedule_proposals sp
    LEFT JOIN crews c ON c.key = sp.crew_key
    WHERE sp.job_number = ${jobNumber}
    ORDER BY sp.date DESC, sp.generated_at DESC
    LIMIT 5
  `;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ assignments: rows }));
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
