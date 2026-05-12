/**
 * src/monday/api.mjs
 * Thin GraphQL wrapper for the Monday.com API v2.
 */

const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_FILE_URL = "https://api.monday.com/v2/file";

export function getToken() {
  const token = process.env.MONDAY_API_KEY ?? "";
  if (!token) throw new Error("MONDAY_API_KEY not set in environment");
  return token;
}

export async function mondayQuery(query, variables = {}) {
  const res = await fetch(MONDAY_API_URL, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": getToken(),
      "API-Version":   "2024-01",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Monday API HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (data.errors?.length) {
    throw new Error(`Monday API error: ${data.errors.map(e => e.message).join(", ")}`);
  }
  return data.data;
}

export { MONDAY_FILE_URL };
