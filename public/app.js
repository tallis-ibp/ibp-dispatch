/* IBP Dispatch Dashboard — app.js */

async function checkAuth() {
  try {
    const res = await fetch('/api/briefs/' + new Date().toISOString().slice(0, 10));
    if (res.status === 401) {
      document.getElementById('login-screen').style.display = 'flex';
      const appEl = document.getElementById('app');
      if (appEl) appEl.style.display = 'none';
      document.getElementById('login-telegram-btn').addEventListener('click', async () => {
        const r = await fetch('/api/auth/init', { method: 'POST' });
        const data = await r.json();
        window.open(data.telegramUrl, '_blank');
      });
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

function applyRoleControls() {
  const isViewer = new URLSearchParams(window.location.search).has('token');
  if (isViewer) {
    document.querySelectorAll('.scheduler-only').forEach((el) => {
      el.style.display = 'none';
    });
  }
}

const todayISO = () => new Date().toISOString().slice(0, 10);
let currentBrief = null;
let saveTimer = null;
let takenTrailers = new Set(); // loaded from Fleet Events

// ── Boot ─────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const authed = await checkAuth();
  if (!authed) return;
  applyRoleControls();

  document.getElementById("date-label").textContent = formatDate(todayISO());

  await loadBrief();
  await loadPhotos();
  await loadFlags();
  loadFleetAvailability();

  document.getElementById("btn-generate").addEventListener("click", onGenerate);
  document.getElementById("btn-approve-all").addEventListener("click", onApproveAll);

  // Poll photos + flags every 30 s
  setInterval(loadPhotos, 30_000);
  setInterval(loadFlags, 30_000);
});

// ── Brief ─────────────────────────────────────────────────────────────────
async function loadBrief() {
  const loading = document.getElementById("brief-loading");
  const content = document.getElementById("brief-content");
  loading.classList.remove("hidden");
  content.classList.add("hidden");

  try {
    const res = await fetch(`/api/briefs/${todayISO()}`);
    currentBrief = await res.json();
    renderBrief(currentBrief);
  } catch (err) {
    loading.textContent = "Failed to load brief. Click ↻ to retry.";
    console.error(err);
  }
}

function renderBrief(brief) {
  const loading = document.getElementById("brief-loading");
  const content = document.getElementById("brief-content");

  if (!brief?.crews?.length) {
    loading.textContent = "No assignments found for today. Click ↻ to regenerate.";
    return;
  }

  content.innerHTML = "";
  for (const crew of brief.crews) {
    content.appendChild(buildCrewCard(crew));
  }

  loading.classList.add("hidden");
  content.classList.remove("hidden");
  renderPreflightBanner(brief);
}

function renderPreflightBanner(brief) {
  const banner = document.getElementById("preflight-banner");
  if (!banner) return;

  const issues = [];

  for (const crew of brief.crews ?? []) {
    // Unlinked Telegram group
    if (!crew.telegramGroupId) {
      issues.push({ level: "warn", msg: `${crew.displayName} — no Telegram group linked` });
    }
    for (const job of crew.jobs ?? []) {
      // Missing trailer when one is likely needed
      if (!job.trailerType && job.riskFlags?.some(f => /trailer|gooseneck|dump/i.test(f))) {
        issues.push({ level: "warn", msg: `Trailer not assigned — ${job.jobName}` });
      }
    }
  }

  if (!issues.length) {
    banner.classList.add("hidden");
    return;
  }

  const alerts = issues.filter(i => i.level === "alert");
  const warns  = issues.filter(i => i.level === "warn");

  banner.innerHTML = "";
  if (alerts.length) {
    const block = el("div", "preflight-block preflight-alert");
    block.appendChild(el("div", "preflight-heading", `🔴 ${alerts.length} issue${alerts.length > 1 ? "s" : ""} require action`));
    for (const i of alerts) block.appendChild(el("div", "preflight-item", i.msg));
    banner.appendChild(block);
  }
  if (warns.length) {
    const block = el("div", "preflight-block preflight-warn");
    block.appendChild(el("div", "preflight-heading", `🟡 ${warns.length} warning${warns.length > 1 ? "s" : ""}`));
    for (const i of warns) {
      const row = el("div", "preflight-item");
      row.textContent = i.msg;
      // If it's a Telegram warning, add a "Set up" link
      if (i.msg.includes("no Telegram group")) {
        const crewName = i.msg.split(" —")[0];
        const crew = brief.crews.find(c => c.displayName === crewName);
        if (crew) {
          const btn = el("button", "preflight-setup-btn", "Set up →");
          btn.addEventListener("click", () => openCrewSetup(crew));
          row.appendChild(btn);
        }
      }
      block.appendChild(row);
    }
    banner.appendChild(block);
  }
  banner.classList.remove("hidden");
}

function buildCrewCard(crew) {
  const card = el("div", "crew-card");

  // Header
  const header = el("div", "crew-header");
  const nameEl = el("div", "crew-name", crew.displayName);
  const meta   = el("div", "crew-meta");

  const relBadge = el("span", `badge badge-${crew.reliability ?? "unknown"}`,
    crew.reliability ?? "?");

  const langBadge = el("span", "lang-badge", (crew.language ?? "en").toUpperCase());

  const sendBtn = el("button", crew.sentAt ? "btn-send-crew sent" : "btn-send-crew",
    crew.sentAt ? "✓ Sent" : "Send");
  sendBtn.dataset.crewKey = crew.crewKey;
  if (!crew.telegramGroupId) {
    sendBtn.disabled = true;
    sendBtn.title = "No Telegram group configured";
  }
  sendBtn.addEventListener("click", () => onSendCrew(crew.crewKey, sendBtn));

  meta.append(relBadge, langBadge, sendBtn);
  header.append(nameEl, meta);

  // Body
  const body = el("div", "crew-body");
  for (const job of crew.jobs) {
    body.appendChild(buildJobEntry(job, crew));
  }

  card.append(header, body);
  return card;
}

function buildJobEntry(job, crew) {
  const entry = el("div", "job-entry");
  entry.dataset.jobNumber = job.jobNumber;

  // Title row
  const jobHeader = el("div", "job-header");
  const nameEl    = el("div", "job-name", job.jobName ?? job.jobNumber);
  const numEl     = el("span", "job-number", `#${job.jobNumber}`);
  jobHeader.append(nameEl, numEl);

  // Address
  const addrEl = el("div", "job-address");
  if (job.address) {
    const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(job.address)}`;
    const link = el("a", "", job.address);
    link.href = mapsUrl;
    link.target = "_blank";
    addrEl.appendChild(link);
  } else {
    addrEl.textContent = "Address TBD";
  }

  // ── Override fields ───────────────────────────────────────────────────
  const overrides = el("div", "job-overrides");

  // Gate code override
  const gateWrap = el("div", "override-row");
  gateWrap.appendChild(el("span", "override-label", "Gate code"));
  const gateInput = el("input", "override-input");
  gateInput.type = "text";
  gateInput.placeholder = job.gateCode === "❓ Confirm" ? "Enter gate code…" : (job.gateCode ?? "Enter gate code…");
  const isKnownGate = job.gateCode && job.gateCode !== "❓ Confirm";
  if (isKnownGate) gateInput.value = job.gateCode;
  gateInput.addEventListener("input", () => scheduleOverrideSave(crew.crewKey, job.jobNumber, { gateCode: gateInput.value || "❓ Confirm" }));
  gateWrap.appendChild(gateInput);
  overrides.appendChild(gateWrap);

  // Supervisor override
  const supWrap = el("div", "override-row");
  supWrap.appendChild(el("span", "override-label", "Supervisor"));
  const supInput = el("input", "override-input");
  supInput.type = "text";
  supInput.placeholder = job.supervisor || "Enter name…";
  if (job.supervisor) supInput.value = job.supervisor;
  supInput.addEventListener("input", () => scheduleOverrideSave(crew.crewKey, job.jobNumber, { supervisor: supInput.value }));
  supWrap.appendChild(supInput);
  overrides.appendChild(supWrap);

  // Trailer override (real fleet list)
  const trailerWrap = el("div", "override-row");
  trailerWrap.appendChild(el("span", "override-label", "Trailer"));
  const trailerSel = buildTrailerSelect(job.trailerType);
  trailerSel.addEventListener("change", () => scheduleOverrideSave(crew.crewKey, job.jobNumber, { trailerType: trailerSel.value }));
  trailerWrap.appendChild(trailerSel);
  overrides.appendChild(trailerWrap);

  // Crew reassign
  const crewWrap = el("div", "override-row");
  crewWrap.appendChild(el("span", "override-label", "Reassign crew"));
  const crewSel = buildCrewReassignSelect(crew.crewKey);
  crewSel.addEventListener("change", () => scheduleOverrideSave(crew.crewKey, job.jobNumber, { reassignTo: crewSel.value }));
  crewWrap.appendChild(crewSel);
  overrides.appendChild(crewWrap);

  // Risk flags
  const risksEl = el("div", "risk-flags");
  for (const flag of (job.riskFlags ?? [])) {
    risksEl.appendChild(el("div", "risk-flag", flag));
  }

  // Annotations textarea
  const annotEl = el("textarea", "job-annotations");
  annotEl.placeholder = "Add notes for coordinator…";
  annotEl.value = job.annotations ?? "";
  annotEl.addEventListener("input", () => scheduleSave(crew.crewKey, job.jobNumber, annotEl.value));

  // Dispatch preview
  const preview = el("div", "dispatch-preview");
  preview.innerHTML = renderDispatch(localizeDispatch(job.dispatchText ?? "", crew.language));

  entry.append(jobHeader, addrEl, overrides);
  if (risksEl.children.length) entry.appendChild(risksEl);
  entry.append(annotEl, preview);

  return entry;
}

// Real trailer list from Fleet Events board (Monday.com)
const TRAILERS = [
  "",
  "D1 GREEN (DUMP TRAILER)-2006",
  "D2 BLUE (DUMP TRAILER)-2015",
  "D3 YELLOW (DUMP TRAILER)-2020",
  "D4 RED (DUMP TRAILER)-2015",
  "D5 GRAY (DUMP TRAILER DAYTONA)-2009",
  "G1 ORANGE (NEW GOOSENECK)-2022",
  "G2 PINK (OLD GOOSENECK)-2022",
  "G3 PURPLE (BIG GOOSENECK)-2006",
  "2019 FLAT GOOSENECK TRAILER BLACK",
  "F2 BIG BOY (BIG FLAT TRAILER)-2020",
  "F3 76' FLAT (FLAT TRAILER DAYTONA)-1976",
  "F4 SMALL FLAT (TRAILER TEREX)-2015",
  "StucF1 SMALL FLAT TRAILER-2022",
  "CT1 (TRAILER DIAMOND) 5X8-2021",
  "CT2 (CLOSED TRAILER) WHITE 6X12-2006",
  "2017 TRAILER 7X14 GRY-BRONCO",
];

function buildTrailerSelect(current) {
  const sel = document.createElement("select");
  sel.className = "override-select";
  for (const t of TRAILERS) {
    const o = document.createElement("option");
    o.value = t;
    const taken = t && takenTrailers.has(t);
    o.textContent = t ? (taken ? `${t} — IN USE` : t) : "— Select trailer —";
    if (taken) { o.disabled = true; o.className = "option-taken"; }
    if (current && t.toLowerCase().includes(current.toLowerCase())) { o.selected = true; o.disabled = false; }
    sel.appendChild(o);
  }
  return sel;
}

async function loadFleetAvailability() {
  try {
    const res = await fetch(`/api/fleet/availability?date=${todayISO()}`);
    if (!res.ok) return;
    const data = await res.json();
    takenTrailers = new Set(data.trailers ?? []);
    // Re-render all trailer selects already on the page
    if (takenTrailers.size > 0) {
      document.querySelectorAll(".override-select").forEach(sel => {
        for (const o of sel.options) {
          if (!o.value) continue;
          const taken = takenTrailers.has(o.value);
          o.disabled = taken && o.value !== sel.value;
          if (taken) {
            if (!o.textContent.includes("IN USE")) o.textContent += " — IN USE";
          }
        }
      });
    }
    if (takenTrailers.size > 0) {
      console.log(`[fleet] ${takenTrailers.size} trailer(s) in use today:`, [...takenTrailers]);
    }
  } catch (err) {
    console.warn("[fleet] Could not load fleet availability:", err.message);
  }
}

const CREWS = [
  { key: "", label: "— Reassign to… —" },
  { key: "santiago",         label: "Santiago" },
  { key: "penna",            label: "Penna" },
  { key: "waype",            label: "Waype" },
  { key: "fausto",           label: "Fausto" },
  { key: "toby",             label: "Toby" },
  { key: "ludwing_tarcizio", label: "Ludwing / Tarcizio" },
  { key: "mario_wilcher",    label: "Mario / Wilcher" },
  { key: "wanderson",        label: "Wanderson" },
  { key: "marcelao",         label: "Marcelao" },
  { key: "ysaias",           label: "Ysaias" },
  { key: "gervin_julio",     label: "Gervin / Julio" },
  { key: "bruno_pacheco",    label: "Bruno Pacheco" },
  { key: "mauro_tile",       label: "Mauro Tile Crew" },
];

function buildCrewReassignSelect(currentKey) {
  const sel = document.createElement("select");
  sel.className = "override-select";
  for (const c of CREWS) {
    const o = document.createElement("option");
    o.value = c.key;
    o.textContent = c.label;
    sel.appendChild(o);
  }
  return sel;
}

// ── Actions ───────────────────────────────────────────────────────────────
async function onGenerate() {
  const btn = document.getElementById("btn-generate");
  btn.disabled = true;
  btn.textContent = "Generating…";
  try {
    await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: todayISO() }) });
    await loadBrief();
    toast("Brief regenerated", "success");
  } catch (err) {
    toast("Failed to regenerate", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "↻ Regenerate";
  }
}

async function onApproveAll() {
  const btn = document.getElementById("btn-approve-all");
  btn.disabled = true;
  btn.textContent = "Sending…";
  try {
    const res = await fetch(`/api/briefs/${todayISO()}`, { method: "POST" });
    const data = await res.json();
    toast(data.message ?? "Sent to all crews", "success");
    btn.textContent = "✓ Sent";
    // Mark all send buttons as sent
    document.querySelectorAll(".btn-send-crew").forEach(b => {
      b.textContent = "✓ Sent";
      b.className = "btn-send-crew sent";
    });
  } catch (err) {
    toast("Send failed — check server logs", "error");
    btn.disabled = false;
    btn.textContent = "✓ Approve & Send All";
  }
}

async function onSendCrew(crewKey, btn) {
  btn.disabled = true;
  btn.textContent = "Sending…";
  try {
    await fetch(`/api/briefs/${todayISO()}/crew/${crewKey}`, { method: "POST" });
    btn.textContent = "✓ Sent";
    btn.className = "btn-send-crew sent";
    toast(`Sent to ${crewKey}`, "success");
  } catch {
    btn.disabled = false;
    btn.textContent = "Send";
    toast("Send failed", "error");
  }
}

function scheduleSave(crewKey, jobNumber, annotations) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveAnnotations(crewKey, jobNumber, annotations), 800);
}

let overrideTimer;
function scheduleOverrideSave(crewKey, jobNumber, fields) {
  if (!currentBrief) return;
  // Apply immediately to in-memory brief
  const crew = currentBrief.crews.find(c => c.crewKey === crewKey);
  if (!crew) return;
  const job = crew.jobs.find(j => j.jobNumber === jobNumber);
  if (!job) return;
  Object.assign(job, fields);
  // Rebuild dispatch text with new values if key fields changed
  if (fields.gateCode || fields.supervisor || fields.trailerType) {
    job.dispatchText = rebuildDispatch(job, crew.language);
    // Re-render the preview in the DOM
    const entry = document.querySelector(`[data-job-number="${jobNumber}"]`);
    if (entry) {
      const preview = entry.querySelector(".dispatch-preview");
      if (preview) preview.innerHTML = renderDispatch(job.dispatchText);
    }
  }
  clearTimeout(overrideTimer);
  overrideTimer = setTimeout(async () => {
    try {
      await fetch(`/api/briefs/${todayISO()}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crews: currentBrief.crews }),
      });
    } catch {}
  }, 600);
}

