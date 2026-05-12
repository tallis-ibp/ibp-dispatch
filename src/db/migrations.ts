import { getDb } from './client.js';
import { SCHEMA } from './schema.js';

export function runMigrations(): void {
  const db = getDb();
  db.exec(SCHEMA);
}
