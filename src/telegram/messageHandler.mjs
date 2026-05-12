/**
 * src/telegram/messageHandler.mjs
 *
 * Handles text messages from crew/driver Telegram groups.
 * Detects check-in intents (arrived, working, done, issue, leaving)
 * in English, Spanish, and Portuguese.
 *
 * On a match:
 *  1. Updates the job status in today's brief
 *  2. Adds an update to the Monday.com item
 *  3. Sends a confirmation reply to the crew
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { sendMessage } from "./bot.mjs";
import { addUpdate } from "../monday/addUpdate.mjs";

const ROOT = decodeURIComponent(new URL("../..", import.meta.url).pathname);

// ── Intent patterns (EN / ES / PT) ───────────────────────────────────────

const INTENTS = [
  {
    name: "arrived",
    patterns: [
      /\b(arrived?|i'?m here|on site|at the job|at site)\b/i,
      /\b(llegu[eé]|estoy aqu[ií]|ya llegamos?|en el trabajo)\b/i,
      /\b(cheguei|chegamos?|est(ou|amos) aqui|no trabalho)\b/i,
    ],
    statusLabel: "ON SITE",
    replies: {
      en: "✅ Got it — marked you on site. Send a photo when you start.",
      es: "✅ Anotado — marcados en el trabajo. Manden una foto cuando empiecen.",
      pt: "✅ Anotado — marcados no trabalho. Mande uma foto quando começar.",
    },
  },
  {
    name: "working",
    patterns: [
      /\b(started?|working|in progress|begun|underway)\b/i,
      /\b(empezamos?|trabajando|en progreso|comenzamos?)\b/i,
      /\b(come[çc]amos?|trabalhando|em andamento)\b/i,
    ],
    statusLabel: "WORKING",
    replies: {
      en: "👷 Logged — job is in progress.",
      es: "👷 Anotado — trabajo en progreso.",
      pt: "👷 Anotado — trabalho em andamento.",
    },
  },
  {
    name: "done",
    patterns: [
      /\b(done|finished|complete[d]?|all done|wrapped up|job done)\b/i,
      /\b(terminamos?|listo|acabamos?|terminado|ya terminamos?)\b/i,
      /\b(terminamos?|acabamos?|pronto|finalizado|conclu[ií]mos?)\b/i,
    ],
    statusLabel: "COMPLETED",
    replies: {
      en: "✅ Nice work — job marked complete. Head back to warehouse when ready.",
      es: "✅ Buen trabajo — trabajo marcado como completo. Regresen al almacén cuando estén listos.",
      pt: "✅ Bom trabalho — serviço marcado como concluído. Voltem ao depósito quando estiverem prontos.",
    },
  },
  {
    name: "issue",
    patterns: [
      /\b(problem|issue|stuck|help|blocked|can'?t|won'?t|broken|missing)\b/i,
      /\b(problema|ayuda|atascado|bloqueado|no puedo|falta|roto)\b/i,
      /\b(problema|ajuda|travado|bloqueado|n[ãa]o consigo|faltando|quebrado)\b/i,
    ],
    statusLabel: "ISSUE",
    replies: {
      en: "⚠️ Issue flagged — coordinator has been notified.",
      es: "⚠️ Problema reportado — el coordinador fue notificado.",
      pt: "⚠️ Problema registrado — o coordenador foi notificado.",
    },
  },
  {
    name: "leaving",
    patterns: [
      /\b(leaving|on my way|heading (back|out|to)|left the site)\b/i,
      /\b(saliendo|en camino|nos vamos?|salimos?|regresando)\b/i,
      /\b(saindo|indo|a caminho|saimos?|voltando)\b/i,
    ],
    statusLabel: "LEAVING",
    replies: {
      en: "👍 Got it — logged your departure.",
      es: "👍 Anotado — salida registrada.",
      pt: "👍 Anotado — saída registrada.",
    },
  },
  {
    name: "at-pickup",
    patterns: [
      /\b(at (the )?(supplier|store|pickup|warehouse|material))\b/i,
      /\b(en (la )?(tienda|proveedor|almac[eé]n|material))\b/i,
      /\b(na (loja|fornecedor|dep[oó]sito|material))\b/i,
    ],
    statusLabel: "PICKING UP MATERIAL",
    replies: {
      en: "📦 Logged — at material pickup.",
      es: "📦 Anotado — en recogida de material.",
      pt: "📦 Anotado — na retirada de material.",
    },
  },
  {
    name: "material-delivered",
    patterns: [
      /\b(material.*(delivered?|dropped?|here|ready)|delivered?\s+material)\b/i,
      /\b(material.*(entregue|chegou|aqui|pronto)|entregue)\b/i,
      /\b(material.*(entregado|lleg[oó]|aqu[ií]|listo)|entregado)\b/i,
    ],
    statusLabel: "MATERIAL ON SITE",
    replies: {
      en: "📦 Got it — material delivery logged.",
      es: "📦 Anotado — material entregado en obra.",
      pt: "📦 Anotado — material entregue na obra.",
    },
  },
  {
    name: "loading",
    patterns: [
      /\b(loading|load(ing)? up|filling (the )?trailer)\b/i,
      /\b(cargando|llenando|cargando el trailer)\b/i,
      /\b(carregando|enchendo|carregando o trailer)\b/i,
    ],
    statusLabel: "LOADING",
    replies: {
      en: "🚛 Logged — loading up.",
      es: "🚛 Anotado — cargando.",
      pt: "🚛 Anotado — carregando.",
    },
  },
  {
    name: "dumping",
    patterns: [
      /\b(dump(ing)?|at (the )?dump|landfill)\b/i,
      /\b(descarg(ando|ue)|en el (basurero|dump))\b/i,
      /\b(descarregando|no (aterro|dump))\b/i,
    ],
    statusLabel: "DUMPING",
    replies: {
      en: "🗑️ Logged — at dump.",
      es: "🗑️ Anotado — en el basurero.",
      pt: "🗑️ Anotado — no aterro.",
    },
  },
];

// ── Main handler ──────────────────────────────────────────────────────────

export async function handleTextMessage(update) {
  const msg    = update.message;
  const chatId = String(msg.chat.id);
  const text   = msg.text ?? "";
  const sender = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || "Crew";

  if (!text.trim()) return;

  // ── Bot commands ─────────────────────────────────────────────────────────
  if (text.startsWith("/")) {
    await handleCommand(text, chatId, msg);
    return;
  }

  const intent = await detectIntentWithLearned(text);
  if (!intent) {
    // Unknown message — flag it to the dashboard for coordinator review
    await flagUnknownMessage({ chatId, sender, text });
    return;
  }

  // Identify crew and job from today's brief
  const { crew, job } = await identifyCrewAndJob(chatId);
  if (!crew) {
    // Check if it's a known group (connected but not on today's brief)
    const groups = await loadGroups();
    const knownCrew = Object.values(groups).find(g => String(g.groupId) === chatId);
    if (knownCrew) {
      const lang = knownCrew.language ?? "en";
      const nativeLine = lang !== "en" ? (intent.replies[lang] ?? null) : null;
      const reply = nativeLine ? `${intent.replies.en}\n${nativeLine}` : intent.replies.en;
      try { await sendMessage(chatId, reply); } catch {}
      console.log(`[checkin] Known group ${chatId} (${knownCrew.displayName}) — not on today's brief, replied anyway`);
    } else {
      console.log(`[checkin] Unrecognised chat ${chatId} — ignoring`);
    }
    return;
  }

  const lang = crew.language ?? "en";
  const timestamp = new Date().toISOString();
  const jobLabel = job ? `${job.jobName} #${job.jobNumber}` : "job";

  console.log(`[checkin] ${sender} (${crew.crewKey}) → intent: ${intent.name} | job: ${jobLabel}`);

  // 1. Update brief job status
  await updateBriefJobStatus(crew.crewKey, job?.jobNumber, intent.statusLabel, { sender, timestamp, text });

  // 2. Post to Monday.com
  if (job?.mondayItemId) {
    try {
      await addUpdate(job.mondayItemId, {
        senderName:       sender,
        crewName:         crew.displayName,
        timestamp,
        caption:          text,
        aiSummary:        `Check-in: ${intent.statusLabel}`,
        completionStatus: intent.name === "done" ? "done" : intent.name === "working" ? "in-progress" : "unknown",
      });
    } catch (err) {
      console.error("[checkin] Monday update failed:", err.message);
    }
  }

  // 3. Reply to crew — bilingual: English + crew's native language
  const nativeLine = lang !== "en" ? (intent.replies[lang] ?? null) : null;
  const reply = nativeLine
    ? `${intent.replies.en}\n${nativeLine}`
    : intent.replies.en;
  try {
    await sendMessage(chatId, reply);
  } catch (err) {
    console.error("[checkin] Reply failed:", err.message);
  }
}

// ── Command handler ───────────────────────────────────────────────────────

async function handleCommand(text, chatId, msg) {
  const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@\S+$/, "");
  const chatType = msg.chat.type; // "private" | "group" | "supergroup"
  const chatTitle = msg.chat.title ?? "this chat";

  if (cmd === "/myid" || cmd === "/start") {
    const reply = [
      `📋 *IBP Bot — Chat Info*`,
      ``,
      `*Chat ID:* \`${chatId}\``,
      `*Type:* ${chatType}`,
      chatType !== "private" ? `*Name:* ${chatTitle}` : "",
      ``,
      `EN: Share this Chat ID with your coordinator to connect this group.`,
      `ES: Comparte este Chat ID con tu coordinador para conectar este grupo.`,
      `PT: Compartilhe este Chat ID com seu coordenador para conectar este grupo.`,
    ].filter(l => l !== "").join("\n");
    await sendMessage(chatId, reply);
    console.log(`[bot] /myid in ${chatType} "${chatTitle}" → chatId ${chatId}`);
    return;
  }

  if (cmd === "/status") {
    const { crew } = await identifyCrewAndJob(chatId);
    if (!crew) {
      await sendMessage(chatId,
        "⚠️ This group is not linked to any crew yet.\n" +
        "ES: Este grupo no está vinculado a ningún equipo todavía.\n" +
        "PT: Este grupo ainda não está vinculado a nenhuma equipe."
      );
      return;
    }
    const jobs = crew.jobs?.map(j => `• ${j.jobName} — ${j.checkInStatus ?? "not started"}`).join("\n") ?? "—";
    await sendMessage(chatId, `📋 *${crew.displayName} — Today's Status*\n\n${jobs}`);
    return;
  }
}

// ── Intent detection ──────────────────────────────────────────────────────

async function detectIntentWithLearned(text) {
  // Check built-in patterns first
  const builtin = detectIntent(text);
  if (builtin) return builtin;

  // Check learned phrases
  try {
    const learned = JSON.parse(await readFile(path.join(ROOT, "data/learned-phrases.json"), "utf8"));
    for (const entry of learned) {
      if (entry.intent === "ignore") continue;
      if (text.toLowerCase().includes(entry.phrase.toLowerCase())) {
        const intent = INTENTS.find(i => i.name === entry.intent);
        if (intent) return intent;
      }
    }
  } catch {}
  return null;
}

function detectIntent(text) {
  for (const intent of INTENTS) {
    for (const pattern of intent.patterns) {
      if (pattern.test(text)) return intent;
    }
  }
  return null;
}

// ── Brief helpers ─────────────────────────────────────────────────────────

async function loadGroups() {
  try {
    return JSON.parse(await readFile(path.join(ROOT, "data/crew-telegram-groups.json"), "utf8"));
  } catch { return {}; }
}

// ── Unknown message flagging ───────────────────────────────────────────────

async function flagUnknownMessage({ chatId, sender, text }) {
  // Look up crew name from groups config
  const groups = await loadGroups();
  const crewEntry = Object.entries(groups).find(([, g]) => String(g.groupId) === chatId);
  const crewKey     = crewEntry?.[0] ?? null;
  const displayName = crewEntry?.[1]?.displayName ?? `Unknown (${chatId})`;

  const flag = {
    id:          `flag-${Date.now()}`,
    timestamp:   new Date().toISOString(),
    chatId,
    crewKey,
    displayName,
    sender,
    text,
    resolved:    false,
    resolvedAt:  null,
    note:        "",
  };

  const flagsPath = path.join(ROOT, "data/flags", `${new Date().toISOString().slice(0, 10)}.json`);
  await mkdir(path.join(ROOT, "data/flags"), { recursive: true });

  let flags = [];
  try { flags = JSON.parse(await readFile(flagsPath, "utf8")); } catch {}
  flags.push(flag);
  await writeFile(flagsPath, JSON.stringify(flags, null, 2));

  console.log(`[flag] Unknown message from ${displayName}: "${text}"`);
}

async function identifyCrewAndJob(chatId) {
  const dateStr  = new Date().toISOString().slice(0, 10);
  const briefPath = path.join(ROOT, "data/briefs", `${dateStr}.json`);
  let brief;
  try {
    brief = JSON.parse(await readFile(briefPath, "utf8"));
  } catch {
    return { crew: null, job: null };
  }

  const crew = brief.crews?.find(c => String(c.telegramGroupId) === chatId) ?? null;
  if (!crew) return { crew: null, job: null };

  // If crew has only one job today, use it; otherwise leave ambiguous
  const job = crew.jobs?.length === 1 ? crew.jobs[0] : null;
  return { crew, job };
}

async function updateBriefJobStatus(crewKey, jobNumber, statusLabel, meta) {
  const dateStr  = new Date().toISOString().slice(0, 10);
  const briefPath = path.join(ROOT, "data/briefs", `${dateStr}.json`);
  try {
    const brief = JSON.parse(await readFile(briefPath, "utf8"));
    const crew  = brief.crews?.find(c => c.crewKey === crewKey);
    if (!crew) return;

    if (jobNumber) {
      const job = crew.jobs?.find(j => j.jobNumber === jobNumber);
      if (job) {
        job.checkInStatus = statusLabel;
        job.lastCheckIn   = { ...meta, status: statusLabel };
      }
    } else {
      // Apply to all jobs for this crew today
      for (const job of crew.jobs ?? []) {
        job.checkInStatus = statusLabel;
        job.lastCheckIn   = { ...meta, status: statusLabel };
      }
    }

    await writeFile(briefPath, JSON.stringify(brief, null, 2));
  } catch (err) {
    console.error("[checkin] Brief update failed:", err.message);
  }
}
