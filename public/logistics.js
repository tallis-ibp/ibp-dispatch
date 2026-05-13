/* IBP Dispatch Dashboard — logistics.js
   Handles the Logistics tab: driver route plans, approve & send. */

const todayISOl = () => new Date().toISOString().slice(0, 10);
let logisticsData = null;
let logisticsLoaded = false;

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-run-logistics")
    .addEventListener("click", onRunLogistics);
});

// Called by proposals.js tab switcher when logistics tab is opened
window.loadLogisticsIfNeeded = function () {
  if (!logisticsLoaded) loadLogistics();
};

async function loadLogistics() {
  logisticsLoaded = true;
  const content = document.getElementById("logistics-content");
  const loading = document.getElementById("logistics-loading");
  loading.classList.remove("hidden");
  content.innerHTML = "";

  try {
    const res = await fetch(`/api/logistics?date=${todayISOl()}`);
    if (!res.ok) { renderRuns(null); return; }
    logisticsData = await res.json();
    renderRuns(logisticsData);
  } catch {
    renderRuns(null);
  } finally {
    loading.classList.add("hidden");
  }
}

function renderRuns(data) {
  const content = document.getElementById("logistics-content");
  if (!data?.runs?.length) {
    content.innerHTML = `<div class="empty-state">
      No route plan yet. Click ↻ Build Route Plan to generate today's driver runs from the brief.
    </div>`;
    return;
  }
  const list = document.createElement("div");
  list.className = "runs-list";
  for (const run of data.runs) list.appendChild(buildRunCard(run));
  content.innerHTML = "";
  content.appendChild(list);
}

function buildRunCard(run) {
  const card = elL("div", `run-card${run.approved ? " approved" : ""}`);

  // Header
  const header = elL("div", "run-header");
  const title  = elL("div", "run-title", `Run #${run.runNumber} — ${run.jobName}`);
  const meta   = elL("div", "run-meta", `Driver: ${run.driverKey ?? "Noel"} · Crew: ${run.crewName ?? "—"}`);
  header.append(title, meta);
  if (run.sentAt) header.appendChild(elL("span", "sent-tag", "✓ Sent"));

  // Body
  const body = elL("div", "run-body");

  // Gate code override
  const gateRow = elL("div", "run-gate-row");
  const gateLabel = elL("label", "run-gate-label", "Gate code");
  const gateInput = elL("input", "run-gate-input");
  gateInput.type = "text";
  gateInput.placeholder = "Enter gate code or NA";
  gateInput.value = run.gateCode ?? "";
  let gateTimer;
  gateInput.addEventListener("input", () => {
    clearTimeout(gateTimer);
    gateTimer = setTimeout(() => saveGateCode(run, gateInput.value, gateInput), 600);
  });
  gateRow.append(gateLabel, gateInput);
  body.appendChild(gateRow);

  // Trailer
  if (run.trailerType) body.appendChild(row("Trailer", run.trailerType));
  if (run.flags?.needsGooseneck)   body.appendChild(flagEl("🔗 Gooseneck trailer required"));
  if (run.flags?.needsDumpTrailer) body.appendChild(flagEl("🚛 Dump trailer required"));
  if (run.flags?.twoTripWarning)   body.appendChild(flagEl("⚠️ Possible 2-trip job — verify load weight"));

  // Stop sequence
  if (run.stops?.length) {
    const stopsTitle = elL("div", "proposal-label", "Stop sequence");
    const stopsList  = elL("div", "stops-list");
    for (const stop of run.stops) {
      const item   = elL("div", "stop-item");
      const num    = elL("div", "stop-num", String(stop.order));
      const detail = elL("div", "stop-detail");
      detail.appendChild(elL("div", "stop-name", stop.location));
      if (stop.address) detail.appendChild(elL("div", "stop-addr", stop.address));
      if (stop.gateCode) detail.appendChild(elL("div", "stop-gate", `🔑 ${stop.gateCode}`));
      if (stop.action) detail.appendChild(elL("div", "stop-action", stop.action));
      item.append(num, detail);
      stopsList.appendChild(item);
    }
    body.append(stopsTitle, stopsList);
  }

  // Dispatch text preview
  if (run.dispatchText) {
    body.appendChild(elL("div", "proposal-label", "Telegram message preview"));
    body.appendChild(elL("div", "dispatch-mono", run.dispatchText));
  }

  // Actions
  if (!run.sentAt) {
    const actions = elL("div", "run-actions");
    const approveBtn = elL("button", "btn-approve-run", "✓ Approve & Send to Noel");
    approveBtn.addEventListener("click", async () => {
      approveBtn.disabled = true;
      approveBtn.textContent = "Sending…";
      try {
        const res = await fetch(`/api/logistics/${encodeURIComponent(run.id)}/approve?date=${todayISOl()}`, {
          method: "POST",
        });
        const data = await res.json();
        if (data.ok) {
          run.approved = true;
          run.sentAt   = data.run?.sentAt ?? new Date().toISOString();
          card.className = "run-card approved";
          approveBtn.className = "btn-approve-run sent";
          approveBtn.textContent = "✓ Sent";
          const tag = elL("span", "sent-tag", "✓ Sent");
          header.appendChild(tag);
          toastL(run.sentAt ? "Sent to Noel on Telegram" : "Approved (Telegram not configured yet)", "success");
        }
      } catch {
        approveBtn.disabled = false;
        approveBtn.textContent = "✓ Approve & Send to Noel";
        toastL("Send failed", "error");
      }
    });
    actions.appendChild(approveBtn);
    body.appendChild(actions);
  }

  card.append(header, body);
  return card;
}