async function saveAnnotations(crewKey, jobNumber, annotations) {
  if (!currentBrief) return;
  const crew = currentBrief.crews.find(c => c.crewKey === crewKey);
  if (!crew) return;
  const job = crew.jobs.find(j => j.jobNumber === jobNumber);
  if (job) job.annotations = annotations;
  try {
    await fetch(`/api/briefs/${todayISO()}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ crews: currentBrief.crews }),
    });
  } catch {}
}

// ── Photos ────────────────────────────────────────────────────────────────
async function loadPhotos() {
  try {
    const res   = await fetch("/api/photos");
    const photos = await res.json();
    renderPhotos(photos);
  } catch {}
}

function renderPhotos(photos) {
  const feed = document.getElementById("photos-feed");
  if (!photos.length) {
    feed.innerHTML = `<div class="empty-state">No photos yet today.</div>`;
    return;
  }
  feed.innerHTML = "";
  for (const p of photos) {
    feed.appendChild(buildPhotoEntry(p));
  }
}

function buildPhotoEntry(p) {
  const entry = el("div", "photo-entry");

  const meta = el("div", "photo-meta");
  meta.innerHTML = `<span class="photo-crew">${p.crewDisplay ?? p.crewKey ?? "Unknown"}</span>
    <span class="photo-time">${formatTime(p.receivedAt)}</span>`;

  if (p.localPath) {
    const img = el("img", "photo-img");
    img.src   = `/api/photo-file?path=${encodeURIComponent(p.localPath)}`;
    img.alt   = "Crew photo";
    entry.appendChild(img);
  }

  if (p.aiSummary) {
    entry.appendChild(el("div", "photo-ai-summary", p.aiSummary));
  }

  if (p.completionStatus) {
    const statusClass = p.completionStatus === "done" ? "status-done"
      : p.completionStatus === "in-progress" ? "status-in-progress" : "status-unknown";
    entry.appendChild(el("span", `photo-status ${statusClass}`,
      p.completionStatus === "done" ? "✓ Job Complete"
        : p.completionStatus === "in-progress" ? "⏳ In Progress" : "❓ Unknown"));
  }

  if (p.caption) entry.appendChild(el("div", "photo-caption", `"${p.caption}"`));
  if (p.mondayUpdated) entry.appendChild(el("div", "photo-monday", "✓ Logged to Monday.com"));

  entry.insertBefore(meta, entry.firstChild);
  return entry;
}

// ── Flags ─────────────────────────────────────────────────────────────────

async function loadFlags() {
  try {
    const res = await fetch(`/api/flags?date=${todayISO()}`);
    if (!res.ok) return;
    const flags = await res.json();
    renderFlags(flags);
  } catch {}
}

function renderFlags(flags) {
  const feed  = document.getElementById("flags-feed");
  const badge = document.getElementById("flags-badge");
  if (!feed) return;

  const open = flags.filter(f => !f.resolved);
  badge.textContent = open.length;
  badge.classList.toggle("hidden", open.length === 0);

  if (!flags.length) {
    feed.innerHTML = `<div class="empty-state">No unknown messages.</div>`;
    return;
  }

  feed.innerHTML = "";
  for (const flag of [...flags].reverse()) {
    feed.appendChild(buildFlagCard(flag));
  }
}

function buildFlagCard(flag) {
  const card = el("div", `flag-card${flag.resolved ? " flag-resolved" : ""}`);

  const header = el("div", "flag-header");
  header.appendChild(el("span", "flag-crew", flag.displayName));
  header.appendChild(el("span", "flag-sender", flag.sender));
  header.appendChild(el("span", "flag-time", formatTime(flag.timestamp)));
  card.appendChild(header);

  card.appendChild(el("div", "flag-text", `"${flag.text}"`));

  if (flag.resolved) {
    const res = el("div", "flag-note", flag.note ? `✓ ${flag.note}` : "✓ Dismissed");
    card.appendChild(res);
  } else {
    const actions = el("div", "flag-actions");

    const noteInput = el("input", "flag-note-input");
    noteInput.type = "text";
    noteInput.placeholder = "Add note (optional)…";

    const dismissBtn = el("button", "btn-flag-dismiss", "Dismiss");
    dismissBtn.addEventListener("click", async () => {
      dismissBtn.disabled = true;
      await resolveFlag(flag.id, noteInput.value);
      card.className = "flag-card flag-resolved";
      card.querySelector(".flag-actions")?.remove();
      card.appendChild(el("div", "flag-note", noteInput.value ? `✓ ${noteInput.value}` : "✓ Dismissed"));
      updateFlagBadge(-1);
    });

    const teachBtn = el("button", "btn-flag-teach", "Teach bot →");
    teachBtn.addEventListener("click", () => openTeachModal(flag));

    actions.append(noteInput, dismissBtn, teachBtn);
    card.appendChild(actions);
  }

  return card;
}

async function resolveFlag(flagId, note) {
  try {
    await fetch(`/api/flags/${encodeURIComponent(flagId)}/resolve?date=${todayISO()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
  } catch {}
}

function updateFlagBadge(delta) {
  const badge = document.getElementById("flags-badge");
  if (!badge) return;
  const current = parseInt(badge.textContent) || 0;
  const next = current + delta;
  badge.textContent = next;
  badge.classList.toggle("hidden", next <= 0);
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}

// ── Teach modal ───────────────────────────────────────────────────────────
let _teachFlag = null;

function openTeachModal(flag) {
  _teachFlag = flag;
  document.getElementById("teach-phrase").textContent = flag.text;
  document.getElementById("teach-intent").value = "arrived";
  document.getElementById("teach-modal").classList.remove("hidden");
}

window.closeTeachModal = function () {
  document.getElementById("teach-modal").classList.add("hidden");
  _teachFlag = null;
};

window.saveTeach = async function () {
  if (!_teachFlag) return;
  const intent = document.getElementById("teach-intent").value;
  const btn = document.getElementById("teach-save-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const res = await fetch("/api/flags/teach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phrase: _teachFlag.text, intent }),
    });
    if (res.ok) {
      // Also dismiss the flag
      await resolveFlag(_teachFlag.id, `Taught as: ${intent}`);
      toast(`Taught: "${_teachFlag.text}" → ${intent}`, "success");
      closeTeachModal();
      await loadFlags();
    }
  } catch {
    toast("Save failed", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save & Teach";
  }
};

