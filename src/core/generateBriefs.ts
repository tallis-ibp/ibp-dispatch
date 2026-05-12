/**
 * generateBriefs.ts
 * Reads schedule-records.json + jobs table for a given date,
 * writes brief header + brief_jobs rows to SQLite.
 * Mirrors the business logic of src/generateBriefs.mjs.
 */

import { getDb } from '../db/client.js';
import { readFileSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import type { ScheduleRecord } from '../types/index.js';

// ---------------------------------------------------------------------------
// Known gate codes — extend as more are confirmed
// ---------------------------------------------------------------------------
const KNOWN_GATE_CODES: Record<string, string> = {
  '300021': '#8020', // Moreno-Sanchez — confirmed Apr 25 2026
};

// ---------------------------------------------------------------------------
// Multilingual dispatch labels
// ---------------------------------------------------------------------------
type Lang = 'en' | 'es' | 'pt';

const LABELS: Record<Lang, Record<string, string>> = {
  en: { addr: 'ADDRESS', gate: 'GATE CODE', sup: 'SUP', trailer: 'TRAILER', task: 'TASK', mat: 'MATERIAL', next: 'NEXT' },
  es: { addr: 'DIRECCIÓN', gate: 'CÓDIGO GATE', sup: 'SUP', trailer: 'TRÁILER', task: 'TAREA', mat: 'MATERIAL', next: 'PRÓXIMO' },
  pt: { addr: 'ENDEREÇO', gate: 'CÓDIGO GATE', sup: 'SUP', trailer: 'TRAILER', task: 'TAREFA', mat: 'MATERIAL', next: 'PRÓXIMO' },
};

function getLabels(lang: string): Record<string, string> {
  return LABELS[lang as Lang] ?? LABELS.en;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizeNum(n: string | number | null | undefined): string {
  return String(n ?? '').replace(/^0+/, '').trim();
}

interface Material {
  item: string;
  quantity: string;
}

interface DbJob {
  job_number: string;
  item_name: string;
  address: string | null;
  city: string | null;
  material_ready: number | null;
  trailer_needed: string;
  driver_needed: number;
  logistics_status: string | null;
  monday_item_id?: string | null;
}

function buildRiskFlags(job: DbJob | undefined): string[] {
  const flags: string[] = [];
  if (!job) {
    flags.push('No Monday job match found');
    return flags;
  }
  if (job.material_ready === 0) flags.push('Material not confirmed ready');
  if (job.material_ready === null) flags.push('Material status unknown — verify');
  const trailerNeeded: string[] = JSON.parse(job.trailer_needed ?? '[]') as string[];
  if (job.driver_needed) flags.push('Driver/logistics run needed');
  if (trailerNeeded.includes('gooseneck')) flags.push('Gooseneck trailer required');
  if (job.logistics_status) flags.push(job.logistics_status);
  return flags;
}

function buildMaterials(job: DbJob | undefined): Material[] {
  const materials: Material[] = [];
  if (!job) return materials;
  const trailerNeeded: string[] = JSON.parse(job.trailer_needed ?? '[]') as string[];
  if (trailerNeeded.length > 0) {
    materials.push({ item: 'Trailer', quantity: trailerNeeded.join(', ') });
  }
  return materials;
}

function buildDispatchText(opts: {
  jobName: string;
  jobNumber: string | null;
  address: string;
  gateCode: string;
  supervisor: string;
  trailer: string;
  tasks: string[];
  materials: Material[];
  nextStop: string;
  language: string;
}): string {
  const { jobName, jobNumber, address, gateCode, supervisor, trailer, tasks, materials, nextStop, language } = opts;
  const L = getLabels(language);
  const matLines = materials.map((m) => `- ${m.item}: ${m.quantity}`).join('\n');
  const taskLines = tasks.join('\n');
  const title = jobNumber && !jobName.includes(`#${jobNumber}`)
    ? `${jobName} #${jobNumber}`
    : jobName;

  return [
    `*${title}*`,
    ``,
    `*${L.addr}:* ${address || 'TBD'}`,
    `*${L.gate}:* ${gateCode || 'NA'}`,
    `*${L.sup}:* ${supervisor || 'TBD'}`,
    trailer ? `*${L.trailer}:* ${trailer}` : null,
    ``,
    `*${L.task}:*`,
    taskLines,
    matLines ? `\n*${L.mat}:*\n${matLines}` : null,
    ``,
    `*${L.next}:* ${nextStop}`,
  ]
    .filter((l) => l !== null)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export async function generateBriefs(date: string): Promise<void> {
  const db = getDb();

  // Read schedule records from JSON (transition: later tasks move this to DB)
  const scheduleRaw = existsSync('data/schedule-records.json')
    ? (JSON.parse(readFileSync('data/schedule-records.json', 'utf-8')) as { records?: ScheduleRecord[] } | ScheduleRecord[])
    : { records: [] };

  const allRecords: ScheduleRecord[] = Array.isArray(scheduleRaw)
    ? scheduleRaw
    : (scheduleRaw.records ?? []);

  const dayRecords = allRecords.filter((r) => r.date === date && r.status === 'assigned');

  // Read crew language preferences from SQLite (seeded by seedCrews)
  const crewRows = db.prepare('SELECT key, language FROM crews').all() as Array<{ key: string; language: string }>;
  const crewLanguage = new Map(crewRows.map((r) => [r.key, r.language]));

  // Read jobs from SQLite, indexed by normalised job number
  const jobRows = db.prepare('SELECT * FROM jobs').all() as DbJob[];
  const jobByNum = new Map(jobRows.map((j) => [normalizeNum(j.job_number), j]));

  // Insert/replace brief header
  db.prepare(`
    INSERT OR REPLACE INTO briefs (date, generated_at, approved, approved_at, approved_by)
    VALUES (?, ?, 0, NULL, NULL)
  `).run(date, new Date().toISOString());

  // Clear existing brief_jobs for this date so re-runs are idempotent
  db.prepare('DELETE FROM brief_jobs WHERE brief_date = ?').run(date);

  // Group records by crewKey (mirrors generateBriefs.mjs grouping)
  const byCrewKey = new Map<string, ScheduleRecord[]>();
  for (const rec of dayRecords) {
    const key = rec.crewKey;
    if (!byCrewKey.has(key)) byCrewKey.set(key, []);
    byCrewKey.get(key)!.push(rec);
  }

  const insertJob = db.prepare(`
    INSERT INTO brief_jobs (
      id, brief_date, crew_key, job_number, job_name, address, gate_code,
      supervisor, trailer_type, tasks, materials, next_stop, risk_flags,
      dispatch_text, check_in_status, last_check_in, approved, sent_at, annotations
    ) VALUES (
      @id, @briefDate, @crewKey, @jobNumber, @jobName, @address, @gateCode,
      @supervisor, @trailerType, @tasks, @materials, @nextStop, @riskFlags,
      @dispatchText, NULL, NULL, 0, NULL, NULL
    )
  `);

  let totalJobs = 0;

  db.transaction(() => {
    for (const [crewKey, recs] of byCrewKey) {
      const lang = crewLanguage.get(crewKey) ?? 'en';

      for (const rec of recs) {
        const jobNums = rec.jobNumbers ?? [];

        // One brief_jobs row per job number (mirrors mjs flatMap behaviour)
        const numbers = jobNums.length > 0 ? jobNums : [null];

        for (const jobNum of numbers) {
          const job = jobNum ? jobByNum.get(normalizeNum(jobNum)) : undefined;
          const trailerArr: string[] = job ? (JSON.parse(job.trailer_needed ?? '[]') as string[]) : [];
          const gateCode = jobNum ? (KNOWN_GATE_CODES[normalizeNum(jobNum)] ?? '') : '';
          const materials = buildMaterials(job);
          const riskFlags = buildRiskFlags(job);
          const jobName = job?.item_name ?? rec.rawAssignment;
          const address = job?.address ?? '';
          const trailer = trailerArr.join(', ');

          const dispatchText = buildDispatchText({
            jobName,
            jobNumber: jobNum,
            address,
            gateCode,
            supervisor: '',
            trailer,
            tasks: [rec.rawAssignment],
            materials,
            nextStop: 'Warehouse',
            language: lang,
          });

          insertJob.run({
            id: randomUUID(),
            briefDate: date,
            crewKey,
            jobNumber: jobNum ?? null,
            jobName,
            address: address || null,
            gateCode: gateCode || null,
            supervisor: null,
            trailerType: trailer || null,
            tasks: JSON.stringify([rec.rawAssignment]),
            materials: JSON.stringify(materials),
            nextStop: 'Warehouse',
            riskFlags: JSON.stringify(riskFlags),
            dispatchText,
          });

          totalJobs++;
        }
      }
    }
  })();

  console.log(
    `[generateBriefs] Generated brief for ${date} with ${byCrewKey.size} crews, ${totalJobs} job entries`,
  );
}

// ---------------------------------------------------------------------------
// Direct invocation: tsx src/core/generateBriefs.ts [YYYY-MM-DD]
// ---------------------------------------------------------------------------
if (process.argv[1]?.endsWith('generateBriefs.ts') || process.argv[1]?.endsWith('generateBriefs.js')) {
  const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  generateBriefs(date).catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
