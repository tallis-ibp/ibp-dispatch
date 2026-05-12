/**
 * src/monday/addUpdate.mjs
 * Adds a text update to a Monday.com item — used after a crew photo is received.
 */

import { mondayQuery } from "./api.mjs";

const STATUS_EMOJI = {
  "done":        "✅",
  "in-progress": "🔄",
  "unknown":     "❓",
};

export async function addUpdate(mondayItemId, {
  senderName,
  crewName,
  timestamp,
  caption,
  aiSummary,
  completionStatus,
}) {
  const time   = new Date(timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const emoji  = STATUS_EMOJI[completionStatus] ?? "📸";
  const status = completionStatus === "done"        ? "Job appears COMPLETE"
               : completionStatus === "in-progress" ? "Job IN PROGRESS"
               : "Status UNKNOWN";

  const body = [
    `${emoji} *Photo received at ${time}*`,
    `👷 From: ${senderName}${crewName ? ` (${crewName})` : ""}`,
    ``,
    `*AI Summary:* ${aiSummary ?? "No description available."}`,
    `*Status:* ${status}`,
    caption ? `*Caption:* "${caption}"` : null,
  ].filter(l => l !== null).join("\n");

  const mutation = `
    mutation {
      create_update(item_id: ${mondayItemId}, body: ${JSON.stringify(body)}) {
        id
      }
    }
  `;

  const data = await mondayQuery(mutation);
  const updateId = data?.create_update?.id;
  console.log(`[monday] Update added to item ${mondayItemId} — update id: ${updateId}`);
  return updateId;
}
