/**
 * src/agents/dispatchChat.mjs
 *
 * Dispatch Assistant — powered by Claude.
 * Answers logistics questions with full context of today's brief, jobs,
 * fleet, flags, and logistics plans. Handles incident triage.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = decodeURIComponent(new URL("../..", import.meta.url).pathname);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const MODEL = "claude-haiku-4-5-20251001"; // fast + cheap for chat

// ── System prompt ─────────────────────────────────────────────────────────

function buildSystemPrompt(context) {
  return `You are the IBP Dispatch Assistant — a COO-level logistics AI for Install Brick Pavers (IBP), a paver and pool-deck construction company in Orlando, FL.

You have full visibility into today's operations and answer questions from the operations coordinator.

## Your role
- Help plan and prioritize today's driver runs and crew assignments
- Triage incidents (flat tires, material delays, crew issues, job problems)
- Suggest the most efficient route sequences
- Draft Telegram messages to send to crews or drivers
- Flag risks before they become problems
- Be direct, brief, and actionable — no fluff

## IBP Operational Rules
- Warehouse: 5224 Goddard Ave, Orlando FL 32822 (gate: 04271)
- Primary driver: Noel (Spanish)
- Secondary driver: Arthur (Portuguese)
- Apopka dump closes at 3:45 PM — schedule dump runs before 3 PM to be safe
- Gate codes are required for all gated community jobs — flag missing ones
- Material readiness must be confirmed before crew dispatches
- Trailer types: gooseneck for heavy equipment, dump trailer for debris, flat for pallets

## Incident playbook
When something goes wrong, always address:
1. Which crew/driver is affected
2. Immediate action (next 30 min)
3. Downstream impact (what else shifts)
4. Telegram message to send (ready to copy-paste)
5. Monday.com update needed (yes/no)

## Today's Context
${context}

Keep responses under 300 words unless a detailed plan is needed. Use bullet points. Be specific — name the job, crew, and time.`;
}

// ── Context builder ───────────────────────────────────────────────────────

export async function buildContext(dateStr = todayISO()) {
  const parts = [];

  // Brief
  try {
    const brief = JSON.parse(await readFile(path.join(ROOT, "data/briefs", `${dateStr}.json`), "utf8"));
    const crewSummary = (brief.crews ?? []).map(c => {
      const jobs = (c.jobs ?? []).map(j =>
        `    • ${j.jobName} @ ${j.address || "TBD"} | gate: ${j.gateCode || "?"} | status: ${j.checkInStatus || "not started"} | trailer: ${j.trailerType || "none"}`
      ).join("\n");
      return `  ${c.displayName} (${c.language?.toUpperCase()}) — reliability: ${c.reliability}\n${jobs}`;
    }).join("\n");
    parts.push(`### TODAY'S CREWS & JOBS (${dateStr})\n${crewSummary || "No crews scheduled."}`);
  } catch {}

  // Logistics plan
  try {
    const logistics = JSON.parse(await readFile(path.join(ROOT, "data/logistics", `${dateStr}.json`), "utf8"));
    const runSummary = (logistics.runs ?? []).map(r =>
      `  Run #${r.runNumber} — ${r.driverKey} → ${r.jobName} | trailer: ${r.trailerType || "none"} | approved: ${r.approved ? "yes" : "no"} | sent: ${r.sentAt ? "yes" : "no"}`
    ).join("\n");
    parts.push(`### DRIVER RUNS\n${runSummary || "No runs planned."}`);
  } catch {}

  // Flags (unknown messages)
  try {
    const flags = JSON.parse(await readFile(path.join(ROOT, "data/flags", `${dateStr}.json`), "utf8"));
    const open = flags.filter(f => !f.resolved);
    if (open.length) {
      const flagSummary = open.map(f => `  • ${f.displayName}: "${f.text}" (${f.sender}, ${new Date(f.timestamp).toLocaleTimeString()})`).join("\n");
      parts.push(`### UNRESOLVED MESSAGES (${open.length})\n${flagSummary}`);
    }
  } catch {}

  // Fleet
  try {
    const groups = JSON.parse(await readFile(path.join(ROOT, "data/crew-telegram-groups.json"), "utf8"));
    const connected = Object.values(groups).filter(g => g.groupId).map(g => g.displayName).join(", ");
    parts.push(`### CONNECTED CREWS\n  ${connected || "None"}`);
  } catch {}

  // Learned phrases
  try {
    const learned = JSON.parse(await readFile(path.join(ROOT, "data/learned-phrases.json"), "utf8"));
    if (learned.length) {
      parts.push(`### LEARNED PHRASES (${learned.length} total)\n  Latest: ${learned.slice(-3).map(l => `"${l.phrase}" → ${l.intent}`).join(", ")}`);
    }
  } catch {}

  return parts.join("\n\n") || "No operational data available yet for today.";
}

// ── Chat entry point ──────────────────────────────────────────────────────

export async function chat(messages, dateStr = todayISO()) {
  if (!ANTHROPIC_API_KEY) {
    return fallbackResponse(messages[messages.length - 1]?.content ?? "");
  }

  const context = await buildContext(dateStr);
  const systemPrompt = buildSystemPrompt(context);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key":         ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type":      "application/json",
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   messages.map(m => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? "No response.";
}

// ── Fallback (no API key) ─────────────────────────────────────────────────

function fallbackResponse(userMessage) {
  const msg = userMessage.toLowerCase();

  if (/flat.?tire|broke down|truck.*down|van.*broke/i.test(msg)) {
    return `**Flat tire / breakdown protocol:**\n\n1. Confirm driver location\n2. If Noel — reassign to Arthur if available, or delay the run\n3. Send to affected crew: *"Logistics delay — we'll update you shortly"*\n4. Check if another trailer can cover\n5. Update Monday.com item with delay note\n\nAdd your Anthropic API key to .env to get a personalized plan based on today's specific runs.`;
  }
  if (/material|delivery|not.*(arrived|here|ready)/i.test(msg)) {
    return `**Material delay protocol:**\n\n1. Confirm which job is affected\n2. Check if crew can start on a different task while waiting\n3. Call supplier for ETA\n4. If >2 hour delay — consider rescheduling crew to another site\n5. Update Monday.com logistics status\n\nAdd your Anthropic API key to .env for AI-powered analysis of today's jobs.`;
  }
  if (/priority|what.*today|plan.*day|route/i.test(msg)) {
    return `**To get a full prioritized plan with AI reasoning, add your Anthropic API key to .env.**\n\nGeneral priority order:\n1. Jobs with material already delivered\n2. Jobs with confirmed gate codes\n3. Jobs closest to warehouse (reduce drive time)\n4. Dump runs before 3 PM (Apopka closes 3:45)\n5. Material pickups early morning`;
  }

  return `I can help with route planning, incident triage, and dispatch decisions.\n\nTry asking:\n• *"What needs to go out first today?"*\n• *"Noel has a flat tire — what do we do?"*\n• *"Material for [job] hasn't arrived"*\n• *"Plan the most efficient route for today"*\n\n**Note:** Add your Anthropic API key to .env for full AI-powered responses.`;
}

function todayISO() { return new Date().toISOString().slice(0, 10); }
