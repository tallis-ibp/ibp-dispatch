import { getBot } from './grammy.js';
import { getSql } from '../db/client.js';
import { buildCrewJobKeyboard } from './messageHandler.js';

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
