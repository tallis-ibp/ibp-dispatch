/**
 * src/server/index.mjs
 * Always-on HTTP server: serves dashboard, brief API, Telegram webhook.
 * Start with: node src/server/index.mjs
 */

import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";

const ROOT        = decodeURIComponent(new URL("../..", import.meta.url).pathname);
const PORT        = parseInt(process.env.PORT ?? "3000", 10);
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

// Lazy imports — loaded once on first use
let _generateBrief, _sendBrief, _sendCrewBrief, _photoHandler, _messageHandler, _scheduler, _logistics;
async function generateBrief(date) {
  if (!_generateBrief) ({ generateBrief: _generateBrief } = await import("../generateBriefs.mjs"));
  return _generateBrief(date);
}
async function sendBrief(brief) {
  if (!_sendBrief) ({ sendBrief: _sendBrief, sendCrewBrief: _sendCrewBrief } = await import("../telegram/dispatcher.mjs"));
  return _sendBrief(brief);
}
async function sendCrewBrief(brief, crewKey) {
  if (!_sendCrewBrief) ({ sendBrief: _sendBrief, sendCrewBrief: _sendCrewBrief } = await import("../telegram/dispatcher.mjs"));
  return _sendCrewBrief(brief, crewKey);
}
async function handlePhoto(update) {
  if (!_photoHandler) ({ handlePhoto: _photoHandler } = await import("../telegram/photoHandler.mjs"));
  return _photoHandler(update);
}
async function handleTextMessage(update) {
  if (!_messageHandler) ({ handleTextMessage: _messageHandler } = await import("../telegram/messageHandler.mjs"));
  return _messageHandler(update);
}
async function getScheduler() {
  if (!_scheduler) _scheduler = await import("../agents/schedulingAgent.mjs");
  return _scheduler;
}
async function getLogistics() {
  if (!_logistics) _logistics = await import("../agents/logisticsAgent.mjs");
  return _logistics;
}

// ── Telegram polling (when no public webhook URL available) ───────────────
{
  const { startPolling } = await import("../telegram/poller.mjs");
  startPolling(handleUpdate);
}

// ── 6 AM cron ─────────────────────────────────────────────────────────────
scheduleDailyBrief();

function scheduleDailyBrief() {
  const now  = new Date();
  const next = new Date(now);
  next.setHours(6, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const msUntil = next - now;
  console.log(`[cron] Daily brief scheduled in ${Math.round(msUntil / 60000)} min`);
  setTimeout(async () => {
    try {
      const today = todayISO();
      console.log(`[cron] Generating brief for ${today}`);
      const { execFile } = await import("node:child_process");
      const node = process.execPath;
      // Refresh schedule data first
      await run(node, [path.join(ROOT, "src/fetchSchedule.mjs")]);
      await generateBrief(today);
      console.log(`[cron] Brief ready for ${today}`);
    } catch (err) {
      console.error("[cron] Error generating brief:", err.message);
    }
    scheduleDailyBrief(); // reschedule next day
  }, msUntil);
}

async function run(cmd, args) {
  const { execFile } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (err, stdout, stderr) => {
      if (err) return reject(err);
      if (stdout) console.log(stdout.trim());
      if (stderr) console.error(stderr.trim());
      resolve();
    });
  });
}

