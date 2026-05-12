/**
 * src/monday/api.ts
 * Thin GraphQL wrapper for the Monday.com API v2.
 */

const MONDAY_API_URL = 'https://api.monday.com/v2';
export const MONDAY_FILE_URL = 'https://api.monday.com/v2/file';

export function getToken(): string {
  const token = process.env.MONDAY_API_KEY ?? '';
  if (!token) throw new Error('MONDAY_API_KEY not set in environment');
  return token;
}

export async function mondayQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getToken(),
      'API-Version': '2024-01',
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Monday API HTTP ${res.status}: ${text}`);
  }

  const data = await res.json() as { data?: T; errors?: Array<{ message: string }> };
  if (data.errors?.length) {
    throw new Error(`Monday API error: ${data.errors.map(e => e.message).join(', ')}`);
  }
  if (!data.data) throw new Error('Monday API returned no data');
  return data.data;
}
