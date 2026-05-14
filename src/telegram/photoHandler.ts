import type { Context } from 'grammy';
import { getSql } from '../db/client.js';
import { addUpdate } from '../monday/addUpdate.js';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';

const FOLLOW_UP: Record<string, string> = {
  en: 'Is the job complete for today? Reply YES or NO.',
  es: '¿Terminaron el trabajo de hoy? Responde SÍ o NO.',
  pt: 'O trabalho foi concluído hoje? Responda SIM ou NÃO.',
};

interface CrewRecord {
  key: string;
  display_name: string;
  telegram_group_id: string | null;
  language: string | null;
}

interface JobRecord {
  id: string;
  job_number: string;
  job_name: string;
}

interface CrewJobMatch {
  crew: CrewRecord | null;
  job: JobRecord | null;
  mondayItemId: string | null;  // Bug B fix: resolved from jobs table, not brief_jobs
}

interface PhotoAnalysis {
  summary: string;
  completionStatus: string;
  shouldAsk: boolean;
}

export async function handlePhotoMessage(ctx: Context): Promise<void> {
  const msg = ctx.message;
  if (!msg) return;

  const photos = msg.photo;
  if (!photos?.length) return;

  const best = photos[photos.length - 1];
  if (!best) return;

  const chatId = String(msg.chat.id);
  const caption = msg.caption ?? '';
  const sender = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'Unknown';
  const receivedAt = new Date().toISOString();
  const today = receivedAt.slice(0, 10);

  const schedulerChatId = process.env.TELEGRAM_SCHEDULER_CHAT_ID;
  const isAdmin = !!schedulerChatId && chatId === schedulerChatId;

  // Download photo from Telegram
  let photoBuffer: Buffer;
  try {
    const file = await ctx.getFile();
    const filePath = file.file_path;
    if (!filePath) throw new Error('Telegram returned no file_path');
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN not set');
    const res = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
    if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
    photoBuffer = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.error('[photo] Download failed:', (err as Error).message);
    return;
  }

  const sql = getSql();

  // 1.5 — admin test path
  if (isAdmin) {
    const { summary, completionStatus } = await analyzePhoto(photoBuffer, {
      crewName: 'Admin test', jobName: null, caption,
    });
    await sql`
      INSERT INTO photos (id, date, received_at, file_id, local_path, chat_id, sender, caption,
        crew_key, job_number, monday_item_id, ai_summary, completion_status, monday_updated)
      VALUES (
        ${randomUUID()}, ${today}, ${receivedAt}, ${best.file_id}, ${null},
        ${chatId}, ${sender}, ${caption || null},
        ${'_admin_test'}, ${null}, ${null}, ${summary}, ${completionStatus}, ${0}
      )
    `;
    await ctx.reply(`Foto recebida — análise: ${summary}`);
    return;
  }

  // Crew path — 1.5: ignore chats that don't match a registered crew
  const { crew, job, mondayItemId } = await identifyCrewAndJob(chatId, caption);
  if (!crew) return;

  const { summary, completionStatus, shouldAsk } = await analyzePhoto(photoBuffer, {
    crewName: crew.display_name,
    jobName: job?.job_name ?? null,
    caption,
  });

  console.log(`[photo] Received from ${crew.display_name} — summary: "${summary}" | status: ${completionStatus}`);

  // Monday text update (binary photo upload requires local file — deferred)
  let mondayUpdated = false;
  if (mondayItemId) {
    try {
      await addUpdate(mondayItemId, {
        senderName: sender,
        crewName: crew.display_name,
        timestamp: receivedAt,
        caption,
        aiSummary: summary,
        completionStatus,
      });
      mondayUpdated = true;
    } catch (err) {
      console.error('[photo] Monday write-back failed:', (err as Error).message);
    }
  } else {
    console.warn(`[photo] No Monday item for crew ${crew.key} job ${job?.job_number ?? 'unknown'} — skipping write-back`);
  }

  // Bug A fix: persist to photos DB table so Photos tab can display it
  await sql`
    INSERT INTO photos (id, date, received_at, file_id, local_path, chat_id, sender, caption,
      crew_key, job_number, monday_item_id, ai_summary, completion_status, monday_updated)
    VALUES (
      ${randomUUID()}, ${today}, ${receivedAt}, ${best.file_id}, ${null},
      ${chatId}, ${sender}, ${caption || null},
      ${crew.key}, ${job?.job_number ?? null}, ${mondayItemId ?? null},
      ${summary}, ${completionStatus}, ${mondayUpdated ? 1 : 0}
    )
  `;

  if (shouldAsk && crew.telegram_group_id) {
    const lang = crew.language ?? 'en';
    const question = FOLLOW_UP[lang] ?? FOLLOW_UP['en']!;
    await ctx.api.sendMessage(crew.telegram_group_id, question);
  }
}

