import type { ScheduleRecord } from '../types/index.js';
import {
  DAY_COLUMN_LIST,
  DEFAULT_YEAR,
  getCrewProfile,
  inferClientTypeFromJobNumber,
  inferJobTypes,
  normalizeName,
} from './config.js';

// ---------------------------------------------------------------------------
// Low-level CSV parser
// ---------------------------------------------------------------------------

export function parseCsv(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
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

    if (!inQuotes && char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    if (char !== '\r') {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Sheet tab discovery
// ---------------------------------------------------------------------------

export function discoverSheetTabsFromHtml(html: string): Array<{ name: string; gid: string }> {
  const tabs: Array<{ name: string; gid: string }> = [];
  const regex = /items\.push\(\{name: "((?:\\"|[^"])*)".*?gid: "(\d+)"/gs;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    tabs.push({
      name: decodeGoogleString(match[1]),
      gid: match[2],
    });
  }

  return tabs;
}

export function decodeGoogleString(value: string): string {
  return String(value || '')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export function parseWeekStart(weekName: string, year: number = DEFAULT_YEAR): Date | null {
  const match = String(weekName || '').match(/(\d{1,2})\/(\d{1,2})\s+to\s+(\d{1,2})\/(\d{1,2})/i);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function isoDate(date: Date | null): string {
  if (!date) return '';
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

export function cleanCell(value: string | undefined): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize an assignment cell: strip carriage returns and collapse surrounding
 * whitespace while preserving embedded newlines.
 */
export function normalizeAssignment(raw: string): string {
  return String(raw || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

/**
 * Extract all job numbers (5–8 digit sequences preceded by #) from a string.
 */
export function extractJobNumbers(text: string): string[] {
  const matches = String(text || '').match(/#\s*\d{5,8}/g) ?? [];
  return [...new Set(matches.map((m) => m.replace(/\D/g, '')))];
}

/**
 * Classify an assignment string into a status value.
 */
export function classifyStatus(assignment: string): ScheduleRecord['status'] {
  const normalized = cleanCell(assignment).toUpperCase();
  if (!normalized) return 'blank';
  if (normalized === 'OFF') return 'off';
  if (normalized === '.' || normalized === '-' || normalized === 'TBD') return 'placeholder';
  return 'assigned';
}

// ---------------------------------------------------------------------------
// Header-row detection
// ---------------------------------------------------------------------------

function isWeekHeaderRow(row: string[]): boolean {
  const first = cleanCell(row[0]);
  const second = cleanCell(row[1]);
  return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(first) || /^MONDAY\s+-/i.test(second);
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export interface ParsedWeek {
  weekName: string;
  gid: string;
  year: number;
  weekStart: string;
  rowCount: number;
  records: ScheduleRecord[];
}

export function parseScheduleCsv(
  csv: string,
  gid: string,
  weekName: string,
  weekStartDate: string,
  year: number = DEFAULT_YEAR,
): ScheduleRecord[] {
  const rows = parseCsv(csv);
  // weekStartDate is the ISO date string already computed by fetchSchedule;
  // keep backward compat by also accepting weekName-derived date.
  const weekStart = weekStartDate
    ? new Date(weekStartDate + 'T00:00:00Z')
    : parseWeekStart(weekName, year);

  let section = 'unknown';
  let headerCount = 0;
  const records: ScheduleRecord[] = [];

  rows.forEach((row, rowIndex) => {
    const firstCell = cleanCell(row[0]);

    if (isWeekHeaderRow(row)) {
      headerCount += 1;
      section = headerCount === 1 ? 'production crews' : 'service and repair crews';
      return;
    }

    if (!firstCell || firstCell.toUpperCase().startsWith('ORLANDO CREWS')) return;

    for (const day of DAY_COLUMN_LIST) {
      const crewName = cleanCell(row[day.crewColIndex]) || firstCell;
      const rawAssignment = String(row[day.colIndex] ?? '').trim();
      const assignment = normalizeAssignment(rawAssignment);
      const status = classifyStatus(assignment);
      const jobNumbers = extractJobNumbers(assignment);
      const profile = getCrewProfile(crewName);
      const date = weekStart ? isoDate(addDays(weekStart, day.dayIndex)) : '';

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
        inferredJobTypes: inferJobTypes(assignment),
      });
    }
  });

  return records;
}

/**
 * Full week parse — returns metadata plus records (mirrors .mjs parseScheduleCsv
 * object-argument variant for use by analyzeSchedule etc.).
 */
export function parseScheduleCsvFull(opts: {
  csvText: string;
  weekName: string;
  gid: string;
  year?: number;
}): ParsedWeek {
  const year = opts.year ?? DEFAULT_YEAR;
  const weekStart = parseWeekStart(opts.weekName, year);
  const records = parseScheduleCsv(
    opts.csvText,
    opts.gid,
    opts.weekName,
    weekStart ? isoDate(weekStart) : '',
    year,
  );
  const rows = parseCsv(opts.csvText);
  return {
    weekName: opts.weekName,
    gid: opts.gid,
    year,
    weekStart: weekStart ? isoDate(weekStart) : '',
    rowCount: rows.length,
    records,
  };
}

// Alias used by the .mjs analyzeSchedule import chain
export { normalizeName };
