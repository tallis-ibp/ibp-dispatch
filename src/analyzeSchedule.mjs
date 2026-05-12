import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CREW_PROFILES } from "./config.mjs";

const schedulePath = process.env.SCHEDULE_RECORDS_PATH || "data/schedule-records.json";
const mondayPath = process.env.MONDAY_JOBS_PATH || "data/monday-jobs.json";
const reportDir = process.env.REPORT_DIR || "reports";

const schedule = JSON.parse(await readFile(schedulePath, "utf8"));
const mondayJobs = await loadMondayJobs(mondayPath);
const mondayByJobNumber = new Map(mondayJobs.map((job) => [normalizeJobNumber(job.jobNumber), job]));
const records = schedule.records || [];
const weeks = [...new Map(records.map((record) => [record.weekName, record])).keys()];
const latestWeekName = latestWeek(records);
const latestRecords = records.filter((record) => record.weekName === latestWeekName);
const assignedRecords = latestRecords.filter((record) => record.status === "assigned");
const warnings = buildWarnings({ latestRecords, assignedRecords, mondayByJobNumber });

await mkdir(reportDir, { recursive: true });
const report = buildReport({
  schedule,
  weeks,
  latestWeekName,
  latestRecords,
  assignedRecords,
  mondayJobs,
  mondayByJobNumber,
  warnings
});

const reportPath = path.join(reportDir, "weekly-schedule-analysis.md");
await writeFile(reportPath, report);
console.log(`Wrote ${reportPath}`);

function latestWeek(records) {
  const sorted = [...new Set(records.map((record) => record.weekName))]
    .map((weekName) => {
      const first = records.find((record) => record.weekName === weekName);
      return { weekName, weekStart: first?.date || "" };
    })
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  return sorted.at(-1)?.weekName || "";
}

async function loadMondayJobs(filePath) {
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"));
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.jobs)) return parsed.jobs;
    return [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function buildReport({ schedule, weeks, latestWeekName, latestRecords, assignedRecords, mondayJobs, mondayByJobNumber, warnings }) {
  const weekSummary = weeks.map((weekName) => summarizeWeek(weekName, schedule.records));
  const dayLines = summarizeLatestByDay(latestRecords);
  const crewCapacity = summarizeCapacity(latestRecords);
  const scheduledJobs = summarizeScheduledJobs(assignedRecords, mondayByJobNumber);
  const openCoreCrews = crewCapacity.filter((item) => item.blankDays >= 5 && item.assignedDays === 0);

  return [
    `# Weekly Schedule Analysis`,
    ``,
    `Generated: ${new Date().toLocaleString()}`,
    ``,
    `## Latest Week`,
    ``,
    `Latest schedule tab: **${latestWeekName || "unknown"}**`,
    ``,
    `Assigned crew-days: **${assignedRecords.length}** out of **${latestRecords.length}** tracked crew-days.`,
    `Monday jobs loaded: **${mondayJobs.length}**.`,
    ``,
    `## Week Trend`,
    ``,
    `| Week | Assigned | Blank | Off | Placeholder | Assignment Rate |`,
    `|---|---:|---:|---:|---:|---:|`,
    ...weekSummary.map((row) => `| ${row.weekName} | ${row.assigned} | ${row.blank} | ${row.off} | ${row.placeholder} | ${row.assignmentRate}% |`),
    ``,
    `## Latest Week By Day`,
    ``,
    `| Day | Assigned | Blank | Notes |`,
    `|---|---:|---:|---|`,
    ...dayLines.map((row) => `| ${row.dayName} | ${row.assigned} | ${row.blank} | ${row.notes} |`),
    ``,
    `## Scheduled Jobs`,
    ``,
    scheduledJobs.length
      ? [
          `| Job | Crew/Days | Monday Match | Readiness |`,
          `|---|---|---|---|`,
          ...scheduledJobs.map((job) => `| ${job.jobLabel} | ${job.crewDays} | ${job.mondayMatch} | ${job.readiness} |`)
        ].join("\n")
      : `No assigned jobs found in the latest week.`,
    ``,
    `## Open Capacity To Diagnose`,
    ``,
    openCoreCrews.length
      ? openCoreCrews.map((item) => `- ${item.crew}: ${item.blankDays} blank day(s), no assignments.`).join("\n")
      : `No fully open crews detected.`,
    ``,
    `## Warnings`,
    ``,
    warnings.length ? warnings.map((warning) => `- **${warning.level}:** ${warning.message}`).join("\n") : `No warnings generated.`,
    ``,
    `## Next Actions For Claude Code`,
    ``,
    `1. Refresh \`data/monday-jobs.json\` from monday.com using \`prompts/02-extract-monday-jobs.md\`.`,
    `2. Confirm whether blanks mean true availability, carryover, material wait, or unavailable.`,
    `3. Add logistics board data for Noel, Arthur, Wilson, trailers, skid steers, and concrete pump work.`,
    `4. Re-run \`npm run analyze\` and review this report before making schedule changes.`,
    ``
  ].flat().join("\n");
}

function summarizeWeek(weekName, records) {
  const weekRecords = records.filter((record) => record.weekName === weekName);
  const counts = countStatuses(weekRecords);
  const total = weekRecords.length || 1;
  return {
    weekName,
    assigned: counts.assigned || 0,
    blank: counts.blank || 0,
    off: counts.off || 0,
    placeholder: counts.placeholder || 0,
    assignmentRate: Math.round(((counts.assigned || 0) / total) * 1000) / 10
  };
}

function summarizeLatestByDay(records) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return days.map((dayName) => {
    const dayRecords = records.filter((record) => record.dayName === dayName);
    const counts = countStatuses(dayRecords);
    const assignments = dayRecords
      .filter((record) => record.status === "assigned")
      .map((record) => `${record.crew}: ${singleLine(record.assignment)}`);
    return {
      dayName,
      assigned: counts.assigned || 0,
      blank: counts.blank || 0,
      notes: assignments.length ? assignments.join("; ") : "No assignments"
    };
  });
}

