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
