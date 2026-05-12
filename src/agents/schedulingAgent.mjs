/**
 * src/agents/schedulingAgent.mjs
 *
 * Reads NEED TO SCHEDULE jobs from Monday.com, applies readiness and crew-fit
 * rules, and produces a list of schedule proposals for human review.
 *
 * Proposals are saved to data/proposals/YYYY-MM-DD.json.
 * A human approves/rejects each one via the dashboard; on approval the job is
 * written to IBP CREW SCHEDULE on Monday and the STAGE is flipped to SCHEDULED JOB.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fetchJobsNeedingSchedule, setJobStage, STAGE } from "../monday/fetchJobs.mjs";
import { createScheduleItem } from "../monday/createScheduleItem.mjs";
import { CREW_PROFILES } from "../config.mjs";

const ROOT = decodeURIComponent(new URL("../..", import.meta.url).pathname);
const PROPOSALS_DIR = path.join(ROOT, "data/proposals");

// ── Job-type → crew skill matching ───────────────────────────────────────────
// Maps job type keywords to crew strength tags defined in config.mjs
const JOB_CREW_MAP = {
  "COPING":         ["coping"],
  "DECK":           ["pool builder decks", "retail decks", "production builder work", "decks", "pavers"],
  "DECK INSTALL":   ["pool builder decks", "retail decks", "production builder work", "decks"],
  "PAVERS":         ["pavers", "big paver jobs", "paver detail work"],
  "DRIVEWAY":       ["pavers", "production builder work", "decks"],
  "WALKWAY":        ["pavers", "small projects"],
  "PATIO":          ["pavers", "decks"],
  "BACK PATIO":     ["pavers", "decks"],
  "SEALER":         ["sealers"],
  "PRESSURE WASH":  ["sealers", "customer service"],
  "REPAIR":         ["repair work", "service"],
  "TILE":           ["tile"],
  "STACKED STONE":  ["retaining walls"],
};

// Estimated working days per job type (used for end-date calculation)
const DURATION_MAP = {
  "SEALER":         0.5,
  "PRESSURE WASH":  0.5,
  "REPAIR":         0.5,
  "WALKWAY":        1,
  "COPING":         1,
  "PAVERS":         2,
  "PATIO":          2,
  "BACK PATIO":     2,
  "DRIVEWAY":       2,
  "DECK":           2,
  "DECK INSTALL":   3,
};

// ── Main entry point ─────────────────────────────────────────────────────────

export async function generateProposals() {
  const jobs = await fetchJobsNeedingSchedule();
  const busyCrew = await loadCrewBusyDays();

  const proposals = jobs.map(job => buildProposal(job, busyCrew));

  const result = {
    generatedAt: new Date().toISOString(),
    proposals,
  };

  await mkdir(PROPOSALS_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const outPath = path.join(PROPOSALS_DIR, `${date}.json`);
  await writeFile(outPath, JSON.stringify(result, null, 2));
  console.log(`[scheduler] ${proposals.length} proposals written → ${outPath}`);
  return result;
}

export async function loadProposals(date) {
  const filePath = path.join(PROPOSALS_DIR, `${date}.json`);
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

export async function saveProposals(date, data) {
  await mkdir(PROPOSALS_DIR, { recursive: true });
  const filePath = path.join(PROPOSALS_DIR, `${date}.json`);
  await writeFile(filePath, JSON.stringify(data, null, 2));
}

export async function approveProposal(date, proposalId, overrides = {}) {
  const data = await loadProposals(date);
  if (!data) throw new Error(`No proposals found for ${date}`);

  const proposal = data.proposals.find(p => p.id === proposalId);
  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

  // Apply any human overrides (different crew, different date)
  if (overrides.crewKey)    proposal.proposedCrew = overrides.crewKey;
  if (overrides.date)       proposal.proposedDate = overrides.date;
  if (overrides.notes)      proposal.notes = overrides.notes;

  proposal.status     = "approved";
  proposal.approvedAt = new Date().toISOString();

  await saveProposals(date, data);

  // Write to Monday.com: flip STAGE + create IBP CREW SCHEDULE row
  await Promise.all([
    setJobStage(proposal.mondayItemId, STAGE.SCHEDULED_JOB),
    createScheduleItem(proposal),
  ]);

  return proposal;
}

export async function rejectProposal(date, proposalId, reason = "") {
  const data = await loadProposals(date);
  if (!data) throw new Error(`No proposals found for ${date}`);

  const proposal = data.proposals.find(p => p.id === proposalId);
  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

  proposal.status     = "rejected";
  proposal.rejectedAt = new Date().toISOString();
  proposal.notes      = reason;

  await saveProposals(date, data);
  return proposal;
}

// ── Proposal builder ─────────────────────────────────────────────────────────

function buildProposal(job, busyCrew) {
  const blockers = [];
  const warnings = [];

  // Material readiness
  let earliestDate = nextWorkday(new Date());
  if (job.materialReadiness.status === "awaiting-delivery") {
    if (job.materialReadiness.readyDate) {
      const deliveryDay = new Date(job.materialReadiness.readyDate + "T12:00:00");
      earliestDate = nextWorkday(new Date(deliveryDay.getTime() + 86_400_000)); // day after delivery
      blockers.push(`⏳ Materials awaiting delivery — earliest start ${fmtDate(earliestDate)}`);
    } else {
      blockers.push("⏳ Materials awaiting delivery — no delivery date set");
    }
  } else if (job.materialReadiness.status === "needs-pickup") {
    warnings.push("🚛 Logistics pickup run needed before crew can start");
  } else if (job.materialReadiness.status === "unknown") {
    warnings.push("❓ Material status unclear — verify before confirming");
  }

  // Equipment flag
  if (job.equipmentNeeded === "gooseneck") {
    warnings.push("🔗 Gooseneck trailer required — confirm availability");
  } else if (job.equipmentNeeded === "dump-trailer") {
    warnings.push("🚛 Dump trailer required");
  }

  // Crew matching
  const { crew: proposedCrew, alternatives, reason: matchReason } = matchCrew(job, busyCrew, earliestDate);

  // Duration estimate
  const estimatedDays = estimateDuration(job.jobTypes);

  return {
    id:               `${job.mondayItemId}-${Date.now()}`,
    mondayItemId:     job.mondayItemId,
    jobName:          job.itemName,
    jobNumber:        job.jobNumber,
    jobTypes:         job.jobTypes,
    address:          job.address,
    builder:          job.builder,
    materialStatus:   job.materialReadiness.status,
    materialNote:     job.materialReadiness.note,
    equipmentNeeded:  job.equipmentNeeded,
    proposedCrew:     proposedCrew?.key ?? null,
    proposedCrewName: proposedCrew?.displayName ?? "No match — assign manually",
    alternativeCrews: alternatives.map(c => ({ key: c.key, displayName: c.displayName })),
    proposedDate:     fmtDate(earliestDate),
    estimatedDays,
    reasoning:        buildReasoning(job, proposedCrew, matchReason, earliestDate),
    blockers,
    warnings,
    status:           "pending",
    approvedAt:       null,
    rejectedAt:       null,
    notes:            "",
    mondayUrl:        job.url,
  };
}

// ── Crew matching ────────────────────────────────────────────────────────────

function matchCrew(job, busyCrew, earliestDate) {
  const dateStr = fmtDate(earliestDate);
  const requiredStrengths = job.jobTypes.flatMap(t => {
    const key = t.toUpperCase().trim();
    return JOB_CREW_MAP[key] ?? [];
  });

  // Score each crew by how many required strengths they have
  const scored = CREW_PROFILES
    .filter(p => p.key !== "others")
    .map(p => {
      const matchCount = requiredStrengths.filter(s =>
        p.strengths.some(cs => cs.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(cs.toLowerCase()))
      ).length;

      const busy = (busyCrew.get(p.key) ?? new Set()).has(dateStr);
      const reliabilityScore = { high: 3, normal: 2, low: 1, unknown: 0 }[p.reliability] ?? 0;

      return { crew: p, matchCount, busy, reliabilityScore };
    })
    .filter(s => s.matchCount > 0)
    .sort((a, b) => {
      if (a.busy !== b.busy) return a.busy ? 1 : -1; // available first
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
      return b.reliabilityScore - a.reliabilityScore;
    });

  const available  = scored.filter(s => !s.busy);
  const busy       = scored.filter(s => s.busy);
  const top        = available[0] ?? busy[0] ?? null;
  const alts       = scored.slice(1, 4).map(s => s.crew);

  let reason = "";
  if (!top) {
    reason = "No crew with matching skills found — assign manually.";
  } else if (top.busy) {
    reason = `${top.crew.displayName} is the best skill match but may already be busy on ${dateStr}.`;
  } else {
    reason = `${top.crew.displayName} matched on ${top.matchCount} skill(s).`;
  }

  return { crew: top?.crew ?? null, alternatives: alts, reason };
}

function buildReasoning(job, crew, matchReason, earliestDate) {
  const parts = [
    `Job type: ${job.jobTypes.join(" + ") || "unknown"}.`,
    `Material: ${job.materialReadiness.note}.`,
    matchReason,
    crew ? `Reliability: ${crew.reliability}.` : null,
    `Earliest available start: ${fmtDate(earliestDate)}.`,
  ];
  return parts.filter(Boolean).join(" ");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function estimateDuration(jobTypes) {
  const days = jobTypes.map(t => DURATION_MAP[t.toUpperCase().trim()] ?? 1);
  // For multi-type jobs, take the max (a coping+deck job takes deck-time, not coping+deck combined)
  return days.length ? Math.max(...days) : 1;
}

async function loadCrewBusyDays() {
  // Reads schedule-records.json to know which crews are already booked on which days
  const schedulePath = path.join(ROOT, "data/schedule-records.json");
  try {
    const raw = JSON.parse(await readFile(schedulePath, "utf8"));
    const records = raw.records ?? [];
    const map = new Map();
    for (const rec of records) {
      if (rec.status !== "assigned") continue;
      if (!map.has(rec.crewKey)) map.set(rec.crewKey, new Set());
      map.get(rec.crewKey).add(rec.date);
    }
    return map;
  } catch {
    return new Map();
  }
}

function nextWorkday(from) {
  const d = new Date(from);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (process.argv[1].endsWith("schedulingAgent.mjs")) {
  generateProposals()
    .then(r => console.log(`Done. ${r.proposals.length} proposals generated.`))
    .catch(err => { console.error(err); process.exit(1); });
}
