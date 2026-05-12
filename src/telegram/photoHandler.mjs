/**
 * src/telegram/photoHandler.mjs
 *
 * When a crew sends a photo on Telegram:
 * 1. Download the photo
 * 2. Call Claude Vision to describe it + assess completion status
 * 3. Upload photo to Monday.com item
 * 4. Add a text update to that Monday.com item
 * 5. (Optional) Send a follow-up question to the crew in their language
 * 6. Save metadata to data/photos/YYYY-MM-DD/ for the dashboard feed
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { downloadFile, sendMessage } from "./bot.mjs";
import { uploadPhoto }  from "../monday/uploadPhoto.mjs";
import { addUpdate }    from "../monday/addUpdate.mjs";

const ROOT = decodeURIComponent(new URL("../..", import.meta.url).pathname);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

// Question templates by language when job status is unclear
const FOLLOW_UP = {
  en: "Is the job complete for today? Reply YES or NO.",
  es: "¿Terminaron el trabajo de hoy? Responde SÍ o NO.",
  pt: "O trabalho foi concluído hoje? Responda SIM ou NÃO.",
};

export async function handlePhoto(update) {
  const msg     = update.message;
  const chatId  = msg.chat.id;
  const caption = msg.caption ?? "";
  const sender  = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || "Unknown";

  // Get the highest-resolution photo version Telegram sends
  const photos  = msg.photo ?? [];
  const best    = photos.at(-1);
  if (!best) return;

  const receivedAt = new Date().toISOString();
  console.log(`[photo] Received from ${sender} in chat ${chatId} — file_id: ${best.file_id}`);

  // Identify which crew this chat belongs to
  const { crew, job } = await identifyCrewAndJob(chatId, caption);

  // Download from Telegram
  let photoBuffer;
  try {
    photoBuffer = await downloadFile(best.file_id);
  } catch (err) {
    console.error("[photo] Download failed:", err.message);
    return;
  }

  // Save locally
  const dateStr   = receivedAt.slice(0, 10);
  const photoDir  = path.join(ROOT, "data/photos", dateStr);
  await mkdir(photoDir, { recursive: true });
  const filename  = `${Date.now()}_${best.file_id.slice(0, 8)}.jpg`;
  const localPath = path.join(photoDir, filename);
  await writeFile(localPath, photoBuffer);

  // Analyze with Claude Vision
  const { summary, completionStatus, shouldAsk } = await analyzePhoto(
    photoBuffer,
    { crewName: crew?.displayName, jobName: job?.jobName, caption }
  );

  console.log(`[photo] AI summary: "${summary}" | status: ${completionStatus}`);

  // Log to Monday.com
  let mondayUpdated = false;
  if (job?.mondayItemId) {
    try {
      await uploadPhoto(job.mondayItemId, photoBuffer, filename);
      await addUpdate(job.mondayItemId, {
        senderName:       sender,
        crewName:         crew?.displayName ?? "Unknown crew",
        timestamp:        receivedAt,
        caption,
        aiSummary:        summary,
        completionStatus,
      });
      mondayUpdated = true;
      console.log(`[photo] Logged to Monday item ${job.mondayItemId}`);
    } catch (err) {
      console.error("[photo] Monday write-back failed:", err.message);
    }
  } else {
    console.warn("[photo] No Monday item found — skipping write-back");
  }

  // Send follow-up question to crew if job status is unclear
  if (shouldAsk && crew?.telegramGroupId) {
    const lang = crew.language ?? "en";
    const question = FOLLOW_UP[lang] ?? FOLLOW_UP.en;
    try {
      await sendMessage(crew.telegramGroupId, question);
    } catch (err) {
      console.error("[photo] Follow-up message failed:", err.message);
    }
  }

  // Save metadata for dashboard feed
  const meta = {
    receivedAt,
    fileId:           best.file_id,
    localPath,
    chatId,
    sender,
    caption,
    crewKey:          crew?.crewKey ?? null,
    crewDisplay:      crew?.displayName ?? null,
    jobNumber:        job?.jobNumber ?? null,
    jobName:          job?.jobName ?? null,
    mondayItemId:     job?.mondayItemId ?? null,
    aiSummary:        summary,
    completionStatus,
    mondayUpdated,
  };
  const metaPath = path.join(photoDir, filename.replace(".jpg", ".json"));
  await writeFile(metaPath, JSON.stringify(meta, null, 2));
}

// ── Claude Vision ─────────────────────────────────────────────────────────

async function analyzePhoto(photoBuffer, context) {
  if (!ANTHROPIC_API_KEY) {
    console.warn("[photo] ANTHROPIC_API_KEY not set — skipping AI analysis");
    return { summary: "Photo received (AI analysis not configured).", completionStatus: "unknown", shouldAsk: true };
  }

  const b64 = photoBuffer.toString("base64");
  const contextNote = [
    context.crewName  ? `Crew: ${context.crewName}` : null,
    context.jobName   ? `Job: ${context.jobName}`   : null,
    context.caption   ? `Caption: "${context.caption}"` : null,
  ].filter(Boolean).join(". ");

  const prompt = `You are analyzing a construction site photo sent by a paver/pool-deck crew.

Context: ${contextNote || "No context provided."}

Look at this photo carefully and provide:
1. A 1-2 sentence description of what is shown (materials visible, work stage, site condition).
2. Whether the job appears DONE, IN-PROGRESS, or UNKNOWN based on what you see.
3. Whether a follow-up question should be sent to the crew (true if status is unclear).

Respond in this exact JSON format:
{
  "summary": "...",
  "completionStatus": "done" | "in-progress" | "unknown",
  "shouldAsk": true | false
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model:      "claude-opus-4-7",
        max_tokens: 256,
        messages: [{
          role:    "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
            { type: "text",  text: prompt },
          ],
        }],
      }),
    });

    const data = await res.json();
    const raw  = data.content?.[0]?.text ?? "";

    // Extract JSON from response
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        summary:          parsed.summary          ?? "Photo received.",
        completionStatus: parsed.completionStatus ?? "unknown",
        shouldAsk:        parsed.shouldAsk        ?? true,
      };
    }
    return { summary: raw.slice(0, 200), completionStatus: "unknown", shouldAsk: true };
  } catch (err) {
    console.error("[photo] Claude Vision error:", err.message);
    return { summary: "Photo received (analysis failed).", completionStatus: "unknown", shouldAsk: false };
  }
}

// ── Crew + job matching ───────────────────────────────────────────────────

async function identifyCrewAndJob(chatId, caption) {
  // Load today's brief
  const dateStr  = new Date().toISOString().slice(0, 10);
  const briefPath = path.join(ROOT, "data/briefs", `${dateStr}.json`);
  let brief;
  try {
    brief = JSON.parse(await readFile(briefPath, "utf8"));
  } catch {
    return { crew: null, job: null };
  }

  // Find crew by Telegram group ID
  const crew = brief.crews?.find(c => String(c.telegramGroupId) === String(chatId)) ?? null;
  if (!crew) return { crew: null, job: null };

  // Find job: try caption for #JOBNUM pattern first
  const numMatch = caption.match(/#(\d+)/);
  let job = null;
  if (numMatch) {
    job = crew.jobs?.find(j => j.jobNumber === numMatch[1]) ?? null;
  }
  // Fallback: first (or only) job for this crew today
  if (!job && crew.jobs?.length === 1) {
    job = crew.jobs[0];
  }
  if (!job && crew.jobs?.length > 1) {
    // Ambiguous — use first but flag it
    job = crew.jobs[0];
    console.warn(`[photo] Ambiguous job for crew ${crew.crewKey} — defaulting to first job #${job.jobNumber}`);
  }

  return { crew, job };
}
