import { getSql } from '../db/client.js';
import { addUpdate } from '../monday/addUpdate.js';
import type { Context } from 'grammy';

export const INTENTS = {
  done: [/\b(done|finished|complete|terminamos|terminei|listo|acabou|concluído)\b/i],
  arrived: [/\b(arrived|chegamos|chegou|llegamos|llegué|we arrived|on site)\b/i],
  working: [/\b(working|trabalhando|trabajando|started|começamos|empezamos)\b/i],
  issue: [/\b(problem|problema|issue|trouble|blocked|stuck|ajuda|ayuda|help)\b/i],
  leaving: [/\b(leaving|saindo|saliendo|going to next|indo para)\b/i],
} as const;

export type Intent = keyof typeof INTENTS;

export function detectIntentFromText(text: string): Intent | null {
  for (const [intent, patterns] of Object.entries(INTENTS)) {
    if ((patterns as ReadonlyArray<RegExp>).some((p) => p.test(text))) return intent as Intent;
  }
  return null;
}

export async function detectIntent(text: string): Promise<Intent | null> {
  const fromText = detectIntentFromText(text);
  if (fromText) return fromText;

  try {
    const sql = getSql();
    const [learned] = await sql<{ intent: string }[]>`
      SELECT intent FROM learned_phrases WHERE ${text.toLowerCase()} LIKE phrase
    `;
    return (learned?.intent as Intent) ?? null;
  } catch {
    return null;
  }
}

export function buildCrewJobKeyboard(jobId: string) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Job Done', callback_data: `done:${jobId}` },
        { text: '⚠️ Issue', callback_data: `issue:${jobId}` },
      ],
    ],
  };
}

export async function handleCallbackQuery(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  try {
    const [action, jobId] = data.split(':');
    const sql = getSql();

    if (action === 'done') {
      await sql`UPDATE brief_jobs SET check_in_status = 'done', last_check_in = ${new Date().toISOString()} WHERE id = ${jobId}`;
      const [job] = await sql<{ job_number: string; job_name: string }[]>`SELECT job_number, job_name FROM brief_jobs WHERE id = ${jobId}`;
      if (job?.job_number) {
        const [mondayItem] = await sql<{ id: string }[]>`SELECT id FROM jobs WHERE job_number = ${job.job_number}`;
        if (mondayItem) {
          await addUpdate(mondayItem.id, {
            senderName: 'Crew',
            timestamp: new Date().toISOString(),
            aiSummary: `✅ Crew marked job *${job.job_name}* as complete`,
            completionStatus: 'done',
          });
        }
      }
      await ctx.answerCallbackQuery('Marked as done ✅');
      await ctx.reply('Got it — job marked as complete ✅');
    }

    if (action === 'issue') {
      await ctx.answerCallbackQuery();
      await ctx.reply('Please describe the issue and we will notify the scheduler right away.');
    }
  } catch (err) {
    console.error('[handleCallbackQuery] Error:', err);
    await ctx.answerCallbackQuery('Error processing request').catch(() => undefined);
  }
}

export async function handleTextMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text;
  const chatId = String(ctx.chat?.id);
  if (!text || !chatId) return;
  if (text.startsWith('/')) return;

  try {
    const intent = await detectIntent(text);
    const sql = getSql();
    const [crew] = await sql<{ key: string; display_name: string }[]>`
      SELECT key, display_name FROM crews WHERE telegram_group_id = ${chatId}
    `;

    if (!crew) return;

    if (!intent) {
      await sql`
        INSERT INTO flags (id, date, timestamp, chat_id, crew_key, sender, text)
        VALUES (
          ${'flag-' + Date.now()},
          ${new Date().toISOString().slice(0, 10)},
          ${new Date().toISOString()},
          ${chatId},
          ${crew.key},
          ${ctx.message?.from?.first_name ?? 'Unknown'},
          ${text}
        )
      `;
    }
  } catch (err) {
    console.error('[handleTextMessage] Error:', err);
  }
}
