/**
 * src/monday/fetchFleet.mjs
 * Reads Fleet Events board for a given date and returns taken trailers + vehicles.
 * Board ID: 18396858502
 */

import { mondayQuery } from "./api.mjs";

const BOARD_ID = "18396858502";

export async function fetchFleetCheckouts(dateStr) {
  const query = `
    query ($boardId: ID!) {
      boards(ids: [$boardId]) {
        items_page(limit: 100, query_params: {
          rules: [{ column_id: "date4", compare_value: ["${dateStr}", "EXACT"], operator: any_of }]
        }) {
          items {
            id
            name
            column_values(ids: ["color_mkzwqvmh", "color_mkzw21w7", "color_mkzwsz4"]) {
              id
              text
            }
          }
        }
      }
    }
  `;

  const data = await mondayQuery(query, { boardId: BOARD_ID });
  const items = data?.boards?.[0]?.items_page?.items ?? [];

  const trailers = new Set();
  const vehicles = new Set();
  const equipment = new Set();

  for (const item of items) {
    const col = id => item.column_values.find(c => c.id === id)?.text ?? null;
    const trailer  = col("color_mkzwqvmh");
    const vehicle  = col("color_mkzw21w7");
    const equip    = col("color_mkzwsz4");
    if (trailer)  trailers.add(trailer);
    if (vehicle)  vehicles.add(vehicle);
    if (equip)    equipment.add(equip);
  }

  return {
    date:      dateStr,
    trailers:  [...trailers],
    vehicles:  [...vehicles],
    equipment: [...equipment],
    checkouts: items.length,
  };
}
