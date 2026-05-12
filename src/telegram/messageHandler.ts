import { getDb } from '../db/client.js';
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

export function detectIntent(text: string): Intent | null {
  for (const [intent, patterns] of Object.entries(INTENTS)) {
    if ((patterns as ReadonlyArray<RegExp>).some((p) => p.test(text))) return intent as Intent;
  }
  // Check learned phrases from DB
  try {
    const db = getDb();
    const learned = db
      .prepare('SELECT intent FROM learned_phrases WHERE ? LIKE phrase')
      .get(text.toLowerCase()) as { intent: string } | undefined;
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

  const [action, jobId] = data.split(':');
  const db = getDb();

  if (action === 'done') {
    db.prepare('UPDATE brief_jobs SET check_in_status = ?, last_check_in = ? WHERE id = ?').run(
      'done',
      new Date().toISOString(),
      jobId
    );
    const job = db.prepare('SELECT * FROM brief_jobs WHERE id = ?').get(jobId) as
      | { job_number: string; job_name: string }
      | undefined;
    if (job?.job_number) {
      const mondayItem = db
        .prepare('SELECT id FROM jobs WHERE job_number = ?')
        .get(job.job_number) as { id: string } | undefined;
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
}

export async function handleTextMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text;
  const chatId = String(ctx.chat?.id);
  if (!text || !chatId) return;

  const intent = detectIntent(text);
  const db = getDb();
  const crew = db
    .prepare('SELECT key, display_name FROM crews WHERE telegram_group_id = ?')
    .get(chatId) as { key: string; display_name: string } | undefined;

  if (!crew) return;

  if (!intent) {
    db.prepare(`
      INSERT INTO flags (id, date, timestamp, chat_id, crew_key, sender, text)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `flag-${Date.now()}`,
      new Date().toISOString().slice(0, 10),
      new Date().toISOString(),
      chatId,
      crew.key,
      ctx.message?.from?.first_name ?? 'Unknown',
      text
    );
  }
}
