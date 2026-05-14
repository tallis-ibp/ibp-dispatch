import { getSql } from '../db/client.js';
import { addUpdate } from '../monday/addUpdate.js';
import { handleSchedulerCallback } from './schedulerBot.js';
import type { Context } from 'grammy';

export const INTENTS = {
  done:    [/\b(done|finished|complete|terminamos|terminei|listo|acabou|concluído)\b/i],
  arrived: [/\b(arrived|chegamos|chegou|llegamos|llegué|we arrived|on site)\b/i],
  working: [/\b(working|trabalhando|trabajando|started|começamos|empezamos)\b/i],
  issue:   [/\b(problem|problema|issue|trouble|blocked|stuck|ajuda|ayuda|help)\b/i],
  leaving: [/\b(leaving|saindo|saliendo|going to next|indo para)\b/i],
} as const;

export type Intent = keyof typeof INTENTS;

// 1.3
export const MESSAGES = {
  done:    { en: 'Got it — marked as complete ✅',                                        pt: 'Recebido — marcado como concluído ✅',                                      es: 'Recibido — marcado como completado ✅' },
  arrived: { en: 'Got it — arrival logged 📍',                                            pt: 'Recebido — chegada registrada 📍',                                          es: 'Recibido — llegada registrada 📍' },
  working: { en: 'Got it — work in progress 🔧',                                          pt: 'Recebido — trabalho em andamento 🔧',                                        es: 'Recibido — trabajo en curso 🔧' },
  leaving: { en: 'Got it — leaving logged 🚛',                                            pt: 'Recebido — saída registrada 🚛',                                             es: 'Recibido — salida registrada 🚛' },
  issue:   { en: "Got it — office notified, we'll be in touch shortly",                   pt: 'Recebido — o escritório foi avisado, vamos retornar em breve',              es: 'Recibido — la oficina fue avisada, le llamaremos pronto' },
  noJob:   { en: 'We have nothing scheduled for you today — please contact the office.',  pt: 'Não temos nada agendado pra você hoje — por favor contate o escritório.',  es: 'No tenemos nada programado para ti hoy — contacta a la oficina por favor.' },
} as const;

function getMsg(key: keyof typeof MESSAGES, lang: string): string {
  const entry = MESSAGES[key] as Record<string, string>;
  return entry[lang] ?? entry['en'];
}

// 1.2 — negation guard: "ainda não terminei", "not done yet", etc.
const NEGATION_BEFORE_DONE = /\b(not|nao|não|still|ainda|todavía|todavia|no)\s+\w{0,15}\s*(done|finished|complete|terminamos|terminei|listo|acabou|concluído)\b/i;

// 1.2
export function detectIntentFromText(text: string): Intent | null {
  const hasNegatedDone = NEGATION_BEFORE_DONE.test(text);
  for (const [intent, patterns] of Object.entries(INTENTS)) {
    if (intent === 'done' && hasNegatedDone) continue;
    if ((patterns as ReadonlyArray<RegExp>).some((p) => p.test(text))) return intent as Intent;
  }
  return null;
}

