/**
 * src/monday/fetchJobs.ts
 * Fetches active jobs from Monday.com GENERAL JOBS IBP board.
 */

import { mondayQuery } from './api.js';
import type { Job } from '../types/index.js';

const BOARD_ID = process.env.MONDAY_BOARD_ID ?? '2214820863';

// STAGE column label IDs
export const STAGE = {
  NEED_TO_SCHEDULE: 3,
  SCHEDULED_JOB:   7,
  SCHEDULED_COPING: 8,
  WORKING_ON:      0,
  COMPLETED:       1,
  PRESITE_DONE:    2,
} as const;

interface ColumnValue {
  id: string;
  text: string;
  value: string;
}

interface MondayItem {
  id: string;
  name: string;
  column_values: ColumnValue[];
}

interface MondayBoardsResponse {
  boards: Array<{
    items_page: {
      items: MondayItem[];
    };
  }>;
}

const STAGE_LABELS: Record<number, string> = {
  [STAGE.NEED_TO_SCHEDULE]: 'NEED TO SCHEDULE',
  [STAGE.SCHEDULED_JOB]:    'SCHEDULED JOB',
  [STAGE.SCHEDULED_COPING]: 'SCHEDULED COPING',
  [STAGE.WORKING_ON]:       'WORKING ON',
  [STAGE.COMPLETED]:        'COMPLETED',
  [STAGE.PRESITE_DONE]:     'PRESITE DONE',
};

export async function fetchJobsNeedingSchedule(): Promise<Job[]> {
  return fetchJobsByStage([STAGE.NEED_TO_SCHEDULE]);
}

export async function fetchJobsByStage(stageIds: number[]): Promise<Job[]> {
  const baseQuery = `
    query ($boardId: ID!) {
      boards(ids: [$boardId]) {
        items_page(limit: 100QUERY_PARAMS) {
          items {
            id
            name
            column_values(ids: [
              "estado3",
              "location",
              "men__desplegable",
              "dup__of_log_status",
              "dup__of_coping_material",
              "date__1",
              "estado6",
              "builder",
              "people3",
              "text25",
              "dup__of_base_status"
            ]) {
              id
              text
              value
            }
          }
        }
      }
    }
  `;

  let queryStr: string;
  if (stageIds.length === 1) {
    const label = STAGE_LABELS[stageIds[0]];
    queryStr = baseQuery.replace(
      'QUERY_PARAMS',
      `, query_params: { rules: [{ column_id: "estado3", compare_value: "${label}", operator: contains_terms }] }`,
    );
  } else {
    // No server-side filter — fetch all and filter client-side
    queryStr = baseQuery.replace('QUERY_PARAMS', '');
  }

  const data = await mondayQuery<MondayBoardsResponse>(queryStr, { boardId: BOARD_ID });
  let items: MondayItem[] = data?.boards?.[0]?.items_page?.items ?? [];

  // Client-side filter for multi-stage queries
  if (stageIds.length > 1) {
    const targetLabels = new Set(stageIds.map(id => STAGE_LABELS[id]).filter(Boolean));
    items = items.filter(item => {
      const stageVal = item.column_values?.find(c => c.id === 'estado3')?.text ?? '';
      return targetLabels.has(stageVal.toUpperCase());
    });
  }

  return items.map(item => normalizeItem(item));
}

export async function fetchJobsFromMonday(): Promise<Job[]> {
  return fetchJobsByStage([
    STAGE.NEED_TO_SCHEDULE,
    STAGE.SCHEDULED_JOB,
    STAGE.SCHEDULED_COPING,
    STAGE.WORKING_ON,
  ]);
}

export async function setJobStage(itemId: string, stageId: number): Promise<void> {
  const mutation = `
    mutation ($itemId: ID!, $boardId: ID!, $value: JSON!) {
      change_column_value(item_id: $itemId, board_id: $boardId, column_id: "estado3", value: $value) {
        id
      }
    }
  `;
  await mondayQuery(mutation, {
    itemId: String(itemId),
    boardId: BOARD_ID,
    value: JSON.stringify({ index: stageId }),
  });
}

