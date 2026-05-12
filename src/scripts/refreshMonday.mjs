/**
 * src/scripts/refreshMonday.mjs
 * Pulls all active jobs from GENERAL JOBS IBP and writes data/monday-jobs.json.
 * Run: node --env-file=.env src/scripts/refreshMonday.mjs
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { mondayQuery } from "../monday/api.mjs";

const ROOT     = decodeURIComponent(new URL("../..", import.meta.url).pathname);
const OUT_PATH = path.join(ROOT, "data/monday-jobs.json");
const BOARD_ID = "2214820863";

// STAGE label IDs to exclude (already done)
const SKIP_STAGES = new Set(["1"]); // 1 = COMPLETED

async function fetchAllActiveJobs() {
  const query = `
    query ($boardId: ID!, $cursor: String) {
      boards(ids: [$boardId]) {
        items_page(limit: 100, cursor: $cursor, query_params: {
          rules: [{ column_id: "estado3", compare_value: "COMPLETED", operator: not_contains_text }]
        }) {
          cursor
          items {
            id
            name
            url
            updated_at
            column_values(ids: [
              "estado3", "location", "texto", "men__desplegable",
              "dup__of_log_status", "dup__of_coping_material",
              "date__1", "dup__of_delivery_date__1",
              "estado6", "builder", "people3", "text25",
              "dup__of_base_status", "status1__1", "status0__1",
              "dup__of_coping_store", "dropdown"
            ]) { id text value }
          }
        }
      }
    }
  `;

  const items = [];
  let cursor  = null;

  do {
    const data = await mondayQuery(query, { boardId: BOARD_ID, cursor });
    const page = data?.boards?.[0]?.items_page;
    if (!page) break;
    items.push(...(page.items ?? []));
    cursor = page.cursor ?? null;
  } while (cursor);

  return items;
}

function normalizeJob(item) {
  const col = id => item.column_values.find(c => c.id === id)?.text ?? null;

  const logStatus    = (col("dup__of_log_status") ?? "").toUpperCase();
  const copingStatus = (col("dup__of_coping_material") ?? "").toUpperCase();
  const equipment    = (col("estado6") ?? "").toUpperCase();
  const stage        = col("estado3") ?? "";
  const jobTypesRaw  = col("men__desplegable") ?? "";

  const trailerNeeded = [];
  if (equipment.includes("GOOSENECK")) trailerNeeded.push("gooseneck");
  if (equipment.includes("DUMP"))      trailerNeeded.push("dump trailer");
  if (equipment.includes("TRUCK"))     trailerNeeded.push("truck");

  const materialReady =
    logStatus === "DELIVERED" || copingStatus === "DELIVERED" ||
    copingStatus.includes("BY BUILDER") || copingStatus === "NA" && logStatus === "NA";

  const driverNeeded =
    logStatus.includes("NEEDS PICK UP") || equipment.includes("GOOSENECK") ||
    equipment.includes("DUMP") || logStatus.includes("BIG LOGISTIC");

  const jobNumber = (item.name.match(/#(\d+)/) ?? [])[1] ?? null;
  const addressRaw = col("location") ?? "";

  return {
    jobNumber,
    mondayItemId:         item.id,
    boardName:            "GENERAL JOBS IBP",
    itemName:             item.name,
    customerName:         item.name.replace(/#\d+/, "").trim(),
    address:              addressRaw,
    city:                 col("texto") ?? "",
    clientType:           inferClientType(item.name),
    jobType:              jobTypesRaw,
    status:               stage,
    permitStatus:         col("status1__1") ?? "",
    hoaStatus:            col("status0__1") ?? "",
    materialType:         col("text25") ?? null,
    deckMaterialStatus:   col("dup__of_base_status") ?? null,
    copingMaterialStatus: col("dup__of_coping_material") ?? null,
    logisticsComplexity:  col("dup__of_log_status") ?? null,
    deliveryDateDeck:     col("date__1") ?? null,
    deliveryDateCoping:   col("dup__of_delivery_date__1") ?? null,
    trailerType:          equipment || null,
    materialReady,
    driverNeeded,
    trailerNeeded:        trailerNeeded.length ? trailerNeeded : null,
    skidSteerNeeded:      null,
    concretePumpNeeded:   null,
    warehouseSupportNeeded: null,
    logisticsStatus:      buildLogisticsNote(logStatus, copingStatus, equipment),
    logisticsOwner:       col("people3") ?? "",
    notes:                "",
    mondayUrl:            item.url,
    updatedAt:            item.updated_at,
  };
}

function buildLogisticsNote(logStatus, copingStatus, equipment) {
  const parts = [];
  if (logStatus && logStatus !== "NA") parts.push(`Deck: ${logStatus}`);
  if (copingStatus && copingStatus !== "NA") parts.push(`Coping: ${copingStatus}`);
  if (equipment && !["CHECK / NA", "NA"].includes(equipment)) parts.push(`Equipment: ${equipment}`);
  return parts.join(" | ") || null;
}

function inferClientType(name) {
  const num = (name.match(/#(\d+)/) ?? [])[1] ?? "";
  if (num.startsWith("17")) return "retail/homeowner";
  if (num.startsWith("28")) return "builder/project";
  if (num.startsWith("30")) return "pool builder/production";
  if (num.startsWith("60")) return "special";
  if (num.startsWith("80")) return "commercial/internal";
  return "unknown";
}

// ── Main ──────────────────────────────────────────────────────────────────
const rawItems = await fetchAllActiveJobs();
const jobs     = rawItems.map(normalizeJob);

const output = {
  generatedAt: new Date().toISOString(),
  source:      "GENERAL JOBS IBP (board 2214820863)",
  boards: [{ boardId: BOARD_ID, boardName: "GENERAL JOBS IBP", purpose: "Source of truth for active and upcoming jobs" }],
  jobs,
};

await writeFile(OUT_PATH, JSON.stringify(output, null, 2));
console.log(`✓ monday-jobs.json updated — ${jobs.length} jobs written to ${OUT_PATH}`);