// ── HTTP server ────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url    = new URL(req.url, `http://localhost:${PORT}`);
  const method = req.method;

  try {
    // Static dashboard files
    if (method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return serveFile(res, path.join(ROOT, "dashboard/index.html"), "text/html");
    }
    if (method === "GET" && url.pathname.startsWith("/dashboard/")) {
      const rel  = url.pathname.slice(1);
      const ext  = path.extname(rel);
      const mime = ext === ".js" ? "application/javascript" : ext === ".css" ? "text/css" : "text/plain";
      return serveFile(res, path.join(ROOT, rel), mime);
    }

    // ── API ──────────────────────────────────────────────────────────────
    if (url.pathname === "/api/briefs/today" && method === "GET") {
      return jsonResponse(res, await loadBrief(todayISO()));
    }

    const briefDateMatch = url.pathname.match(/^\/api\/briefs\/(\d{4}-\d{2}-\d{2})$/);
    if (briefDateMatch) {
      const date = briefDateMatch[1];
      if (method === "GET")   return jsonResponse(res, await loadBrief(date));
      if (method === "PATCH") return handlePatchBrief(req, res, date);
      if (method === "POST")  return handleApproveBrief(req, res, date);
    }

    if (url.pathname === "/api/generate" && method === "POST") {
      const body = await readBody(req);
      const date = body.date ?? todayISO();
      const brief = await generateBrief(date);
      return jsonResponse(res, brief);
    }

    if (url.pathname === "/api/photos" && method === "GET") {
      return jsonResponse(res, await listPhotos());
    }

    // Serve a local photo file to the dashboard
    if (url.pathname === "/api/photo-file" && method === "GET") {
      const filePath = url.searchParams.get("path");
      if (!filePath || !filePath.startsWith(ROOT)) {
        res.writeHead(400); res.end("Invalid path"); return;
      }
      return serveFile(res, filePath, "image/jpeg");
    }

    // Send brief to a single crew
    const crewSendMatch = url.pathname.match(/^\/api\/briefs\/(\d{4}-\d{2}-\d{2})\/crew\/(.+)$/);
    if (crewSendMatch && method === "POST") {
      const [, date, crewKey] = crewSendMatch;
      return handleSendCrew(req, res, date, decodeURIComponent(crewKey));
    }

    // ── Scheduling proposals ─────────────────────────────────────────────
    if (url.pathname === "/api/proposals" && method === "GET") {
      const date = url.searchParams.get("date") ?? todayISO();
      const s = await getScheduler();
      const data = await s.loadProposals(date);
      return jsonResponse(res, data ?? { proposals: [], generatedAt: null });
    }

    if (url.pathname === "/api/proposals/generate" && method === "POST") {
      const s = await getScheduler();
      const data = await s.generateProposals();
      return jsonResponse(res, data);
    }

    const proposalMatch = url.pathname.match(/^\/api\/proposals\/([^/]+)\/(approve|reject)$/);
    if (proposalMatch && method === "POST") {
      const [, proposalId, action] = proposalMatch;
      const date = url.searchParams.get("date") ?? todayISO();
      const body = await readBody(req);
      const s = await getScheduler();
      try {
        const proposal = action === "approve"
          ? await s.approveProposal(date, proposalId, body)
          : await s.rejectProposal(date, proposalId, body.reason ?? "");
        return jsonResponse(res, { ok: true, proposal });
      } catch (err) {
        res.writeHead(404); res.end(JSON.stringify({ error: err.message })); return;
      }
    }

    // ── Logistics plans ───────────────────────────────────────────────────
    if (url.pathname === "/api/logistics" && method === "GET") {
      const date = url.searchParams.get("date") ?? todayISO();
      const l = await getLogistics();
      return jsonResponse(res, await l.loadLogisticsPlan(date) ?? { runs: [], generatedAt: null });
    }

    if (url.pathname === "/api/logistics/generate" && method === "POST") {
      const body = await readBody(req);
      const date = body.date ?? todayISO();
      const l = await getLogistics();
      return jsonResponse(res, await l.generateLogisticsPlan(date));
    }

    const logisticsApproveMatch = url.pathname.match(/^\/api\/logistics\/([^/]+)\/approve$/);
    if (logisticsApproveMatch && method === "POST") {
      const [, runId] = logisticsApproveMatch;
      const date = url.searchParams.get("date") ?? todayISO();
      const l = await getLogistics();
      try {
        const run = await l.approveRun(date, runId);
        return jsonResponse(res, { ok: true, run });
      } catch (err) {
        res.writeHead(404); res.end(JSON.stringify({ error: err.message })); return;
      }
    }

    const logisticsGateMatch = url.pathname.match(/^\/api\/logistics\/([^/]+)\/gate$/);
    if (logisticsGateMatch && method === "PATCH") {
      const [, runId] = logisticsGateMatch;
      const date = url.searchParams.get("date") ?? todayISO();
      const body = await readBody(req);
      const l = await getLogistics();
      try {
        const plan = await l.loadLogisticsPlan(date);
        if (!plan) { res.writeHead(404); res.end(JSON.stringify({ error: "No plan" })); return; }
        const run = plan.runs.find(r => r.id === runId);
        if (!run) { res.writeHead(404); res.end(JSON.stringify({ error: "Run not found" })); return; }
        run.gateCode = body.gateCode ?? "";
        // Also update the job-site stop (the one that matches run.jobAddress)
        for (const stop of run.stops ?? []) {
          if (stop.location === run.jobName || stop.address === run.jobAddress) {
            stop.gateCode = run.gateCode;
          }
        }
        await l.saveLogisticsPlan(date, plan);
        return jsonResponse(res, { ok: true });
      } catch (err) {
        res.writeHead(500); res.end(JSON.stringify({ error: err.message })); return;
      }
    }

    // ── Dispatch chat ─────────────────────────────────────────────────────
    if (url.pathname === "/api/chat" && method === "POST") {
      const body = await readBody(req);
      const { messages, date } = body;
      if (!messages?.length) { res.writeHead(400); res.end("{}"); return; }
      try {
        const { chat } = await import("../agents/dispatchChat.mjs");
        const reply = await chat(messages, date ?? todayISO());
        return jsonResponse(res, { reply });
      } catch (err) {
        console.error("[chat] Error:", err.message);
        return jsonResponse(res, { reply: `Error: ${err.message}` });
      }
    }

    // ── Flags ─────────────────────────────────────────────────────────────
    if (url.pathname === "/api/flags" && method === "GET") {
      const date = url.searchParams.get("date") ?? todayISO();
      const flagsPath = path.join(ROOT, "data/flags", `${date}.json`);
      try {
        return jsonResponse(res, JSON.parse(await readFile(flagsPath, "utf8")));
      } catch {
        return jsonResponse(res, []);
      }
    }

    if (url.pathname === "/api/flags/teach" && method === "POST") {
      const body = await readBody(req);
      const { phrase, intent } = body;
      if (!phrase || !intent) { res.writeHead(400); res.end("{}"); return; }
      try {
        const learnPath = path.join(ROOT, "data/learned-phrases.json");
        let learned = [];
        try { learned = JSON.parse(await readFile(learnPath, "utf8")); } catch {}
        const existing = learned.find(e => e.phrase === phrase);
        if (!existing) {
          learned.push({ phrase, intent, learnedAt: new Date().toISOString() });
          await writeFile(learnPath, JSON.stringify(learned, null, 2));
        }
        console.log(`[teach] Learned: "${phrase}" → ${intent}`);
        return jsonResponse(res, { ok: true });
      } catch (err) {
        res.writeHead(500); res.end(JSON.stringify({ error: err.message })); return;
      }
    }

    const flagResolveMatch = url.pathname.match(/^\/api\/flags\/([^/]+)\/resolve$/);
    if (flagResolveMatch && method === "POST") {
      const flagId = flagResolveMatch[1];
      const date   = url.searchParams.get("date") ?? todayISO();
      const body   = await readBody(req);
      const flagsPath = path.join(ROOT, "data/flags", `${date}.json`);
      try {
        const flags = JSON.parse(await readFile(flagsPath, "utf8"));
        const flag  = flags.find(f => f.id === flagId);
        if (!flag) { res.writeHead(404); res.end("{}"); return; }
        flag.resolved   = true;
        flag.resolvedAt = new Date().toISOString();
        flag.note       = body.note ?? "";
        await writeFile(flagsPath, JSON.stringify(flags, null, 2));
        return jsonResponse(res, { ok: true });
      } catch (err) {
        res.writeHead(500); res.end(JSON.stringify({ error: err.message })); return;
      }
    }

    // ── Crew setup ───────────────────────────────────────────────────────
    if (url.pathname === "/api/crews" && method === "GET") {
      const raw = JSON.parse(await readFile(path.join(ROOT, "data/crew-telegram-groups.json"), "utf8").catch(() => "{}"));
      return jsonResponse(res, raw);
    }

    const crewPatchMatch = url.pathname.match(/^\/api\/crews\/([^/]+)$/);
    if (crewPatchMatch && method === "PATCH") {
      const crewKey = decodeURIComponent(crewPatchMatch[1]);
      const body = await readBody(req);
      const groupsPath = path.join(ROOT, "data/crew-telegram-groups.json");
      const groups = JSON.parse(await readFile(groupsPath, "utf8").catch(() => "{}"));
      if (!groups[crewKey]) { res.writeHead(404); res.end(JSON.stringify({ error: "Crew not found" })); return; }
      if (body.groupId  !== undefined) groups[crewKey].groupId  = String(body.groupId).trim();
      if (body.language !== undefined) groups[crewKey].language = body.language;
      await writeFile(groupsPath, JSON.stringify(groups, null, 2));
      return jsonResponse(res, { ok: true, crew: groups[crewKey] });
    }

    // ── Fleet availability ────────────────────────────────────────────────
    if (url.pathname === "/api/fleet/availability" && method === "GET") {
      const date = url.searchParams.get("date") ?? todayISO();
      try {
        const { fetchFleetCheckouts } = await import("../monday/fetchFleet.mjs");
        return jsonResponse(res, await fetchFleetCheckouts(date));
      } catch (err) {
        console.error("[fleet] Error:", err.message);
        return jsonResponse(res, { date, trailers: [], vehicles: [], equipment: [], checkouts: 0 });
      }
    }

    // ── Telegram webhook ─────────────────────────────────────────────────
    if (url.pathname === "/webhook/telegram" && method === "POST") {
      const secret = req.headers["x-telegram-bot-api-secret-token"] ?? "";
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
        res.writeHead(403); res.end("Forbidden"); return;
      }
      const update = await readBody(req);
      res.writeHead(200); res.end("ok");
      // Handle asynchronously so Telegram doesn't time out waiting
      handleUpdate(update).catch(err => console.error("[webhook] Error:", err.message));
      return;
    }

    res.writeHead(404); res.end("Not found");
  } catch (err) {
    console.error("[server] Error:", err.message);
    res.writeHead(500); res.end(err.message);
  }
});

