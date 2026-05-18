import { getSql } from '../db/client.js';

/**
 * Upsert the telegram_chats row for a chat we have just received a message
 * from. Updates last_seen, refreshes the title if Telegram gave us a new one,
 * and inserts the row if we have never seen the chat before (e.g. the
 * my_chat_member event was dropped).
 *
 * Returns true if this was a brand-new chat (caller may want to send a
 * welcome message), false if it already existed.
 */
export async function recordChatActivity(
  chatId: string,
  type: string,
  title: string | null,
): Promise<boolean> {
  const sql = getSql();
  const now = new Date().toISOString();
  // Try to update first; if no row, insert.
  const updated = await sql<{ chat_id: string }[]>`
    UPDATE telegram_chats
    SET last_seen = ${now},
        title     = COALESCE(${title}::text, title),
        type      = ${type},
        status    = 'active'
    WHERE chat_id = ${chatId}
    RETURNING chat_id
  `;
  if (updated.length > 0) return false;

  await sql`
    INSERT INTO telegram_chats (chat_id, type, title, joined_at, last_seen, status)
    VALUES (${chatId}, ${type}, ${title}, ${now}, ${now}, 'active')
    ON CONFLICT (chat_id) DO UPDATE SET
      last_seen = EXCLUDED.last_seen,
      title     = COALESCE(EXCLUDED.title, telegram_chats.title),
      status    = 'active'
  `;
  return true;
}

/**
 * Make sure every crew with a non-null telegram_group_id has a matching row
 * in telegram_chats (with linked_crew_key set), so the dashboard can show
 * the existing links even if my_chat_member never fired (e.g. legacy crews
 * that were linked via the old modal before this table existed).
 *
 * Idempotent — safe to run on every cold start and after wipe operations.
 */
export async function backfillTelegramChatsFromCrews(): Promise<number> {
  const sql = getSql();
  const now = new Date().toISOString();
  const inserted = await sql<{ chat_id: string }[]>`
    INSERT INTO telegram_chats (chat_id, type, title, joined_at, last_seen, status, linked_crew_key)
    SELECT
      c.telegram_group_id,
      CASE WHEN c.telegram_group_id LIKE '-%' THEN 'group' ELSE 'private' END,
      c.display_name,
      ${now},
      ${now},
      'active',
      c.key
    FROM crews c
    WHERE c.telegram_group_id IS NOT NULL
    ON CONFLICT (chat_id) DO UPDATE SET
      linked_crew_key = EXCLUDED.linked_crew_key,
      status = CASE WHEN telegram_chats.status = 'active' THEN telegram_chats.status ELSE 'active' END
    RETURNING chat_id
  `;
  return inserted.length;
}

/**
 * Bot was removed / kicked from a chat — mark the status so the dashboard
 * can show "⚠️ bot kicked".
 */
export async function markChatLeft(chatId: string, status: 'left' | 'kicked'): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE telegram_chats
    SET status = ${status}, last_seen = ${new Date().toISOString()}
    WHERE chat_id = ${chatId}
  `;
}
