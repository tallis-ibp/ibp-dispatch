/**
 * src/agents/logisticsAgent.mjs
 *
 * Builds a sequenced daily route plan for each driver from today's brief.
 * For each driver run it identifies:
 *   - What to pick up / deliver
 *   - Which job site to go to
 *   - Gate codes and trailer requirements
 *   - Dump constraints (Apopka closes 3:45 PM)
 *
 * Output: data/logistics/YYYY-MM-DD.json
 * A human reviews and approves in the dashboard → sent to driver Telegram.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { sendMessage } from "../telegram/bot.mjs";

const ROOT = decodeURIComponent(new URL("../..", import.meta.url).pathname);
const LOGISTICS_DIR = path.join(ROOT, "data/logistics");

const WAREHOUSE = { name: "Warehouse", address: "5224 Goddard Ave, Orlando FL 32822", gateCode: "04271" };
const APOPKA_DUMP = { name: "Apopka Dump", address: "Apopka landfill", closesAt: "15:45", note: "Must arrive before 3:45 PM" };

// Known driver Telegram group IDs — filled from crew-telegram-groups.json
// Noel is IBP's primary logistics driver
const DRIVER_KEY = "noel";

// ── Main entry point ──────────────────────────────────────────────────────

export async function generateLogisticsPlan(dateStr = todayISO()) {
  const brief = await loadBrief(dateStr);
  if (!brief) throw new Error(`No brief found for ${dateStr} — run brief generation first`);

  const groups = await loadGroups();
  const runs   = buildDriverRuns(brief, groups);
  const plan   = {
    date:        dateStr,
    generatedAt: new Date().toISOString(),
    runs,
  };

  await mkdir(LOGISTICS_DIR, { recursive: true });
  const outPath = path.join(LOGISTICS_DIR, `${dateStr}.json`);
  await writeFile(outPath, JSON.stringify(plan, null, 2));
  console.log(`[logistics] Plan written → ${outPath}  (${runs.length} driver runs)`);
  return plan;
}

export async function loadLogisticsPlan(dateStr = todayISO()) {
  try {
    return JSON.parse(await readFile(path.join(LOGISTICS_DIR, `${dateStr}.json`), "utf8"));
  } catch { return null; }
}

export async function saveLogisticsPlan(dateStr, plan) {
  await mkdir(LOGISTICS_DIR, { recursive: true });
  await writeFile(path.join(LOGISTICS_DIR, `${dateStr}.json`), JSON.stringify(plan, null, 2));
}

export async function approveRun(dateStr, runId) {
  const plan = await loadLogisticsPlan(dateStr);
  if (!plan) throw new Error(`No logistics plan for ${dateStr}`);
  const run = plan.runs.find(r => r.id === runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  run.approved  = true;
  run.approvedAt = new Date().toISOString();
  await saveLogisticsPlan(dateStr, plan);

  // Send to driver Telegram if group configured
  const groups = await loadGroups();
  const driverGroup = groups[run.driverKey]?.groupId;
  if (driverGroup) {
    await sendMessage(driverGroup, run.dispatchText, { parse_mode: "Markdown" });
    run.sentAt = new Date().toISOString();
    await saveLogisticsPlan(dateStr, plan);
    console.log(`[logistics] Run ${runId} sent to ${run.driverKey} Telegram`);
  } else {
    console.warn(`[logistics] No Telegram group for driver ${run.driverKey} — not sent`);
  }

  return run;
}

// ── Route builder ─────────────────────────────────────────────────────────

function buildDriverRuns(brief, groups) {
  const runs = [];
  let runIndex = 1;

  for (const crew of brief.crews ?? []) {
    for (const job of crew.jobs ?? []) {
      const flags = buildLogisticsFlags(job);
      if (!flags.needsDriverRun) continue;

      const stops = buildStopSequence(job, flags);
      const dispatchText = buildRunDispatch(runIndex, crew, job, stops, flags);

      runs.push({
        id:           `run-${Date.now()}-${runIndex}`,
        runNumber:    runIndex,
        driverKey:    DRIVER_KEY,
        crewKey:      crew.crewKey,
        crewName:     crew.displayName,
        jobName:      job.jobName,
        jobNumber:    job.jobNumber,
        jobAddress:   job.address,
        gateCode:     job.gateCode,
        trailerType:  job.trailerType || null,
        flags,
        stops,
        dispatchText,
        approved:     false,
        approvedAt:   null,
        sentAt:       null,
      });
      runIndex++;
    }
  }

  // If no driver-specific runs found, build a general morning run covering all jobs
  if (runs.length === 0 && brief.crews?.length > 0) {
    runs.push(buildGeneralMorningRun(brief, runIndex));
  }

  return runs;
}

function buildLogisticsFlags(job) {
  const flags = {
    needsDriverRun:   false,
    needsMaterialPickup: false,
    needsDump:        false,
    needsGooseneck:   false,
    needsDumpTrailer: false,
    twoTripWarning:   false,
    riskFlags:        [],
  };

  for (const flag of job.riskFlags ?? []) {
    const f = flag.toLowerCase();
    if (f.includes("driver") || f.includes("logistics")) { flags.needsDriverRun = true; flags.needsMaterialPickup = true; }
    if (f.includes("gooseneck"))  { flags.needsGooseneck = true;  flags.needsDriverRun = true; }
    if (f.includes("dump"))       { flags.needsDump = true;       flags.needsDriverRun = true; }
    if (f.includes("material not confirmed") || f.includes("material status unknown")) flags.riskFlags.push(flag);
  }

  if (job.trailerType?.toLowerCase().includes("gooseneck")) { flags.needsGooseneck = true; flags.needsDriverRun = true; }
  if (job.trailerType?.toLowerCase().includes("dump"))      { flags.needsDumpTrailer = true; flags.needsDriverRun = true; }

  // 5 TN rule — can't detect tonnage here yet, but flag if job has heavy materials
  if (job.materials?.some(m => /ton|tn|pallet/i.test(m.quantity))) {
    flags.twoTripWarning = true;
    flags.needsDriverRun = true;
  }

  return flags;
}

function buildStopSequence(job, flags) {
  const stops = [];

  // Morning start — warehouse
  stops.push({ order: 1, location: WAREHOUSE.name, address: WAREHOUSE.address, gateCode: WAREHOUSE.gateCode, action: "Start from warehouse. Hook up trailer if needed." });

  // Material pickup if needed
  if (flags.needsMaterialPickup) {
    stops.push({ order: 2, location: "Material Supplier", address: "TBD — confirm supplier and PO#", gateCode: null, action: "Pick up materials. Get receipt." });
  }

  // Job site delivery
  stops.push({
    order: stops.length + 1,
    location: job.jobName,
    address:  job.address,
    gateCode: job.gateCode,
    action:   `Deliver to crew. ${flags.twoTripWarning ? "⚠️ May need 2 trips — verify load weight." : ""}`,
  });

  // Dump run if needed
  if (flags.needsDump) {
    stops.push({
      order:    stops.length + 1,
      location: APOPKA_DUMP.name,
      address:  APOPKA_DUMP.address,
      gateCode: null,
      action:   `Dump trailer. ⚠️ ${APOPKA_DUMP.note}.`,
    });
  }

  // End of day
  stops.push({ order: stops.length + 1, location: WAREHOUSE.name, address: WAREHOUSE.address, gateCode: WAREHOUSE.gateCode, action: "Return trailer. End of day." });

  return stops;
}

function buildRunDispatch(runIndex, crew, job, stops, flags) {
  const lines = [
    `*LOGISTICS RUN #${runIndex} — ${new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}*`,
    ``,
    `*JOB:* ${job.jobName}`,
    `*CREW:* ${crew.displayName}`,
    ``,
  ];

  if (flags.needsGooseneck)   lines.push(`*TRAILER:* 🔗 Gooseneck`);
  else if (flags.needsDumpTrailer) lines.push(`*TRAILER:* 🚛 Dump trailer`);
  if (job.trailerType && !flags.needsGooseneck && !flags.needsDumpTrailer) lines.push(`*TRAILER:* ${job.trailerType}`);

  lines.push(``, `*STOPS:*`);
  for (const stop of stops) {
    lines.push(`${stop.order}. *${stop.location}*`);
    if (stop.address) lines.push(`   📍 ${stop.address}`);
    if (stop.gateCode) lines.push(`   🔑 Gate: ${stop.gateCode}`);
    lines.push(`   → ${stop.action}`);
  }

  if (flags.riskFlags.length) {
    lines.push(``, `*⚠️ FLAGS:*`);
    for (const f of flags.riskFlags) lines.push(`• ${f}`);
  }

  if (flags.twoTripWarning) lines.push(``, `⚠️ *POSSIBLE 2-TRIP JOB* — confirm load weight before leaving.`);
  if (flags.needsDump)      lines.push(`⏰ *Apopka dump closes 3:45 PM* — plan accordingly.`);

  return lines.join("\n");
}

function buildGeneralMorningRun(brief, runIndex) {
  const jobList = brief.crews.flatMap(c => c.jobs.map(j => `• ${j.jobName} → ${c.displayName} @ ${j.address || "TBD"}`));
  const dispatchText = [
    `*MORNING LOGISTICS — ${brief.date}*`,
    ``,
    `*ALL ACTIVE JOBS TODAY:*`,
    ...jobList,
    ``,
    `Start from warehouse at 5224 Goddard Ave (gate: 04271).`,
    `Confirm trailers and material loads before crews arrive on site.`,
  ].join("\n");

  return {
    id:           `run-${Date.now()}-${runIndex}`,
    runNumber:    runIndex,
    driverKey:    DRIVER_KEY,
    crewKey:      null,
    crewName:     "All crews",
    jobName:      "General morning logistics",
    jobNumber:    null,
    jobAddress:   null,
    gateCode:     null,
    trailerType:  null,
    flags:        { needsDriverRun: true },
    stops: [
      { order: 1, location: "Warehouse", address: WAREHOUSE.address, gateCode: WAREHOUSE.gateCode, action: "Start of day — confirm all trailers and crew assignments." },
    ],
    dispatchText,
    approved:  false,
    approvedAt: null,
    sentAt:     null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function loadBrief(dateStr) {
  try {
    return JSON.parse(await readFile(path.join(ROOT, "data/briefs", `${dateStr}.json`), "utf8"));
  } catch { return null; }
}

async function loadGroups() {
  try {
    return JSON.parse(await readFile(path.join(ROOT, "data/crew-telegram-groups.json"), "utf8"));
  } catch { return {}; }
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

// ── CLI ───────────────────────────────────────────────────────────────────
if (process.argv[1].endsWith("logisticsAgent.mjs")) {
  generateLogisticsPlan(process.argv[2])
    .then(p => console.log(`Done. ${p.runs.length} runs generated.`))
    .catch(err => { console.error(err); process.exit(1); });
}
