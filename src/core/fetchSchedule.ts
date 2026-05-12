import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ScheduleRecord } from '../types/index.js';
import { DEFAULT_SHEET_ID, DEFAULT_YEAR } from './config.js';
import { discoverSheetTabsFromHtml, parseScheduleCsvFull } from './scheduleParser.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FetchScheduleOptions {
  sheetId?: string;
  year?: number;
  outputDir?: string;
  onlyGid?: string;
}

export interface WeekSummary {
  name: string;
  gid: string;
  weekStart: string;
  rowCount: number;
  recordCount: number;
}

export interface FetchScheduleResult {
  generatedAt: string;
  sheetId: string;
  year: number;
  tabs: WeekSummary[];
  records: ScheduleRecord[];
}

export async function fetchSchedule(opts: FetchScheduleOptions = {}): Promise<ScheduleRecord[]> {
  const sheetId = opts.sheetId ?? process.env['SCHEDULE_SHEET_ID'] ?? DEFAULT_SHEET_ID;
  const year = opts.year ?? Number(process.env['SCHEDULE_YEAR'] ?? DEFAULT_YEAR);
  const outputDir = opts.outputDir ?? 'data';
  const onlyGid = opts.onlyGid ?? process.env['SCHEDULE_GID'] ?? '';

  await mkdir(outputDir, { recursive: true });
  await mkdir(path.join(outputDir, 'raw'), { recursive: true });

  const tabs = await discoverTabs(sheetId, outputDir);
  const selectedTabs = onlyGid ? tabs.filter((tab) => tab.gid === onlyGid) : tabs;

  if (selectedTabs.length === 0) {
    throw new Error(`No sheet tabs found${onlyGid ? ` for gid ${onlyGid}` : ''}.`);
  }

  const weekOutputs: WeekSummary[] = [];
  const allRecords: ScheduleRecord[] = [];

  for (const tab of selectedTabs) {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${tab.gid}`;
    const csvText = await fetchText(csvUrl, outputDir);
    await writeFile(path.join(outputDir, 'raw', `${tab.gid}.csv`), csvText);

    const parsed = parseScheduleCsvFull({
      csvText,
      weekName: tab.name,
      gid: tab.gid,
      year,
    });

    weekOutputs.push({
      name: tab.name,
      gid: tab.gid,
      weekStart: parsed.weekStart,
      rowCount: parsed.rowCount,
      recordCount: parsed.records.length,
    });
    allRecords.push(...parsed.records);
  }

  await writeFile(
    path.join(outputDir, 'schedule-tabs.json'),
    JSON.stringify(weekOutputs, null, 2),
  );

  const result: FetchScheduleResult = {
    generatedAt: new Date().toISOString(),
    sheetId,
    year,
    tabs: weekOutputs,
    records: allRecords,
  };

  await writeFile(
    path.join(outputDir, 'schedule-records.json'),
    JSON.stringify(result, null, 2),
  );

  console.log(
    `Fetched ${selectedTabs.length} tab(s), wrote ${allRecords.length} crew-day records to ${path.join(outputDir, 'schedule-records.json')}`,
  );

  return allRecords;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function discoverTabs(
  sheetId: string,
  outputDir: string,
): Promise<Array<{ name: string; gid: string }>> {
  const htmlUrl = `https://docs.google.com/spreadsheets/u/0/d/${sheetId}/htmlview`;
  const html = await fetchText(htmlUrl, outputDir);
  const tabs = discoverSheetTabsFromHtml(html);
  if (tabs.length > 0) return tabs;

  // Fallback to known tabs
  return [
    { name: '04/13 to 04/19', gid: '363716532' },
    { name: '04/20 to 04/26', gid: '1886263574' },
    { name: '04/27 to 05/03', gid: '2064676541' },
    { name: '05/04 to 05/10', gid: '1281702142' },
    { name: '05/11 to 05/17', gid: '374573657' },
  ];
}

async function fetchText(url: string, outputDir: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Fetch failed ${response.status} ${response.statusText}: ${url}`);
    }
    return response.text();
  } catch (fetchError) {
    try {
      const { stdout } = await execFileAsync('curl', ['-L', '--fail', '--silent', '--show-error', url], {
        maxBuffer: 20 * 1024 * 1024,
      });
      return stdout;
    } catch (curlError) {
      const cached = await readCachedText(url, outputDir);
      if (cached !== null) return cached;
      throw new Error(
        `Could not fetch ${url}\nNode fetch error: ${(fetchError as Error).message}\nCurl error: ${(curlError as Error).message}`,
      );
    }
  }
}

async function readCachedText(url: string, outputDir: string): Promise<string | null> {
  const cachePath = cachePathForUrl(url, outputDir);
  if (!cachePath) return null;

  try {
    return await readFile(cachePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function cachePathForUrl(url: string, outputDir: string): string | null {
  if (url.includes('/htmlview')) return path.join(outputDir, 'raw', 'htmlview.html');

  const gid = new URL(url).searchParams.get('gid');
  if (gid) return path.join(outputDir, 'raw', `${gid}.csv`);

  return null;
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

if (import.meta.url === new URL(process.argv[1] ?? '', import.meta.url).href) {
  const args = parseArgs(process.argv.slice(2));
  await fetchSchedule({
    sheetId: typeof args['sheet-id'] === 'string' ? args['sheet-id'] : undefined,
    year: args['year'] ? Number(args['year']) : undefined,
    outputDir: typeof args['out'] === 'string' ? args['out'] : undefined,
    onlyGid: typeof args['gid'] === 'string' ? args['gid'] : undefined,
  });
}
