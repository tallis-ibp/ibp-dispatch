/**
 * src/telegram/photoHandler.ts
 *
 * When a crew sends a photo on Telegram:
 * 1. Download the photo via Grammy ctx.getFile()
 * 2. Call Claude Vision to describe it + assess completion status
 * 3. Upload photo to Monday.com item
 * 4. Add a text update to that Monday.com item
 * 5. (Optional) Send a follow-up question to the crew in their language
 * 6. Save metadata to data/photos/YYYY-MM-DD/ for the dashboard feed
 */

import type { Context } from 'grammy';
import { getSql } from '../db/client.js';
import { uploadPhotoToMonday } from '../monday/uploadPhoto.js';
import { addUpdate } from '../monday/addUpdate.js';
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { resolve } from 'path';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';

// Question templates by language when job status is unclear
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
  monday_item_id: string | null;
}

interface CrewJobMatch {
  crew: CrewRecord | null;
  job: JobRecord | null;
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
  if (!photos || photos.length === 0) return;

  const chatId = String(msg.chat.id);
  const caption = msg.caption ?? '';
  const sender =
    [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'Unknown';

  // Get the highest-resolution photo version Telegram sends
  const best = photos[photos.length - 1];
  if (!best) return;

  const receivedAt = new Date().toISOString();
  console.log(`[photo] Received from ${sender} in chat ${chatId} — file_id: ${best.file_id}`);

  // Identify which crew this chat belongs to and which job
  const { crew, job } = await identifyCrewAndJob(chatId, caption);

  // Download from Telegram via Grammy
  let photoBuffer: Buffer;
  try {
    const file = await ctx.getFile();
    const filePath = file.file_path;
    if (!filePath) throw new Error('Telegram returned no file_path');

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN not set');

    const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    photoBuffer = Buffer.from(arrayBuffer);
  } catch (err) {
    console.error('[photo] Download failed:', (err as Error).message);
    return;
  }

  // Save locally
  const dateStr = receivedAt.slice(0, 10);
  const photoDir = resolve('data/photos', dateStr);
  mkdirSync(photoDir, { recursive: true });
  const filename = `${Date.now()}_${best.file_id.slice(0, 8)}.jpg`;
  const localPath = resolve(photoDir, filename);
  writeFileSync(localPath, photoBuffer);

  // Analyze with Claude Vision
  const { summary, completionStatus, shouldAsk } = await analyzePhoto(photoBuffer, {
    crewName: crew?.display_name ?? null,
    jobName: job?.job_name ?? null,
    caption,
  });

  console.log(`[photo] AI summary: "${summary}" | status: ${completionStatus}`);

  // Log to Monday.com
  let mondayUpdated = false;
  if (job?.monday_item_id) {
    try {
      await uploadPhotoToMonday(job.monday_item_id, localPath, filename);
      await addUpdate(job.monday_item_id, {
        senderName: sender,
        crewName: crew?.display_name ?? 'Unknown crew',
        timestamp: receivedAt,
        caption,
        aiSummary: summary,
        completionStatus,
      });
      mondayUpdated = true;
      console.log(`[photo] Logged to Monday item ${job.monday_item_id}`);
    } catch (err) {
      console.error('[photo] Monday write-back failed:', (err as Error).message);
    }
  } else {
    console.warn('[photo] No Monday item found — skipping write-back');
  }

  // Send follow-up question to crew if job status is unclear
  if (shouldAsk && crew?.telegram_group_id) {
    const lang = crew.language ?? 'en';
    const question = FOLLOW_UP[lang] ?? FOLLOW_UP['en'];
    try {
      await ctx.api.sendMessage(crew.telegram_group_id, question);
    } catch (err) {
      console.error('[photo] Follow-up message failed:', (err as Error).message);
    }
  }

  // Save metadata for dashboard feed
  const meta = {
    receivedAt,
    fileId: best.file_id,
    localPath,
    chatId,
    sender,
    caption,
    crewKey: crew?.key ?? null,
    crewDisplay: crew?.display_name ?? null,
    jobNumber: job?.job_number ?? null,
    jobName: job?.job_name ?? null,
    mondayItemId: job?.monday_item_id ?? null,
    aiSummary: summary,
    completionStatus,
    mondayUpdated,
  };
  const metaPath = resolve(photoDir, filename.replace('.jpg', '.json'));
  writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

// ── Claude Vision ─────────────────────────────────────────────────────────

async function analyzePhoto(
  photoBuffer: Buffer,
  context: { crewName: string | null; jobName: string | null; caption: string }
): Promise<PhotoAnalysis> {
  if (!ANTHROPIC_API_KEY) {
    console.warn('[photo] ANTHROPIC_API_KEY not set — skipping AI analysis');
    return {
      summary: 'Photo received (AI analysis not configured).',
      completionStatus: 'unknown',
      shouldAsk: true,
    };
  }

  const b64 = photoBuffer.toString('base64');
  const contextNote = [
    context.crewName ? `Crew: ${context.crewName}` : null,
    context.jobName ? `Job: ${context.jobName}` : null,
    context.caption ? `Caption: "${context.caption}"` : null,
  ]
    .filter(Boolean)
    .join('. ');

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
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    const firstBlock = response.content[0];
    const raw = firstBlock?.type === 'text' ? firstBlock.text : '';

    // Extract JSON from response
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
    return {
      summary: 'Photo received (analysis failed).',
      completionStatus: 'unknown',
      shouldAsk: false,
    };
  }
}

// ── Crew + job matching ───────────────────────────────────────────────────

async function identifyCrewAndJob(chatId: string, caption: string): Promise<CrewJobMatch> {
  const sql = getSql();

  const [crew] = await sql<CrewRecord[]>`SELECT * FROM crews WHERE telegram_group_id = ${chatId}`;
  if (!crew) return { crew: null, job: null };

  const today = new Date().toISOString().slice(0, 10);
  const numMatch = caption.match(/#(\d+)/);
  let job: JobRecord | null = null;

  if (numMatch) {
    const [found] = await sql<JobRecord[]>`
      SELECT * FROM brief_jobs
      WHERE brief_date = ${today} AND crew_key = ${crew.key} AND job_number = ${numMatch[1]} AND approved = 1
    `;
    job = found ?? null;
  }

  if (!job) {
    const jobs = await sql<JobRecord[]>`
      SELECT * FROM brief_jobs WHERE brief_date = ${today} AND crew_key = ${crew.key} AND approved = 1
    `;
    if (jobs.length === 1) {
      job = jobs[0] ?? null;
    } else if (jobs.length > 1) {
      job = jobs[0] ?? null;
      console.warn(`[photo] Ambiguous job for crew ${crew.key} — defaulting to first job #${job?.job_number}`);
    }
  }

  return { crew, job };
}
