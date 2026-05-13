import postgres from 'postgres';

let instance: ReturnType<typeof postgres> | null = null;

export function getSql(): ReturnType<typeof postgres> {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set');
    instance = postgres(url, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false, // required for Supabase PgBouncer transaction mode
    });
  }
  return instance;
}

export async function closeSql(): Promise<void> {
  if (instance) {
    await instance.end();
    instance = null;
  }
}
