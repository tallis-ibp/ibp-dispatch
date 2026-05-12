/**
 * generateBriefs.mjs
 * Reads schedule-records.json + monday-jobs.json for today (or a given date),
 * produces data/briefs/YYYY-MM-DD.json — one entry per crew with their jobs,
 * materials, risk flags, and dispatch message text ready for Telegram.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { CREW_PROFILES } from "./config.mjs";

const ROOT = decodeURIComponent(new URL("..", import.meta.url).pathname);
const schedulePath = path.join(ROOT, "data/schedule-records.json");
const mondayPath   = path.join(ROOT, "data/monday-jobs.json");
const groupsPath   = path.join(ROOT, "data/crew-telegram-groups.json");
const briefsDir    = path.join(ROOT, "data/briefs");

// Accept a date arg: node src/generateBriefs.mjs 2026-04-27
const targetDate = process.argv[2] || todayISO();

export async function generateBrief(dateStr = todayISO()) {
  const [schedule, mondayRaw, groups] = await Promise.all([
    readJSON(schedulePath),
    readJSON(mondayPath),
    readJSON(groupsPath),
  ]);

  const mondayJobs = Array.isArray(mondayRaw) ? mondayRaw : (mondayRaw.jobs ?? []);
  const mondayByJobNum = new Map(mondayJobs.map(j => [normalizeNum(j.jobNumber), j]));

  const records = (schedule.records ?? []).filter(r => r.date === dateStr && r.status === "assigned");

  // Group by crewKey
  const byCrewKey = new Map();
  for (const rec of records) {
    const key = rec.crewKey;
    if (!byCrewKey.has(key)) byCrewKey.set(key, []);
    byCrewKey.get(key).push(rec);
  }

  const crews = [];
  for (const [crewKey, recs] of byCrewKey) {
    const profile  = CREW_PROFILES.find(p => p.key === crewKey) ?? {};
    const groupCfg = groups[crewKey] ?? {};

    const jobs = recs.flatMap(rec =>
      (rec.jobNumbers ?? []).map(num => {
        const monday = mondayByJobNum.get(normalizeNum(num));
        return buildJobEntry(rec, num, monday);
      })
    );

    if (jobs.length === 0) continue;

    crews.push({
      crewKey,
      displayName:   groupCfg.displayName ?? profile.displayName ?? crewKey,
      telegramGroupId: groupCfg.groupId ?? "",
      language:      groupCfg.language ?? "en",
      reliability:   profile.reliability ?? "unknown",
      jobs,
      approved:      false,
      sentAt:        null,
    });
  }

  const brief = {
    date:        dateStr,
    generatedAt: new Date().toISOString(),
    crews,
  };

  await mkdir(briefsDir, { recursive: true });
  const outPath = path.join(briefsDir, `${dateStr}.json`);
  await writeFile(outPath, JSON.stringify(brief, null, 2));
  console.log(`Brief written → ${outPath}  (${crews.length} crews, ${crews.reduce((s,c) => s+c.jobs.length,0)} jobs)`);
  return brief;
}

function buildJobEntry(rec, jobNum, monday) {
  const risks = [];
  const materials = [];

  if (monday) {
    if (!monday.materialReady)             risks.push("⚠️ Material not confirmed ready");
    if (monday.materialReady === null)     risks.push("❓ Material status unknown — verify");
    if (monday.driverNeeded)               risks.push("🚛 Driver/logistics run needed");
    if (monday.trailerNeeded?.includes("gooseneck")) risks.push("🔗 Gooseneck trailer required");
    if (monday.logisticsStatus)            risks.push(monday.logisticsStatus);

    if (monday.trailerNeeded?.length)
      materials.push({ item: "Trailer", quantity: monday.trailerNeeded.join(", ") });
  }

  // Infer gate code from known data (extended as we learn more)
  const knownGateCodes = {
    "300021": "#8020",  // Moreno-Sanchez — confirmed Apr 25 2026
  };
  const gateCode = knownGateCodes[normalizeNum(jobNum)] ?? "";

  const dispatchText = buildDispatchMessage({
    jobName:   monday?.itemName ?? rec.rawAssignment,
    jobNumber: jobNum,
    address:   monday?.address ?? "",
    gateCode,
    supervisor: "",
    trailer:   monday?.trailerNeeded?.join(", ") ?? "",
    tasks:     [rec.rawAssignment],
    materials,
    nextStop:  "Warehouse",
    language:  "en",  // overridden at send time per crew language
  });

  return {
    jobNumber:     jobNum,
    mondayItemId:  monday?.mondayItemId ?? null,
    jobName:       monday?.itemName ?? rec.rawAssignment,
    address:       monday?.address ?? "",
    city:          monday?.city ?? "",
    gateCode,
    supervisor:    "",
    trailerType:   monday?.trailerNeeded?.join(", ") ?? "",
    tasks:         [rec.rawAssignment],
    materials,
    nextStop:      "Warehouse",
    riskFlags:     risks,
    dispatchText,
    photoLog:      [],   // filled in by photoHandler
    approved:      false,
    annotations:   "",
  };
}

export function buildDispatchMessage({ jobName, jobNumber, address, gateCode, supervisor, trailer, tasks, materials, nextStop, language }) {
  const matLines = materials.map(m => `- ${m.item}: ${m.quantity}`).join("\n");
  const taskLines = tasks.join("\n");

  // Labels by language
  const L = {
    en: { addr: "ADDRESS", gate: "GATE CODE", sup: "SUP", trailer: "TRAILER", task: "TASK", mat: "MATERIAL", next: "NEXT" },
    es: { addr: "DIRECCIÓN", gate: "CÓDIGO GATE", sup: "SUP", trailer: "TRÁILER", task: "TAREA", mat: "MATERIAL", next: "PRÓXIMO" },
    pt: { addr: "ENDEREÇO", gate: "CÓDIGO GATE", sup: "SUP", trailer: "TRAILER", task: "TAREFA", mat: "MATERIAL", next: "PRÓXIMO" },
  }[language] ?? { addr: "ADDRESS", gate: "GATE CODE", sup: "SUP", trailer: "TRAILER", task: "TASK", mat: "MATERIAL", next: "NEXT" };

  return [
    `*${jobName.includes(`#${jobNumber}`) ? jobName : `${jobName} #${jobNumber}`}*`,
    ``,
    `*${L.addr}:* ${address || "TBD"}`,
    `*${L.gate}:* ${gateCode}`,
    `*${L.sup}:* ${supervisor || "TBD"}`,
    trailer ? `*${L.trailer}:* ${trailer}` : null,
    ``,
    `*${L.task}:*`,
    taskLines,
    matLines ? `\n*${L.mat}:*\n${matLines}` : null,
    ``,
    `*${L.next}:* ${nextStop}`,
  ].filter(l => l !== null).join("\n");
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normalizeNum(n) {
  return String(n ?? "").replace(/^0+/, "").trim();
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function readJSON(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return {};
  }
}

// Run directly
if (process.argv[1].endsWith("generateBriefs.mjs")) {
  generateBrief(targetDate).catch(err => { console.error(err); process.exit(1); });
}
