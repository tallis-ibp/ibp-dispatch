import Anthropic from '@anthropic-ai/sdk';
import { getSql } from '../db/client.js';
import type { Job, CrewProfile, ScheduleProposal } from '../types/index.js';
import { randomUUID } from 'crypto';

// Read crew profiles from the crews table so dashboard edits to skills,
// cautions, and reliability actually influence next-morning proposals.
// (Previously the agent read CREW_PROFILES from src/core/config.ts — a
// hard-coded snapshot that ignored everything the user did in the UI.)
async function loadCrewProfilesFromDb(): Promise<CrewProfile[]> {
  const sql = getSql();
  // Only include crews with reliability set — that's the dispatcher's signal
  // that the crew is "ready for AI scheduling". Admin/test crews left null.
  const rows = await sql<Array<{
    key: string;
    display_name: string;
    telegram_group_id: string | null;
    language: string | null;
    reliability: string | null;
    strengths: string | null;
    cautions: string | null;
  }>>`
    SELECT key, display_name, telegram_group_id, language, reliability, strengths, cautions
    FROM crews
    WHERE reliability IS NOT NULL
    ORDER BY key
  `;
  const safeParse = (s: string | null, fallback: string[]): string[] => {
    if (!s) return fallback;
    try { const v = JSON.parse(s); return Array.isArray(v) ? v : fallback; }
    catch { return fallback; }
  };
  return rows.map((r) => ({
    key: r.key,
    displayName: r.display_name,
    telegramGroupId: r.telegram_group_id,
    language: (r.language ?? 'en') as CrewProfile['language'],
    reliability: (r.reliability ?? 'medium') as CrewProfile['reliability'],
    strengths: safeParse(r.strengths, []),
    cautions:  safeParse(r.cautions,  []),
  }));
}

const client = new Anthropic();

export function buildSchedulingPrompt(jobs: Job[], crews: CrewProfile[], date: string): string {
  return `You are a scheduling assistant for IBP Group, a paver and pool-deck construction company in Florida.

Today's date: ${date}

## Jobs available to schedule (material confirmed ready)
${jobs.map((j) => `- #${j.jobNumber} | ${j.itemName} | Type: ${j.jobType ?? 'unknown'} | Address: ${j.address ?? 'TBD'} | Trailers: ${j.trailerNeeded.join(', ') || 'none'}`).join('\n')}

## Available crews
${crews.map((c) => `- ${c.key} (${c.displayName}) | Reliability: ${c.reliability} | Skills: ${c.strengths.join(', ')} | Cautions: ${c.cautions.join(', ') || 'none'}`).join('\n')}

## Scheduling rules (MUST follow)
1. coping and tile jobs ONLY assign to Toby or Fausto
2. Big slab / gooseneck jobs → prefer Marcelao or Waype
3. Penna is detail-work only — do NOT assign large deck installs
4. Do NOT propose a job if material_ready is false
5. Jobs in gated communities → prefer high-reliability crews
6. Flag jobs with no gate code as confidence: low
7. Never assign two crews to the same job on the same day

## Output format
Return a JSON array with one object per crew assignment:
[
  {
    "crewKey": "santiago",
    "jobNumber": "600049",
    "jobName": "GILROY #600049",
    "reasoning": "Santiago is a high-reliability deck crew. Job #600049 is a deck install with confirmed materials.",
    "confidence": "high"
  }
]

Only return the JSON array. No explanation outside it.`;
}

export async function generateProposals(date: string): Promise<ScheduleProposal[]> {
  const sql = getSql();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const jobRows = await sql<Array<Record<string, unknown>>>`
    SELECT * FROM jobs WHERE status IN ('NEED_TO_SCHEDULE', 'SCHEDULED_JOB') AND material_ready = 1
  `;

  const crews = await loadCrewProfilesFromDb();
  if (crews.length === 0) {
    console.warn('[schedulingAgent] No crews in DB — skipping proposal generation');
    return [];
  }

  const prompt = buildSchedulingPrompt(
    jobRows.map((j) => ({
      ...j,
      equipmentNeeded: JSON.parse(j['equipment_needed'] as string ?? '[]'),
      trailerNeeded: JSON.parse(j['trailer_needed'] as string ?? '[]'),
      materialReady: Boolean(j['material_ready']),
    })) as Job[],
    crews,
    date
  );

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
  let parsed: Array<{
    crewKey: string;
    jobNumber: string;
    jobName: string;
    reasoning: string;
    confidence: 'high' | 'medium' | 'low';
  }>;

  try {
    parsed = JSON.parse(text);
  } catch {
    console.error('[schedulingAgent] Failed to parse Claude response:', text);
    return [];
  }

  const now = new Date().toISOString();
  const proposals: ScheduleProposal[] = parsed.map((p) => ({
    id: randomUUID(),
    date,
    generatedAt: now,
    crewKey: p.crewKey,
    jobNumber: p.jobNumber,
    jobName: p.jobName,
    reasoning: p.reasoning,
    confidence: p.confidence,
    status: 'pending' as const,
  }));

  // Clear existing proposals for this date before inserting fresh ones
  await sql`DELETE FROM schedule_proposals WHERE date = ${date}`;

  for (const p of proposals) {
    await sql`
      INSERT INTO schedule_proposals (id, date, generated_at, crew_key, job_number, job_name, reasoning, confidence, status)
      VALUES (${p.id}, ${p.date}, ${p.generatedAt}, ${p.crewKey}, ${p.jobNumber}, ${p.jobName}, ${p.reasoning}, ${p.confidence}, ${p.status})
    `;
  }

  return proposals;
}
