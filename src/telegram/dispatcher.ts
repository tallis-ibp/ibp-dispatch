import { getBot } from './grammy.js';
import { getSql } from '../db/client.js';
import { buildCrewJobKeyboard } from './messageHandler.js';

// Send the brief to a single crew, regardless of approval status.
// Returns the number of job messages sent.
export async function dispatchBriefToCrew(date: string, crewKey: string): Promise<number> {
  const sql = getSql();
  const bot = getBot();
  await bot.init();

  const [crew] = await sql<{ telegram_group_id: string | null; display_name: string }[]>`
    SELECT telegram_group_id, display_name FROM crews WHERE key = ${crewKey}
  `;
  if (!crew) throw new Error(`Crew not found: ${crewKey}`);
  if (!crew.telegram_group_id) throw new Error(`No Telegram group configured for ${crew.display_name}`);

  const jobs = await sql<Record<string, unknown>[]>`
    SELECT * FROM brief_jobs WHERE brief_date = ${date} AND crew_key = ${crewKey}
  `;
  if (jobs.length === 0) throw new Error(`No brief jobs for ${crew.display_name} on ${date}`);

  let sent = 0;
  for (const job of jobs) {
    await bot.api.sendMessage(crew.telegram_group_id, job['dispatch_text'] as string, {
      parse_mode: 'Markdown',
      reply_markup: buildCrewJobKeyboard(job['id'] as string),
    });
    await sql`UPDATE brief_jobs SET sent_at = ${new Date().toISOString()} WHERE id = ${job['id'] as string}`;
    sent++;
    await new Promise((r) => setTimeout(r, 300));
  }
  return sent;
}

export async function dispatchBriefToCrews(date: string): Promise<void> {
  const sql = getSql();
  const bot = getBot();

  const crews = await sql<{ crew_key: string }[]>`
    SELECT DISTINCT crew_key FROM brief_jobs WHERE brief_date = ${date} AND approved = 1
  `;

  for (const { crew_key } of crews) {
    const [crew] = await sql<{ telegram_group_id: string | null; display_name: string }[]>`
      SELECT telegram_group_id, display_name FROM crews WHERE key = ${crew_key}
    `;

    if (!crew?.telegram_group_id) {
      console.warn(`[dispatcher] No Telegram group for crew: ${crew_key}`);
      continue;
    }

    const jobs = await sql<Record<string, unknown>[]>`
      SELECT * FROM brief_jobs WHERE brief_date = ${date} AND crew_key = ${crew_key} AND approved = 1
    `;

    for (const job of jobs) {
      await bot.api.sendMessage(crew.telegram_group_id, job['dispatch_text'] as string, {
        parse_mode: 'Markdown',
        reply_markup: buildCrewJobKeyboard(job['id'] as string),
      });

      await sql`UPDATE brief_jobs SET sent_at = ${new Date().toISOString()} WHERE id = ${job['id'] as string}`;

      await new Promise((r) => setTimeout(r, 300));
    }
  }
}
