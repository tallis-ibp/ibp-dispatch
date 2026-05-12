/**
 * src/telegram/dispatcher.mjs
 * Sends approved daily brief to each crew's Telegram group.
 * One message per job — matches the WhatsApp dispatch format crews already know.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sendMessage } from "./bot.mjs";
import { buildDispatchMessage } from "../generateBriefs.mjs";

const ROOT = decodeURIComponent(new URL("../..", import.meta.url).pathname);

export async function sendBrief(brief) {
  const results = [];

  for (const crew of brief.crews) {
    if (!crew.telegramGroupId) {
      console.log(`[dispatcher] Skipping ${crew.crewKey} — no Telegram group configured`);
      results.push({ crewKey: crew.crewKey, status: "skipped", reason: "no group id" });
      continue;
    }

    const sent = [];
    for (const job of crew.jobs) {
      try {
        // Build localized dispatch message
        const text = buildDispatchMessage({
          jobName:    job.jobName,
          jobNumber:  job.jobNumber,
          address:    job.address,
          gateCode:   job.gateCode,
          supervisor: job.supervisor ?? "",
          trailer:    job.trailerType ?? "",
          tasks:      job.tasks ?? [],
          materials:  job.materials ?? [],
          nextStop:   job.nextStop ?? "Warehouse",
          language:   crew.language ?? "en",
        });

        // Append coordinator annotations if any
        const fullText = job.annotations
          ? `${text}\n\n_Nota: ${job.annotations}_`
          : text;

        await sendMessage(crew.telegramGroupId, fullText);
        sent.push(job.jobNumber);
        console.log(`[dispatcher] Sent job #${job.jobNumber} to ${crew.crewKey}`);

        // Brief delay between messages to avoid Telegram rate limits
        await sleep(300);
      } catch (err) {
        console.error(`[dispatcher] Failed to send job #${job.jobNumber} to ${crew.crewKey}:`, err.message);
      }
    }

    crew.sentAt   = new Date().toISOString();
    crew.sentJobs = sent;
    results.push({ crewKey: crew.crewKey, status: "sent", jobs: sent });
  }

  // Persist updated brief with sentAt timestamps
  try {
    const briefPath = path.join(ROOT, "data/briefs", `${brief.date}.json`);
    await writeFile(briefPath, JSON.stringify(brief, null, 2));
  } catch (err) {
    console.error("[dispatcher] Failed to update brief file:", err.message);
  }

  console.log(`[dispatcher] Done. Results:`, results);
  return results;
}

export async function sendCrewBrief(brief, crewKey) {
  const crew = brief.crews.find(c => c.crewKey === crewKey);
  if (!crew) throw new Error(`Crew ${crewKey} not found in brief`);
  return sendBrief({ ...brief, crews: [crew] });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