// ── Crew setup modal ──────────────────────────────────────────────────────
let _setupCrew = null;

function openCrewSetup(crew) {
  _setupCrew = crew;
  document.getElementById("modal-crew-name").textContent = `Connect — ${crew.displayName}`;
  document.getElementById("modal-group-id").value = crew.telegramGroupId ?? "";
  document.getElementById("modal-lang").value = crew.language ?? "en";
  document.getElementById("crew-setup-modal").classList.remove("hidden");
}

window.closeCrewSetup = function () {
  document.getElementById("crew-setup-modal").classList.add("hidden");
  _setupCrew = null;
};

window.saveCrewSetup = async function () {
  if (!_setupCrew) return;
  const groupId  = document.getElementById("modal-group-id").value.trim();
  const language = document.getElementById("modal-lang").value;
  const btn      = document.getElementById("modal-save-btn");
  btn.disabled   = true;
  btn.textContent = "Saving…";
  try {
    const res = await fetch(`/api/crews/${encodeURIComponent(_setupCrew.crewKey)}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ groupId, language }),
    });
    if (res.ok) {
      toast(`${_setupCrew.displayName} connected`, "success");
      // Update local brief so send button enables
      if (currentBrief) {
        const c = currentBrief.crews.find(c => c.crewKey === _setupCrew.crewKey);
        if (c) { c.telegramGroupId = groupId; c.language = language; }
        renderBrief(currentBrief);
      }
      closeCrewSetup();
    }
  } catch {
    toast("Save failed", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save";
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function formatDate(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US",
    { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}


function localizeDispatch(text, lang) {
  return text;
}

function rebuildDispatch(job, lang) {
  const L = {
    en: { addr:"ADDRESS", gate:"GATE CODE", sup:"SUP", trailer:"TRAILER", task:"TASK", mat:"MATERIAL", next:"NEXT" },
    es: { addr:"DIRECCIÓN", gate:"CÓDIGO GATE", sup:"SUP", trailer:"TRÁILER", task:"TAREA", mat:"MATERIAL", next:"PRÓXIMO" },
    pt: { addr:"ENDEREÇO", gate:"CÓDIGO GATE", sup:"SUP", trailer:"TRAILER", task:"TAREFA", mat:"MATERIAL", next:"PRÓXIMO" },
  }[lang] ?? { addr:"ADDRESS", gate:"GATE CODE", sup:"SUP", trailer:"TRAILER", task:"TASK", mat:"MATERIAL", next:"NEXT" };

  const matLines = (job.materials ?? []).map(m => `- ${m.item}: ${m.quantity}`).join("\n");
  const taskLines = (job.tasks ?? [job.jobName]).join("\n");
  const title = job.jobName?.includes(`#${job.jobNumber}`) ? job.jobName : `${job.jobName} #${job.jobNumber}`;

  return [
    `*${title}*`, ``,
    `*${L.addr}:* ${job.address || "TBD"}`,
    `*${L.gate}:* ${job.gateCode || "❓ Confirm"}`,
    `*${L.sup}:* ${job.supervisor || "TBD"}`,
    job.trailerType ? `*${L.trailer}:* ${job.trailerType}` : null,
    ``, `*${L.task}:*`, taskLines,
    matLines ? `\n*${L.mat}:*\n${matLines}` : null,
    ``, `*${L.next}:* ${job.nextStop || "Warehouse"}`,
  ].filter(l => l !== null).join("\n");
}

function renderDispatch(text) {
  // Convert Telegram Markdown to clean HTML rows
  return text
    .split("\n")
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return `<div class="dp-spacer"></div>`;

      // Bold label + value: *LABEL:* value
      const labelMatch = trimmed.match(/^\*([^*]+):\*\s*(.*)$/);
      if (labelMatch) {
        const label = labelMatch[1];
        const value = labelMatch[2] || "";
        return `<div class="dp-row"><span class="dp-label">${label}</span><span class="dp-value">${escHtml(value)}</span></div>`;
      }

      // Job title line: *JOB NAME*
      const titleMatch = trimmed.match(/^\*([^*]+)\*$/);
      if (titleMatch) {
        return `<div class="dp-title">${escHtml(titleMatch[1])}</div>`;
      }

      // Material list item: - item: qty
      if (trimmed.startsWith("- ")) {
        return `<div class="dp-item">${escHtml(trimmed.slice(2))}</div>`;
      }

      return `<div class="dp-line">${escHtml(trimmed)}</div>`;
    })
    .join("");
}

function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

let toastTimer;
function toast(message, type = "success") {
  const t = document.getElementById("toast");
  t.textContent = message;
  t.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 3500);
}
