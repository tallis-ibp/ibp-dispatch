import { getSql } from './client.js';
import { SCHEMA } from './schema.js';

export async function runMigrations(): Promise<void> {
  const sql = getSql();
  const statements = SCHEMA
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await sql.unsafe(stmt);
  }
}