// 1.1 — fixed: position() for substring containment, longest match wins
export async function detectIntent(text: string): Promise<Intent | null> {
  const fromText = detectIntentFromText(text);
  if (fromText) return fromText;
  try {
    const sql = getSql();
    const [learned] = await sql<{ intent: string }[]>`
      SELECT intent FROM learned_phrases
      WHERE position(phrase IN ${text.toLowerCase()}) > 0
      ORDER BY length(phrase) DESC
      LIMIT 1
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
        { text: '⚠️ Issue',   callback_data: `issue:${jobId}` },
      ],
    ],
  };
}

// 1.3 — shared: apply a detected intent to one brief_job
async function applyIntentToJob(jobId: string, intent: Intent, ctx: Context): Promise<void> {
  const sql = getSql();
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const chatId = String(ctx.chat?.id ?? '');

  const [crew] = await sql<{ key: string; display_name: string; language: string }[]>`
    SELECT key, display_name, language FROM crews WHERE telegram_group_id = ${chatId}
  `;
  const lang = crew?.language ?? 'en';

  await sql`UPDATE brief_jobs SET check_in_status = ${intent}, last_check_in = ${now} WHERE id = ${jobId}`;

  if (intent === 'done') {
    const [job] = await sql<{ job_number: string | null; job_name: string }[]>`
      SELECT job_number, job_name FROM brief_jobs WHERE id = ${jobId}
    `;
    if (job?.job_number) {
      const [mondayItem] = await sql<{ id: string }[]>`SELECT id FROM jobs WHERE job_number = ${job.job_number}`;
      if (mondayItem) {
        await addUpdate(mondayItem.id, {
          senderName: crew?.display_name ?? 'Crew',
          timestamp: now,
          aiSummary: `✅ Crew marked job *${job.job_name}* as complete`,
          completionStatus: 'done',
        });
      }
    }
  }

  if (intent === 'issue') {
    const text = ctx.message?.text ?? 'Issue reported';
    const [job] = await sql<{ job_number: string | null }[]>`
      SELECT job_number FROM brief_jobs WHERE id = ${jobId}
    `;
    await sql`
      INSERT INTO flags (id, date, timestamp, chat_id, crew_key, sender, text)
      VALUES (
        ${'flag-' + Date.now()}, ${today}, ${now}, ${chatId},
        ${crew?.key ?? '_unknown'},
        ${ctx.message?.from?.first_name ?? 'Crew'},
        ${text}
      )
    `;
    const schedulerChatId = process.env.TELEGRAM_SCHEDULER_CHAT_ID;
    if (schedulerChatId) {
      const publicUrl = process.env.PUBLIC_URL ?? '';
      await ctx.api.sendMessage(
        schedulerChatId,
        `⚠️ Issue from ${crew?.display_name ?? 'Unknown'} on #${job?.job_number ?? '?'}: "${text}"`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: 'View in dashboard', url: `${publicUrl}/flags` }]],
          },
        },
      );
    }
  }

  await ctx.reply(getMsg(intent, lang));
}

export async function handleCallbackQuery(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  try {
    if (data.startsWith('schedule_')) {
      const date = data.split(':')[1];
      await handleSchedulerCallback(data, date);
      await ctx.answerCallbackQuery();
      return;
    }

    // 1.3 — multi-job disambiguation
    if (data.startsWith('intent_select:')) {
      const parts = data.split(':');
      const intent = parts[1] as Intent;
      const jobId = parts[2];
      if (!intent || !jobId) { await ctx.answerCallbackQuery(); return; }
      await applyIntentToJob(jobId, intent, ctx);
      await ctx.answerCallbackQuery();
      return;
    }

    const [action, jobId] = data.split(':');

    if (action === 'done') {
      await applyIntentToJob(jobId, 'done', ctx);
      await ctx.answerCallbackQuery();
      return;
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
    const [crew] = await sql<{ key: string; display_name: string; language: string }[]>`
      SELECT key, display_name, language FROM crews WHERE telegram_group_id = ${chatId}
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
      return;
    }

    // Intent detected — find today's approved brief_jobs for this crew
    const today = new Date().toISOString().slice(0, 10);
    const jobs = await sql<{ id: string; job_number: string | null; job_name: string }[]>`
      SELECT id, job_number, job_name FROM brief_jobs
      WHERE brief_date = ${today} AND crew_key = ${crew.key} AND approved = 1
    `;

    if (jobs.length === 0) {
      await ctx.reply(getMsg('noJob', crew.language));
      return;
    }

    if (jobs.length === 1) {
      await applyIntentToJob(jobs[0].id, intent, ctx);
      return;
    }

    // Multiple jobs — disambiguation keyboard
    await ctx.reply(
      intent === 'done' ? 'Which job is complete?' : 'Which job?',
      {
        reply_markup: {
          inline_keyboard: jobs.map(job => ([{
            text: `#${job.job_number ?? '?'} — ${job.job_name}`,
            callback_data: `intent_select:${intent}:${job.id}`,
          }])),
        },
      },
    );
  } catch (err) {
    console.error('[handleTextMessage] Error:', err);
  }
}
