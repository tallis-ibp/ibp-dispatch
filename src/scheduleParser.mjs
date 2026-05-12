import { DAY_COLUMNS, DEFAULT_YEAR, getCrewProfile, inferClientTypeFromJobNumber, inferJobTypes } from "./config.mjs";

export function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (char !== "\r") {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

export function discoverSheetTabsFromHtml(html) {
  const tabs = [];
  const regex = /items\.push\(\{name: "((?:\\"|[^"])*)".*?gid: "(\d+)"/gs;
  let match;

  while ((match = regex.exec(html)) !== null) {
    tabs.push({
      name: decodeGoogleString(match[1]),
      gid: match[2]
    });
  }

  return tabs;
}

export function decodeGoogleString(value) {
  return String(value || "")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

export function parseWeekStart(weekName, year = DEFAULT_YEAR) {
  const match = String(weekName || "").match(/(\d{1,2})\/(\d{1,2})\s+to\s+(\d{1,2})\/(\d{1,2})/i);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(date, days) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function isoDate(date) {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export function parseScheduleCsv({ csvText, weekName, gid, year = DEFAULT_YEAR }) {
  const rows = parseCsv(csvText);
  const weekStart = parseWeekStart(weekName, year);
  let section = "unknown";
  let headerCount = 0;
  const records = [];

  rows.forEach((row, rowIndex) => {
    const firstCell = cleanCell(row[0]);

    if (isWeekHeaderRow(row)) {
      headerCount += 1;
      section = headerCount === 1 ? "production crews" : "service and repair crews";
      return;
    }

    if (!firstCell || firstCell.toUpperCase().startsWith("ORLANDO CREWS")) return;

    for (const day of DAY_COLUMNS) {
      const crewName = cleanCell(row[day.crewColIndex]) || firstCell;
      const rawAssignment = String(row[day.colIndex] || "").trim();
      const assignment = normalizeAssignment(rawAssignment);
      const status = assignmentStatus(assignment);
      const jobNumbers = extractJobNumbers(assignment);
      const profile = getCrewProfile(crewName);
      const date = weekStart ? isoDate(addDays(weekStart, day.dayIndex)) : "";

      records.push({
        weekName,
        gid,
        section,
        date,
        dayName: day.dayName,
        shortDay: day.shortDay,
        dayIndex: day.dayIndex,
        crew: crewName,
        crewKey: profile.key,
        crewCategory: profile.category,
        reliability: profile.reliability,
        rowNumber: rowIndex + 1,
        columnNumber: day.colIndex + 1,
        rawAssignment,
        assignment,
        status,
        jobNumbers,
        clientTypes: [...new Set(jobNumbers.map(inferClientTypeFromJobNumber))],
        inferredJobTypes: inferJobTypes(assignment)
      });
    }
  });

  return {
    weekName,
    gid,
    year,
    weekStart: isoDate(weekStart),
    rowCount: rows.length,
    records
  };
}

export function cleanCell(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function normalizeAssignment(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

export function assignmentStatus(value) {
  const normalized = cleanCell(value).toUpperCase();
  if (!normalized) return "blank";
  if (normalized === "OFF") return "off";
  if (normalized === "." || normalized === "-" || normalized === "TBD") return "placeholder";
  return "assigned";
}

export function extractJobNumbers(value) {
  const matches = String(value || "").match(/#\s*\d{5,8}/g) || [];
  return [...new Set(matches.map((match) => match.replace(/\D/g, "")))];
}

function isWeekHeaderRow(row) {
  const first = cleanCell(row[0]);
  const second = cleanCell(row[1]);
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(first) || /^MONDAY\s+-/i.test(second);
}
