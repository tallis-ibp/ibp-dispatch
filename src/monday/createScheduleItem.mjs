/**
 * src/monday/createScheduleItem.mjs
 * Creates a new item in the IBP CREW SCHEDULE board (18403925605)
 * when a scheduling proposal is approved.
 */

import { mondayQuery } from "./api.mjs";

const BOARD_ID  = "18403925605";
const GROUP_ID  = "group_mm1ejvbe"; // FUTURE JOBS group

// Maps our crewKey → IBP CREW SCHEDULE CREW column status index
const CREW_STATUS_ID = {
  penna:            0,
  fausto:           2,
  waype:            4,
  santiago:         7,
  ludwing_tarcizio: 8,
  mauro_tile:       12,
  mario_wilcher:    107,
  gervin_julio:     109,
  // fallback to UNASSIGNED (17) for anything not mapped
};

// Maps job type keyword → JOB TYPE column status index
const JOB_TYPE_STATUS_ID = {
  "DECK INSTALL":   7,
  "DECK":           7,
  "COPING":         4,
  "DRIVEWAY":       0,
  "PAVERS":         0,
  "WALKWAY":        0,
  "REPAIR":         2,
  "PATIO":          8,
  "BACK PATIO":     8,
  "SEALER":         9,
  "PRESSURE WASH":  16,
  "GROUT":          103,
  "FIRE PIT":       11,
  "GRADING":        18,
  "DEMO":           19,
  "STACKED STONE":  107,
};

export async function createScheduleItem(proposal) {
  const crewStatusId  = CREW_STATUS_ID[proposal.proposedCrew] ?? 17; // 17 = UNASSIGNED
  const primaryType   = (proposal.jobTypes?.[0] ?? "").toUpperCase().trim();
  const jobTypeId     = JOB_TYPE_STATUS_ID[primaryType] ?? 0;

  const columnValues = {
    color_mm1e5f8b:  { index: crewStatusId },          // CREW
    date_mm1eqd6q:   { date: proposal.proposedDate },   // DATE
    color_mm1ejpzt:  { index: 7 },                      // STATUS = SCHEDULED
    color_mm1ekwrd:  { index: 0 },                      // MARKET = ORLANDO
    color_mm1e17hr:  { index: jobTypeId },              // JOB TYPE
    text_mm1eeyeb:   proposal.address ?? "",            // LOCATION / ADDRESS
    color_mm1e2gma:  { index: 17 },                     // LOGISTICS CONFIRMED = PENDING
    long_text_mm1evs68: proposal.notes
      ? { text: proposal.notes }
      : { text: `Material: ${proposal.materialNote ?? ""}${proposal.equipmentNeeded ? ` | Equipment: ${proposal.equipmentNeeded}` : ""}` },
  };

  const mutation = `
    mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
      create_item(
        board_id: $boardId,
        group_id: $groupId,
        item_name: $itemName,
        column_values: $columnValues
      ) {
        id
        name
        url
      }
    }
  `;

  const data = await mondayQuery(mutation, {
    boardId:      BOARD_ID,
    groupId:      GROUP_ID,
    itemName:     proposal.jobName,
    columnValues: JSON.stringify(columnValues),
  });

  const item = data?.create_item;
  console.log(`[schedule-item] Created "${item?.name}" (id: ${item?.id}) in IBP CREW SCHEDULE`);
  return item;
}