function summarizeCapacity(records) {
  return CREW_PROFILES.map((profile) => {
    const crewRecords = records.filter((record) => record.crewKey === profile.key);
    const counts = countStatuses(crewRecords);
    return {
      crew: profile.displayName,
      assignedDays: counts.assigned || 0,
      blankDays: counts.blank || 0,
      offDays: counts.off || 0
    };
  }).filter((item) => item.assignedDays + item.blankDays + item.offDays > 0);
}

function summarizeScheduledJobs(records, mondayByJobNumber) {
  const jobs = new Map();

  for (const record of records) {
    const jobNumbers = record.jobNumbers.length ? record.jobNumbers : [`no-number:${record.assignment}`];
    for (const number of jobNumbers) {
      if (!jobs.has(number)) {
        jobs.set(number, []);
      }
      jobs.get(number).push(record);
    }
  }

  return [...jobs.entries()].map(([jobNumber, jobRecords]) => {
    const mondayJob = mondayByJobNumber.get(normalizeJobNumber(jobNumber));
    const first = jobRecords[0];
    const label = jobNumber.startsWith("no-number:")
      ? `No job number: ${singleLine(first.assignment)}`
      : `#${jobNumber}`;
    const crewDays = jobRecords
      .map((record) => `${record.shortDay} ${record.crew}`)
      .join(", ");
    return {
      jobLabel: label,
      crewDays,
      mondayMatch: mondayJob ? mondayJob.itemName || mondayJob.customerName || "Matched" : "Missing",
      readiness: readinessText(mondayJob)
    };
  });
}

function buildWarnings({ latestRecords, assignedRecords, mondayByJobNumber }) {
  const warnings = [];
  const latestCounts = countStatuses(latestRecords);

  if ((latestCounts.assigned || 0) <= 4) {
    warnings.push({
      level: "High",
      message: "Latest week is barely scheduled. Treat blank cells as unknown, not automatically available."
    });
  }

  for (const record of assignedRecords) {
    if (record.crewKey === "others") {
      warnings.push({
        level: "Medium",
        message: `${record.shortDay} ${record.assignment} is under OTHERS. Assign a named crew or confirm the one-off crew before dispatch.`
      });
    }

    if (record.jobNumbers.length === 0) {
      warnings.push({
        level: "Medium",
        message: `${record.shortDay} ${record.crew} has an assignment with no job number: ${singleLine(record.assignment)}`
      });
    }

    if (record.crewKey === "penna") {
      warnings.push({
        level: "Medium",
        message: `Penna is scheduled ${record.shortDay}. Because reliability is a known risk, confirm backup plan and material readiness.`
      });
    }

    if (record.crewKey === "felipe_miliati" && record.inferredJobTypes.some((type) => ["pavers/deck", "wall", "concrete"].includes(type))) {
      warnings.push({
        level: "Medium",
        message: `Felipe is solo by default; ${record.shortDay} assignment may need helpers: ${singleLine(record.assignment)}`
      });
    }

    for (const jobNumber of record.jobNumbers) {
      const mondayJob = mondayByJobNumber.get(normalizeJobNumber(jobNumber));
      if (!mondayJob) {
        warnings.push({
          level: "Medium",
          message: `#${jobNumber} is on the schedule but was not found in data/monday-jobs.json.`
        });
        continue;
      }

      if (mondayJob.materialReady === false) {
        warnings.push({
          level: "High",
          message: `#${jobNumber} is scheduled ${record.shortDay}, but Monday says material is not ready.`
        });
      }

      if (mondayJob.driverNeeded && !mondayJob.logisticsOwner) {
        warnings.push({
          level: "High",
          message: `#${jobNumber} needs a driver/logistics owner, but none is listed.`
        });
      }
    }
  }

  return uniqueWarnings(warnings);
}

function countStatuses(records) {
  return records.reduce((counts, record) => {
    counts[record.status] = (counts[record.status] || 0) + 1;
    return counts;
  }, {});
}

function normalizeJobNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

function readinessText(job) {
  if (!job) return "No Monday data";
  const parts = [];
  if (job.status) parts.push(`status: ${job.status}`);
  if (job.materialReady === true) parts.push("material ready");
  if (job.materialReady === false) parts.push("material not ready");
  if (job.logisticsStatus) parts.push(`logistics: ${job.logisticsStatus}`);
  return parts.join("; ") || "Needs review";
}

function singleLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function uniqueWarnings(warnings) {
  const seen = new Set();
  return warnings.filter((warning) => {
    const key = `${warning.level}:${warning.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
