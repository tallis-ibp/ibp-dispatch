import { getBot } from './grammy.js';
import { getDb } from '../db/client.js';
import { buildCrewJobKeyboard } from './messageHandler.js';

export async function dispatchBriefToCrews(date: string): Promise<void> {
  const db = getDb();
  const bot = getBot();

  const crews = db
    .prepare('SELECT DISTINCT crew_key FROM brief_jobs WHERE brief_date = ? AND approved = 1')
    .all(date) as Array<{ crew_key: string }>;

  for (const { crew_key } of crews) {
    const crew = db.prepare('SELECT * FROM crews WHERE key = ?').get(crew_key) as
      | { telegram_group_id: string | null; display_name: string }
      | undefined;

    if (!crew?.telegram_group_id) {
      console.warn(`[dispatcher] No Telegram group for crew: ${crew_key}`);
      continue;
    }

    const jobs = db
      .prepare('SELECT * FROM brief_jobs WHERE brief_date = ? AND crew_key = ? AND approved = 1')
      .all(date, crew_key) as Array<Record<string, unknown>>;

    for (const job of jobs) {
      await bot.api.sendMessage(crew.telegram_group_id, job.dispatch_text as string, {
        parse_mode: 'Markdown',
        reply_markup: buildCrewJobKeyboard(job.id as string),
      });

      db.prepare('UPDATE brief_jobs SET sent_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        job.id
      );

      await new Promise((r) => setTimeout(r, 300)); // avoid Telegram rate limit
    }
  }
}