// ── Claude Vision ──────────────────────────────────────────────────────────

async function analyzePhoto(
  photoBuffer: Buffer,
  context: { crewName: string | null; jobName: string | null; caption: string },
): Promise<PhotoAnalysis> {
  if (!ANTHROPIC_API_KEY) {
    console.warn('[photo] ANTHROPIC_API_KEY not set — skipping AI analysis');
    return { summary: 'Photo received (AI analysis not configured).', completionStatus: 'unknown', shouldAsk: true };
  }

  const b64 = photoBuffer.toString('base64');
  const contextNote = [
    context.crewName ? `Crew: ${context.crewName}` : null,
    context.jobName  ? `Job: ${context.jobName}` : null,
    context.caption  ? `Caption: "${context.caption}"` : null,
  ].filter(Boolean).join('. ');

  const prompt = `You are analyzing a construction site photo sent by a paver/pool-deck crew.

Context: ${contextNote || 'No context provided.'}

Look at this photo carefully and provide:
1. A 1-2 sentence description of what is shown (materials visible, work stage, site condition).
2. Whether the job appears DONE, IN-PROGRESS, or UNKNOWN based on what you see.
3. Whether a follow-up question should be sent to the crew (true if status is unclear).

Respond in this exact JSON format:
{
  "summary": "...",
  "completionStatus": "done" | "in-progress" | "unknown",
  "shouldAsk": true | false
}`;

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
          { type: 'text', text: prompt },
        ],
      }],
    });

    const firstBlock = response.content[0];
    const raw = firstBlock?.type === 'text' ? firstBlock.text : '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as Partial<PhotoAnalysis>;
      return {
        summary: parsed.summary ?? 'Photo received.',
        completionStatus: parsed.completionStatus ?? 'unknown',
        shouldAsk: parsed.shouldAsk ?? true,
      };
    }
    return { summary: raw.slice(0, 200), completionStatus: 'unknown', shouldAsk: true };
  } catch (err) {
    console.error('[photo] Claude Vision error:', (err as Error).message);
    return { summary: 'Photo received (analysis failed).', completionStatus: 'unknown', shouldAsk: false };
  }
}

// ── Crew + job matching ─────────────────────────────────────────────────────

async function identifyCrewAndJob(chatId: string, caption: string): Promise<CrewJobMatch> {
  const sql = getSql();
  const [crew] = await sql<CrewRecord[]>`SELECT * FROM crews WHERE telegram_group_id = ${chatId}`;
  if (!crew) return { crew: null, job: null, mondayItemId: null };

  const today = new Date().toISOString().slice(0, 10);
  const numMatch = caption.match(/#(\d+)/);
  let job: JobRecord | null = null;

  if (numMatch) {
    const [found] = await sql<JobRecord[]>`
      SELECT id, job_number, job_name FROM brief_jobs
      WHERE brief_date = ${today} AND crew_key = ${crew.key}
        AND job_number = ${numMatch[1]} AND approved = 1
    `;
    job = found ?? null;
  }

  if (!job) {
    const jobs = await sql<JobRecord[]>`
      SELECT id, job_number, job_name FROM brief_jobs
      WHERE brief_date = ${today} AND crew_key = ${crew.key} AND approved = 1
    `;
    if (jobs.length === 1) {
      job = jobs[0] ?? null;
    } else if (jobs.length > 1) {
      job = jobs[0] ?? null;
      console.warn(`[photo] Ambiguous job for crew ${crew.key} — defaulting to first job #${job?.job_number}`);
    }
  }

  // Bug B fix: Monday item ID lives in jobs.id, not in brief_jobs
  let mondayItemId: string | null = null;
  if (job?.job_number) {
    const [mondayJob] = await sql<{ id: string }[]>`SELECT id FROM jobs WHERE job_number = ${job.job_number}`;
    mondayItemId = mondayJob?.id ?? null;
  }

  return { crew, job, mondayItemId };
}
