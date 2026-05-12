/**
 * src/monday/fetchJobs.mjs
 * Fetches active jobs from Monday.com GENERAL JOBS IBP board.
 */

import { mondayQuery } from "./api.mjs";

const BOARD_ID = "2214820863";

// STAGE column label IDs
export const STAGE = {
  NEED_TO_SCHEDULE: 3,
  SCHEDULED_JOB:   7,
  SCHEDULED_COPING: 8,
  WORKING_ON:      0,
  COMPLETED:       1,
  PRESITE_DONE:    2,
};

export async function fetchJobsNeedingSchedule() {
  return fetchJobsByStage([STAGE.NEED_TO_SCHEDULE]);
}

export async function fetchJobsByStage(stageIds) {
  const query = `
    query ($boardId: ID!) {
      boards(ids: [$boardId]) {
        items_page(limit: 100, query_params: { rules: $rules }) {
          items {
            id
            name
            url
            updated_at
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

  // Monday API status filters work with contains_terms + label text
  const stageLabels = {
    [STAGE.NEED_TO_SCHEDULE]: "NEED TO SCHEDULE",
    [STAGE.SCHEDULED_JOB]:    "SCHEDULED JOB",
    [STAGE.SCHEDULED_COPING]: "SCHEDULED COPING",
    [STAGE.WORKING_ON]:       "WORKING ON",
    [STAGE.COMPLETED]:        "COMPLETED",
    [STAGE.PRESITE_DONE]:     "PRESITE DONE",
  };

  // For a single stage use contains_terms; for multiple, fetch all and filter client-side
  const variables = { boardId: BOARD_ID };
  let queryStr = query;

  if (stageIds.length === 1) {
    const label = stageLabels[stageIds[0]];
    queryStr = queryStr.replace(
      "query_params: { rules: $rules }",
      `query_params: { rules: [{ column_id: "estado3", compare_value: "${label}", operator: contains_terms }] }`
    );
  } else {
    // No filter — fetch all and filter below
    queryStr = queryStr.replace("query_params: { rules: $rules }", "");
  }

  const data = await mondayQuery(queryStr, variables);
  let items = data?.boards?.[0]?.items_page?.items ?? [];

  // Client-side filter for multi-stage queries
  if (stageIds.length > 1) {
    const targetLabels = new Set(stageIds.map(id => stageLabels[id]).filter(Boolean));
    items = items.filter(item => {
      const stageVal = item.column_values?.find(c => c.id === "estado3")?.text ?? "";
      return targetLabels.has(stageVal.toUpperCase());
    });
  }

  return items.map(normalizeJob);
}

export async function setJobStage(itemId, stageId) {
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

// ── Normalise raw Monday item → clean job object ──────────────────────────

function normalizeJob(item) {
  const col = colMap(item.column_values);

  const logStatus     = col("dup__of_log_status")?.toUpperCase() ?? "";
  const copingStatus  = col("dup__of_coping_material")?.toUpperCase() ?? "";
  const equipment     = col("estado6")?.toUpperCase() ?? "";
  const deliveryDate  = col("date__1") ?? null;
  const jobTypes      = (col("men__desplegable") ?? "").split(/[,/]/).map(s => s.trim()).filter(Boolean);

  return {
    mondayItemId:    item.id,
    itemName:        item.name,
    url:             item.url,
    updatedAt:       item.updated_at,
    jobNumber:       extractJobNumber(item.name),
    address:         col("location") ?? "",
    jobTypes,
    logisticsStatus: col("dup__of_log_status") ?? "",
    copingMaterial:  col("dup__of_coping_material") ?? "",
    baseStatus:      col("dup__of_base_status") ?? "",
    deliveryDate,
    equipmentNeeded: normalizeEquipment(equipment),
    builder:         col("builder") ?? "",
    materialSpec:    col("text25") ?? "",
    materialReadiness: deriveMaterialReadiness(logStatus, copingStatus, deliveryDate),
  };
}

function deriveMaterialReadiness(logStatus, copingStatus, deliveryDate) {
  // Blocked until delivery
  if (logStatus.includes("AWAITING") || copingStatus.includes("AWAITING")) {
    return { status: "awaiting-delivery", readyDate: deliveryDate, note: `Awaiting delivery${deliveryDate ? ` — expected ${deliveryDate}` : ""}` };
  }
  // Delivered
  if (logStatus === "DELIVERED" || copingStatus === "DELIVERED") {
    return { status: "ready", readyDate: null, note: "Materials delivered" };
  }
  // Needs logistics pickup run
  if (logStatus.includes("NEEDS PICK UP") || copingStatus.includes("NEEDS PICK UP")) {
    return { status: "needs-pickup", readyDate: null, note: "Material needs pickup run before crew arrives" };
  }
  // Provided by homeowner/builder
  if (copingStatus.includes("BY BUILDER") || copingStatus.includes("BY HO")) {
    return { status: "ready", readyDate: null, note: "Material provided by builder/homeowner" };
  }
  // Not applicable
  if (logStatus === "NA" && copingStatus === "NA") {
    return { status: "ready", readyDate: null, note: "No material delivery needed" };
  }
  return { status: "unknown", readyDate: null, note: "Material status unclear — verify before scheduling" };
}

function normalizeEquipment(raw) {
  if (raw.includes("GOOSENECK")) return "gooseneck";
  if (raw.includes("DUMP")) return "dump-trailer";
  return null;
}

function extractJobNumber(name) {
  const m = name.match(/#(\d+)/);
  return m ? m[1] : null;
}

function colMap(columnValues) {
  const map = new Map(columnValues.map(c => [c.id, c.text]));
  return id => map.get(id) ?? null;
}
