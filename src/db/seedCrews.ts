import { getSql } from './client.js';
import { existsSync, readFileSync } from 'fs';
import { CREW_PROFILES } from '../core/config.js';

export async function seedCrews(): Promise<void> {
  const sql = getSql();
  const [{ count }] = await sql`SELECT COUNT(*) as count FROM crews`;
  if (count > 0) return; // already seeded

  let telegramGroups: Record<string, { groupId: string; language: string }> = {};
  if (existsSync('data/crew-telegram-groups.json')) {
    telegramGroups = JSON.parse(readFileSync('data/crew-telegram-groups.json', 'utf-8'));
  }

  for (const profile of Object.values(CREW_PROFILES)) {
    const tg = telegramGroups[profile.key];
    await sql`
      INSERT INTO crews (key, display_name, telegram_group_id, language, reliability, strengths, cautions)
      VALUES (${profile.key}, ${profile.displayName}, ${tg?.groupId ?? null}, ${tg?.language ?? profile.language}, ${profile.reliability}, ${JSON.stringify(profile.strengths)}, ${JSON.stringify(profile.cautions)})
      ON CONFLICT (key) DO NOTHING
    `;
  }

  console.log('[seedCrews] Seeded crew profiles into PostgreSQL');
}
