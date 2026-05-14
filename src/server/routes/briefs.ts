import type { IncomingMessage, ServerResponse } from 'http';
import { getSql } from '../../db/client.js';
import { parseParams, dateParam } from '../../middleware/validate.js';
import { z } from 'zod';
import { generateBriefs } from '../../core/generateBriefs.js';
import { dispatchBriefToCrews } from '../../telegram/dispatcher.js';

function safeParse<T>(json: unknown, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json as string) as T; } catch { return fallback; }
}

export async function handleGetBrief(req: IncomingMessage, res: ServerResponse, date: string): Promise<void> {
  const parsed = parseParams(z.object({ date: dateParam }), { date });
  if (!parsed.ok) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: parsed.error }));
    return;
  }

  const sql = getSql();
  const [brief] = await sql`SELECT * FROM briefs WHERE date = ${date}`;
  if (!brief) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Brief not found' }));
    return;
  }

  // Warn about orphan rows before INNER JOIN drops them silently
  const orphans = await sql<{ crew_key: string }[]>`
    SELECT DISTINCT bj.crew_key
    FROM brief_jobs bj
    WHERE bj.brief_date = ${date}
      AND NOT EXISTS (SELECT 1 FROM crews c WHERE c.key = bj.crew_key)
  `;
  for (const { crew_key } of orphans) {
    console.warn(
      `[handleGetBrief] orphan brief_jobs: date=${date} crew_key=${crew_key} — no matching crew, row dropped`,
    );
  }

  type BriefRow = {
    crew_key: string; job_number: string; job_name: string;
    address: string | null; gate_code: string | null; supervisor: string | null;
    trailer_type: string | null; tasks: string; materials: string;
    next_stop: string | null; risk_flags: string; dispatch_text: string | null;
    annotations: string | null; sent_at: string | null;
    display_name: string; telegram_group_id: string | null;
    language: string; reliability: string | null;
  };
  const rows = await sql<BriefRow[]>`
    SELECT
      bj.crew_key, bj.job_number, bj.job_name, bj.address,
      bj.gate_code, bj.supervisor, bj.trailer_type,
      bj.tasks, bj.materials, bj.next_stop, bj.risk_flags,
      bj.dispatch_text, bj.annotations, bj.sent_at,
      c.display_name, c.telegram_group_id, c.language, c.reliability
    FROM brief_jobs bj
    INNER JOIN crews c ON c.key = bj.crew_key
    WHERE bj.brief_date = ${date}
    ORDER BY bj.crew_key, bj.job_number
  `;

  type CrewShape = {
    crewKey: string; displayName: string; telegramGroupId: string | null;
    language: string; reliability: string | null; sentAt: string | null;
    jobs: object[];
  };
  const crewMap = new Map<string, CrewShape>();

  for (const r of rows) {
    if (!crewMap.has(r.crew_key)) {
      crewMap.set(r.crew_key, {
        crewKey: r.crew_key,
        displayName: r.display_name,
        telegramGroupId: r.telegram_group_id,
        language: r.language,
        reliability: r.reliability,
        sentAt: null,
        jobs: [],
      });
    }
    const crew = crewMap.get(r.crew_key)!;
    // MIN(sent_at): keep earliest non-null across this crew's jobs
    if (r.sent_at !== null && (crew.sentAt === null || r.sent_at < crew.sentAt)) {
      crew.sentAt = r.sent_at;
    }
    crew.jobs.push({
      jobNumber:    r.job_number,
      jobName:      r.job_name,
      address:      r.address,
      gateCode:     r.gate_code,
      supervisor:   r.supervisor,
      trailerType:  r.trailer_type,
      tasks:        safeParse(r.tasks, [] as string[]),
      materials:    safeParse(r.materials, [] as { item: string; quantity: string }[]),
      nextStop:     r.next_stop,
      riskFlags:    safeParse(r.risk_flags, [] as string[]),
      dispatchText: r.dispatch_text,
      annotations:  r.annotations,
    });
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ...brief, crews: [...crewMap.values()] }));
}

export async function handleGenerateBrief(req: IncomingMessage, res: ServerResponse, date: string): Promise<void> {
  const parsed = parseParams(z.object({ date: dateParam }), { date });
  if (!parsed.ok) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: parsed.error }));
    return;
  }

  await generateBriefs(date);
  await handleGetBrief(req, res, date);
}

export async function handleApproveBrief(req: IncomingMessage, res: ServerResponse, date: string): Promise<void> {
  const sql = getSql();
  const [brief] = await sql`SELECT date FROM briefs WHERE date = ${date}`;
  if (!brief) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Brief not found' }));
    return;
  }

  await sql`UPDATE briefs SET approved = 1, approved_at = ${new Date().toISOString()}, approved_by = 'dashboard' WHERE date = ${date}`;
  await sql`UPDATE brief_jobs SET approved = 1 WHERE brief_date = ${date}`;
  await dispatchBriefToCrews(date);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}
