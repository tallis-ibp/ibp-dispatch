/**
 * src/monday/addUpdate.ts
 * Adds a text update to a Monday.com item — used after a crew photo is received.
 */

import { mondayQuery } from './api.js';

const STATUS_EMOJI: Record<string, string> = {
  'done':        '✅',
  'in-progress': '🔄',
  'unknown':     '❓',
};

interface AddUpdateOptions {
  senderName: string;
  crewName?: string | null;
  timestamp: string;
  caption?: string | null;
  aiSummary?: string | null;
  completionStatus?: string | null;
}

interface CreateUpdateResponse {
  create_update: { id: string };
}

export async function addUpdate(itemId: string, {
  senderName,
  crewName,
  timestamp,
  caption,
  aiSummary,
  completionStatus,
}: AddUpdateOptions): Promise<void> {
  const time  = new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const emoji = STATUS_EMOJI[completionStatus ?? ''] ?? '📸';
  const status =
    completionStatus === 'done'        ? 'Job appears COMPLETE'
    : completionStatus === 'in-progress' ? 'Job IN PROGRESS'
    : 'Status UNKNOWN';

  const body = [
    `${emoji} *Photo received at ${time}*`,
    `👷 From: ${senderName}${crewName ? ` (${crewName})` : ''}`,
    '',
    `*AI Summary:* ${aiSummary ?? 'No description available.'}`,
    `*Status:* ${status}`,
    caption ? `*Caption:* "${caption}"` : null,
  ].filter((l): l is string => l !== null).join('\n');

  const mutation = `
    mutation {
      create_update(item_id: ${itemId}, body: ${JSON.stringify(body)}) {
        id
      }
    }
  `;

  const data = await mondayQuery<CreateUpdateResponse>(mutation);
  const updateId = data?.create_update?.id;
  console.log(`[monday] Update added to item ${itemId} — update id: ${updateId}`);
}