server.listen(PORT, () => {
  console.log(`[server] IBP Dispatch running on http://localhost:${PORT}`);
  console.log(`[server] Dashboard: http://localhost:${PORT}/`);
});

// ── Route handlers ─────────────────────────────────────────────────────────

async function handlePatchBrief(req, res, date) {
  const body  = await readBody(req);
  const brief = await loadBrief(date);
  // Allow patching crew annotations and job-level fields
  if (body.crews) brief.crews = body.crews;
  await saveBrief(date, brief);
  return jsonResponse(res, { ok: true });
}

async function handleApproveBrief(req, res, date) {
  const brief = await loadBrief(date);
  brief.approved  = true;
  brief.approvedAt = new Date().toISOString();
  await saveBrief(date, brief);
  // Fire and forget the Telegram send
  sendBrief(brief).catch(err => console.error("[approve] Send error:", err.message));
  return jsonResponse(res, { ok: true, message: "Brief approved — sending to crews" });
}

async function handleSendCrew(req, res, date, crewKey) {
  const brief = await loadBrief(date);
  const crew = brief.crews?.find(c => c.crewKey === crewKey);
  if (!crew) {
    res.writeHead(404); res.end(JSON.stringify({ error: "Crew not found" })); return;
  }
  sendCrewBrief(brief, crewKey).catch(err => console.error("[send-crew] Error:", err.message));
  crew.sentAt = new Date().toISOString();
  await saveBrief(date, brief);
  return jsonResponse(res, { ok: true, message: `Sending to ${crew.displayName}` });
}

