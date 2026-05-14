import type { IncomingMessage, ServerResponse } from 'http';
import { getSql } from '../../db/client.js';

// GET /api/photos?date=YYYY-MM-DD
// Returns photos joined with crew display_name as crewDisplay, ordered by received_at DESC, limit 50
export async function handleGetPhotos(req: IncomingMessage, res: ServerResponse, date: string): Promise<void> {
  const sql = getSql();
  const photos = await sql`
    SELECT
      p.id,
      p.date,
      p.received_at,
      p.file_id,
      p.local_path,
      p.chat_id,
      p.sender,
      p.caption,
      p.crew_key,
      p.job_number,
      p.monday_item_id,
      p.ai_summary,
      p.completion_status,
      p.monday_updated,
      c.display_name AS "crewDisplay"
    FROM photos p
    LEFT JOIN crews c ON c.key = p.crew_key
    WHERE p.date = ${date}
    ORDER BY p.received_at DESC
    LIMIT 50
  `;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(photos));
}
