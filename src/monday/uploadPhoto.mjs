/**
 * src/monday/uploadPhoto.mjs
 * Uploads a photo file to a Monday.com item as an asset.
 * Monday requires multipart/form-data with an embedded GraphQL mutation.
 */

import { getToken, MONDAY_FILE_URL } from "./api.mjs";

export async function uploadPhoto(mondayItemId, photoBuffer, filename = "crew-photo.jpg") {
  const mutation = `
    mutation ($file: File!) {
      add_file_to_item(item_id: ${mondayItemId}, column_id: "files", file: $file) {
        id
      }
    }
  `;

  const form = new FormData();
  // Monday expects the query as a JSON string in "query" field
  form.append("query", mutation);
  // The file variable must be named exactly as referenced in the mutation
  form.append("variables[file]", new Blob([photoBuffer], { type: "image/jpeg" }), filename);

  const res = await fetch(MONDAY_FILE_URL, {
    method:  "POST",
    headers: {
      "Authorization": getToken(),
      "API-Version":   "2024-01",
      // Do NOT set Content-Type here — fetch sets it automatically with boundary
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Monday file upload HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (data.errors?.length) {
    throw new Error(`Monday upload error: ${data.errors.map(e => e.message).join(", ")}`);
  }
  const assetId = data.data?.add_file_to_item?.id;
  console.log(`[monday] Photo uploaded to item ${mondayItemId} — asset id: ${assetId}`);
  return assetId;
}
