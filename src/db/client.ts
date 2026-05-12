import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!instance) {
    const dbPath = resolve(process.env.DB_PATH ?? 'data/ibp.db');
    mkdirSync(resolve(dbPath, '..'), { recursive: true });
    instance = new Database(dbPath);
    instance.pragma('journal_mode = WAL');
    instance.pragma('foreign_keys = ON');
  }
  return instance;
}

export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