async function handleUpdate(update) {
  if (update.message?.photo) {
    await handlePhoto(update);
  }
  if (update.message?.text) {
    await handleTextMessage(update);
  }
}

// ── File helpers ───────────────────────────────────────────────────────────

async function loadBrief(date) {
  const filePath = path.join(ROOT, "data/briefs", `${date}.json`);
  let brief;
  try {
    brief = JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return generateBrief(date);
  }
  // Always sync telegramGroupId + language from live groups config
  try {
    const groups = JSON.parse(await readFile(path.join(ROOT, "data/crew-telegram-groups.json"), "utf8"));
    for (const crew of brief.crews ?? []) {
      const g = groups[crew.crewKey];
      if (g) {
        crew.telegramGroupId = g.groupId ?? crew.telegramGroupId;
        crew.language        = g.language ?? crew.language;
      }
    }
  } catch {}
  return brief;
}

async function saveBrief(date, brief) {
  const filePath = path.join(ROOT, "data/briefs", `${date}.json`);
  await writeFile(filePath, JSON.stringify(brief, null, 2));
}

async function listPhotos() {
  try {
    const { readdir } = await import("node:fs/promises");
    const photoRoot = path.join(ROOT, "data/photos");
    const days = await readdir(photoRoot).catch(() => []);
    const entries = [];
    for (const day of days.slice(-3)) { // last 3 days
      const files = await readdir(path.join(photoRoot, day)).catch(() => []);
      for (const f of files) {
        if (f.endsWith(".json")) {
          try {
            const meta = JSON.parse(await readFile(path.join(photoRoot, day, f), "utf8"));
            entries.push(meta);
          } catch {}
        }
      }
    }
    return entries.sort((a, b) => b.receivedAt?.localeCompare(a.receivedAt ?? "") ?? 0);
  } catch {
    return [];
  }
}

async function serveFile(res, filePath, contentType) {
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("Not found");
  }
}

function jsonResponse(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(raw); } catch { return {}; }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
