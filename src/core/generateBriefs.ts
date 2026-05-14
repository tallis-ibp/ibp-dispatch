import { getSql } from '../db/client.js';
import { readFileSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import type { ScheduleRecord } from '../types/index.js';

const KNOWN_GATE_CODES: Record<string, string> = {
  '300021': '#8020',
};

type Lang = 'en' | 'es' | 'pt';

const LABELS: Record<Lang, Record<string, string>> = {
  en: { addr: 'ADDRESS', gate: 'GATE CODE', sup: 'SUP', trailer: 'TRAILER', task: 'TASK', mat: 'MATERIAL', next: 'NEXT' },
  es: { addr: 'DIRECCIÓN', gate: 'CÓDIGO GATE', sup: 'SUP', trailer: 'TRÁILER', task: 'TAREA', mat: 'MATERIAL', next: 'PRÓXIMO' },
  pt: { addr: 'ENDEREÇO', gate: 'CÓDIGO GATE', sup: 'SUP', trailer: 'TRAILER', task: 'TAREFA', mat: 'MATERIAL', next: 'PRÓXIMO' },
};

function getLabels(lang: string): Record<string, string> {
  return LABELS[lang as Lang] ?? LABELS.en;
}

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

async function generateBriefsFromProposals(
  date: string,
  crewLanguage: Map<string, string>,
  jobByNum: Map<string, DbJob>,
): Promise<number> {
  const sql = getSql();

  const proposalRows = await sql<Array<{
    crew_key: string;
    job_number: string | null;
    job_name: string | null;
    reasoning: string | null;
  }>>`
    SELECT crew_key, job_number, job_name, reasoning
    FROM schedule_proposals
    WHERE date = ${date} AND status = 'approved'
  `;

  if (proposalRows.length === 0) return 0;

  let totalJobs = 0;

  await sql.begin(async (tx) => {
    for (const prop of proposalRows) {
      const lang = crewLanguage.get(prop.crew_key) ?? 'en';
      const job = prop.job_number ? jobByNum.get(normalizeNum(prop.job_number)) : undefined;
      const trailerArr: string[] = job ? (JSON.parse(job.trailer_needed ?? '[]') as string[]) : [];
      const gateCode = prop.job_number ? (KNOWN_GATE_CODES[normalizeNum(prop.job_number)] ?? '') : '';
      const materials = buildMaterials(job);
      const riskFlags = buildRiskFlags(job);
      const jobName = job?.item_name ?? prop.job_name ?? 'TBD';
      const address = job?.address ?? '';
      const trailer = trailerArr.join(', ');

      const dispatchText = buildDispatchText({
        jobName,
        jobNumber: prop.job_number ?? null,
        address,
        gateCode,
        supervisor: '',
        trailer,
        tasks: [prop.reasoning ?? jobName],
        materials,
        nextStop: 'Warehouse',
        language: lang,
      });

      await tx`
        INSERT INTO brief_jobs (
          id, brief_date, crew_key, job_number, job_name, address, gate_code,
          supervisor, trailer_type, tasks, materials, next_stop, risk_flags,
          dispatch_text, check_in_status, last_check_in, approved, sent_at, annotations
        ) VALUES (
          ${randomUUID()}, ${date}, ${prop.crew_key}, ${prop.job_number ?? null}, ${jobName},
          ${address || null}, ${gateCode || null}, ${null}, ${trailer || null},
          ${JSON.stringify([prop.reasoning ?? jobName])}, ${JSON.stringify(materials)},
          ${'Warehouse'}, ${JSON.stringify(riskFlags)}, ${dispatchText},
          ${null}, ${null}, ${0}, ${null}, ${null}
        )
      `;
      totalJobs++;
    }
  });

  return totalJobs;
}

export async function generateBriefs(date: string): Promise<void> {
  const sql = getSql();

  const scheduleRaw = existsSync('data/schedule-records.json')
    ? (JSON.parse(readFileSync('data/schedule-records.json', 'utf-8')) as { records?: ScheduleRecord[] } | ScheduleRecord[])
    : { records: [] };

  const allRecords: ScheduleRecord[] = Array.isArray(scheduleRaw)
    ? scheduleRaw
    : (scheduleRaw.records ?? []);

  const dayRecords = allRecords.filter((r) => r.date === date && r.status === 'assigned');

  const crewRows = await sql<Array<{ key: string; language: string }>>`SELECT key, language FROM crews`;
  const crewLanguage = new Map(crewRows.map((r) => [r.key, r.language]));

  const jobRows = await sql<DbJob[]>`SELECT * FROM jobs`;
  const jobByNum = new Map(jobRows.map((j) => [normalizeNum(j.job_number), j]));

  await sql`
    INSERT INTO briefs (date, generated_at, approved, approved_at, approved_by)
    VALUES (${date}, ${new Date().toISOString()}, 0, NULL, NULL)
    ON CONFLICT (date) DO UPDATE SET generated_at = EXCLUDED.generated_at, approved = 0
  `;

  await sql`DELETE FROM brief_jobs WHERE brief_date = ${date}`;

  // If no schedule records (Vercel — file doesn't exist), fall back to approved proposals
  if (dayRecords.length === 0) {
    const totalJobs = await generateBriefsFromProposals(date, crewLanguage, jobByNum);
    console.log(`[generateBriefs] ${date}: no schedule records — used ${totalJobs} approved proposals`);
    return;
  }

  const byCrewKey = new Map<string, ScheduleRecord[]>();
  for (const rec of dayRecords) {
    const key = rec.crewKey;
    if (!byCrewKey.has(key)) byCrewKey.set(key, []);
    byCrewKey.get(key)!.push(rec);
  }

  let totalJobs = 0;

  await sql.begin(async (tx) => {
    for (const [crewKey, recs] of byCrewKey) {
      const lang = crewLanguage.get(crewKey) ?? 'en';

      for (const rec of recs) {
        const jobNums = rec.jobNumbers ?? [];
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

          await tx`
            INSERT INTO brief_jobs (
              id, brief_date, crew_key, job_number, job_name, address, gate_code,
              supervisor, trailer_type, tasks, materials, next_stop, risk_flags,
              dispatch_text, check_in_status, last_check_in, approved, sent_at, annotations
            ) VALUES (
              ${randomUUID()}, ${date}, ${crewKey}, ${jobNum ?? null}, ${jobName},
              ${address || null}, ${gateCode || null}, ${null}, ${trailer || null},
              ${JSON.stringify([rec.rawAssignment])}, ${JSON.stringify(materials)},
              ${'Warehouse'}, ${JSON.stringify(riskFlags)}, ${dispatchText},
              ${null}, ${null}, ${0}, ${null}, ${null}
            )
          `;

          totalJobs++;
        }
      }
    }
  });

  console.log(`[generateBriefs] Generated brief for ${date} with ${byCrewKey.size} crews, ${totalJobs} job entries`);
}

if (process.argv[1]?.endsWith('generateBriefs.ts') || process.argv[1]?.endsWith('generateBriefs.js')) {
  const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  generateBriefs(date).catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