async function onRunLogistics() {
  const btn     = document.getElementById("btn-run-logistics");
  const loading = document.getElementById("logistics-loading");
  btn.disabled  = true;
  btn.textContent = "Building…";
  loading.classList.remove("hidden");
  document.getElementById("logistics-content").innerHTML = "";
  logisticsData  = null;
  logisticsLoaded = false;

  try {
    const res = await fetch("/api/logistics/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: todayISOl() }),
    });
    logisticsData = await res.json();
    renderRuns(logisticsData);
    toastL(`${logisticsData.runs?.length ?? 0} driver run${logisticsData.runs?.length !== 1 ? "s" : ""} generated`, "success");
  } catch {
    document.getElementById("logistics-content").innerHTML =
      `<div class="empty-state">Failed to build route plan — check server logs.</div>`;
    toastL("Route plan failed", "error");
  } finally {
    loading.classList.add("hidden");
    btn.disabled = false;
    btn.textContent = "↻ Build Route Plan";
    logisticsLoaded = true;
  }
}

async function saveGateCode(run, value, inputEl) {
  try {
    const res = await fetch(`/api/logistics/${encodeURIComponent(run.id)}/gate?date=${todayISOl()}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gateCode: value }),
    });
    if (res.ok) {
      run.gateCode = value;
      inputEl.classList.remove("input-error");
      inputEl.classList.add("input-saved");
      setTimeout(() => inputEl.classList.remove("input-saved"), 1200);
      // Update the matching stop in the display
      const gateEls = inputEl.closest(".run-card")?.querySelectorAll(".stop-gate");
      for (const el of gateEls ?? []) {
        el.textContent = value ? `🔑 ${value}` : "";
      }
    }
  } catch {
    inputEl.classList.add("input-error");
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function elL(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function row(label, value) {
  const r = elL("div", "proposal-row");
  r.appendChild(elL("div", "proposal-label", label));
  r.appendChild(elL("div", "", value));
  return r;
}

function flagEl(text) {
  return elL("div", "proposal-warning", text);
}

let toastTimerL;
function toastL(message, type = "success") {
  const t = document.getElementById("toast");
  t.textContent = message;
  t.className = `toast ${type}`;
  clearTimeout(toastTimerL);
  toastTimerL = setTimeout(() => t.classList.add("hidden"), 3500);
}
