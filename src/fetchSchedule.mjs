import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { DEFAULT_SHEET_ID, DEFAULT_YEAR } from "./config.mjs";
import { discoverSheetTabsFromHtml, parseScheduleCsv } from "./scheduleParser.mjs";

const execFileAsync = promisify(execFile);

const args = parseArgs(process.argv.slice(2));
const sheetId = args["sheet-id"] || process.env.SCHEDULE_SHEET_ID || DEFAULT_SHEET_ID;
const year = Number(args.year || process.env.SCHEDULE_YEAR || DEFAULT_YEAR);
const outputDir = args.out || "data";
const onlyGid = args.gid || process.env.SCHEDULE_GID || "";

await mkdir(outputDir, { recursive: true });
await mkdir(path.join(outputDir, "raw"), { recursive: true });

const tabs = await discoverTabs(sheetId);
const selectedTabs = onlyGid ? tabs.filter((tab) => tab.gid === onlyGid) : tabs;

if (selectedTabs.length === 0) {
  throw new Error(`No sheet tabs found${onlyGid ? ` for gid ${onlyGid}` : ""}.`);
}

const weekOutputs = [];
const allRecords = [];

for (const tab of selectedTabs) {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${tab.gid}`;
  const csvText = await fetchText(csvUrl);
  await writeFile(path.join(outputDir, "raw", `${tab.gid}.csv`), csvText);

  const parsed = parseScheduleCsv({
    csvText,
    weekName: tab.name,
    gid: tab.gid,
    year
  });

  weekOutputs.push({
    name: tab.name,
    gid: tab.gid,
    weekStart: parsed.weekStart,
    rowCount: parsed.rowCount,
    recordCount: parsed.records.length
  });
  allRecords.push(...parsed.records);
}

await writeFile(path.join(outputDir, "schedule-tabs.json"), JSON.stringify(weekOutputs, null, 2));
await writeFile(path.join(outputDir, "schedule-records.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  sheetId,
  year,
  tabs: weekOutputs,
  records: allRecords
}, null, 2));

console.log(`Fetched ${selectedTabs.length} tab(s), wrote ${allRecords.length} crew-day records to ${path.join(outputDir, "schedule-records.json")}`);

async function discoverTabs(id) {
  const htmlUrl = `https://docs.google.com/spreadsheets/u/0/d/${id}/htmlview`;
  const html = await fetchText(htmlUrl);
  const tabs = discoverSheetTabsFromHtml(html);
  if (tabs.length > 0) return tabs;

  return [
    { name: "04/13 to 04/19", gid: "363716532" },
    { name: "04/20 to 04/26", gid: "1886263574" },
    { name: "04/27 to 05/03", gid: "2064676541" },
    { name: "05/04 to 05/10", gid: "1281702142" },
    { name: "05/11 to 05/17", gid: "374573657" }
  ];
}

async function fetchText(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Fetch failed ${response.status} ${response.statusText}: ${url}`);
    }
    return response.text();
  } catch (fetchError) {
    try {
      const { stdout } = await execFileAsync("curl", ["-L", "--fail", "--silent", "--show-error", url], {
        maxBuffer: 20 * 1024 * 1024
      });
      return stdout;
    } catch (curlError) {
      const cached = await readCachedText(url);
      if (cached !== null) return cached;
      throw new Error(`Could not fetch ${url}\nNode fetch error: ${fetchError.message}\nCurl error: ${curlError.message}`);
    }
  }
}

async function readCachedText(url) {
  const cachePath = cachePathForUrl(url);
  if (!cachePath) return null;

  try {
    return await readFile(cachePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function cachePathForUrl(url) {
  if (url.includes("/htmlview")) return path.join(outputDir, "raw", "htmlview.html");

  const gid = new URL(url).searchParams.get("gid");
  if (gid) return path.join(outputDir, "raw", `${gid}.csv`);

  return null;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}
