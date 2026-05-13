import Anthropic from '@anthropic-ai/sdk';
import { getSql } from '../db/client.js';
import { CREW_PROFILES } from '../core/config.js';
import type { Job, CrewProfile, ScheduleProposal } from '../types/index.js';
import { randomUUID } from 'crypto';

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

  const crews = Object.values(CREW_PROFILES);

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

  await sql.begin(async (tx) => {
    for (const p of proposals) {
      await tx`
        INSERT INTO schedule_proposals (id, date, generated_at, crew_key, job_number, job_name, reasoning, confidence, status)
        VALUES (${p.id}, ${p.date}, ${p.generatedAt}, ${p.crewKey}, ${p.jobNumber}, ${p.jobName}, ${p.reasoning}, ${p.confidence}, ${p.status})
        ON CONFLICT (id) DO UPDATE SET
          reasoning = EXCLUDED.reasoning,
          confidence = EXCLUDED.confidence,
          status = EXCLUDED.status
      `;
    }
  });

  return proposals;
}