// ── Normalise raw Monday item → Job interface ─────────────────────────────

function normalizeItem(item: MondayItem): Job {
  const col = colMap(item.column_values);

  const logStatus    = col('dup__of_log_status')?.toUpperCase() ?? '';
  const copingStatus = col('dup__of_coping_material')?.toUpperCase() ?? '';
  const equipment    = col('estado6')?.toUpperCase() ?? '';
  const deliveryDate = col('date__1') ?? null;
  const stageText    = col('estado3')?.toUpperCase() ?? '';
  const rawJobTypes  = (col('men__desplegable') ?? '').split(/[,/]/).map(s => s.trim()).filter(Boolean);
  const rawLocation  = col('location') ?? '';

  // Derive city from location (last comma-separated segment, trim state/zip)
  const city = deriveCity(rawLocation);

  // Determine status string from stage column
  const status = stageText || null;

  // Derive material readiness
  const materialReady = deriveReadiness(logStatus, copingStatus);

  // Determine equipment needed
  const equipmentNeeded: string[] = [];
  if (equipment.includes('GOOSENECK')) equipmentNeeded.push('gooseneck');
  else if (equipment.includes('DUMP')) equipmentNeeded.push('dump-trailer');

  // Extract customer name and job number from item name
  const jobNumber = extractJobNumber(item.name) ?? '';
  const customerName = extractCustomerName(item.name);

  return {
    id:              item.id,
    jobNumber,
    itemName:        item.name,
    customerName,
    address:         rawLocation || null,
    city,
    clientType:      col('builder') ?? null,
    jobType:         rawJobTypes.length > 0 ? rawJobTypes.join(', ') : null,
    status,
    materialStatus:  col('dup__of_log_status') ?? null,
    materialReady,
    equipmentNeeded,
    trailerNeeded:   deriveTrailers(equipment),
    driverNeeded:    equipmentNeeded.length > 0 || deriveTrailers(equipment).length > 0,
    logisticsStatus: col('dup__of_log_status') ?? null,
    promisedDate:    deliveryDate,
    notes:           col('text25') ?? null,
    syncedAt:        new Date().toISOString(),
  };
}

function deriveReadiness(logStatus: string, copingStatus: string): boolean | null {
  if (logStatus.includes('AWAITING') || copingStatus.includes('AWAITING')) return false;
  if (logStatus === 'DELIVERED' || copingStatus === 'DELIVERED') return true;
  if (logStatus.includes('NEEDS PICK UP') || copingStatus.includes('NEEDS PICK UP')) return false;
  if (copingStatus.includes('BY BUILDER') || copingStatus.includes('BY HO')) return true;
  if (logStatus === 'NA' && copingStatus === 'NA') return true;
  return null;
}

function deriveTrailers(equipment: string): string[] {
  if (equipment.includes('GOOSENECK')) return ['gooseneck'];
  if (equipment.includes('DUMP')) return ['dump'];
  if (equipment.includes('FLAT')) return ['flat'];
  return [];
}

function extractJobNumber(name: string): string | null {
  const m = name.match(/#(\d+)/);
  return m ? m[1] : null;
}

function extractCustomerName(name: string): string | null {
  // Pattern: "CUSTOMER NAME #123456" — take everything before the #
  const m = name.match(/^(.+?)\s*#\d+/);
  return m ? m[1].trim() : name.trim() || null;
}

function deriveCity(location: string): string | null {
  if (!location) return null;
  const parts = location.split(',');
  if (parts.length >= 2) {
    // Second-to-last or last part often has city
    return parts[parts.length >= 3 ? parts.length - 2 : parts.length - 1].trim() || null;
  }
  return null;
}

function colMap(columnValues: ColumnValue[]): (id: string) => string | null {
  const map = new Map(columnValues.map(c => [c.id, c.text]));
  return (id: string) => map.get(id) ?? null;
}
