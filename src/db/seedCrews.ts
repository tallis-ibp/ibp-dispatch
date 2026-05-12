import { getDb } from './client.js';
import { existsSync, readFileSync } from 'fs';
import { CREW_PROFILES } from '../core/config.js';

export function seedCrews(): void {
  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) as c FROM crews').get() as { c: number }).c;
  if (count > 0) return; // already seeded

  let telegramGroups: Record<string, { groupId: string; language: string }> = {};
  if (existsSync('data/crew-telegram-groups.json')) {
    telegramGroups = JSON.parse(readFileSync('data/crew-telegram-groups.json', 'utf-8'));
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO crews (key, display_name, telegram_group_id, language, reliability, strengths, cautions)
    VALUES (@key, @displayName, @telegramGroupId, @language, @reliability, @strengths, @cautions)
  `);

  const insertMany = db.transaction(() => {
    for (const profile of Object.values(CREW_PROFILES)) {
      const tg = telegramGroups[profile.key];
      insert.run({
        key: profile.key,
        displayName: profile.displayName,
        telegramGroupId: tg?.groupId ?? null,
        language: tg?.language ?? profile.language,
        reliability: profile.reliability,
        strengths: JSON.stringify(profile.strengths),
        cautions: JSON.stringify(profile.cautions),
      });
    }
  });

  insertMany();
  console.log('[seedCrews] Seeded crew profiles into SQLite');
}
