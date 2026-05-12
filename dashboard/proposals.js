/* IBP Dispatch Dashboard — proposals.js
   Handles the Schedule tab: loading, rendering, and acting on proposals. */

const todayISOp = () => new Date().toISOString().slice(0, 10);
let proposalsData = null;

// ── Tab switching ─────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("btn-run-scheduler")
    .addEventListener("click", onRunScheduler);

  // Load proposals lazily when schedule tab is first opened
});

function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tabName));
  ["dispatch", "schedule", "logistics"].forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle("hidden", t !== tabName);
    document.getElementById(`${t}-actions`).classList.toggle("hidden", t !== tabName);
  });

  if (tabName === "schedule" && !proposalsData) loadProposals();
  if (tabName === "logistics") window.loadLogisticsIfNeeded?.();
}

// ── Load proposals ────────────────────────────────────────────────────────
async function loadProposals() {
  const content = document.getElementById("proposals-content");
  const loading = document.getElementById("proposals-loading");
  loading.classList.remove("hidden");
  content.innerHTML = "";

  try {
    const res = await fetch(`/api/proposals?date=${todayISOp()}`);
    if (!res.ok) {
      renderProposals(null);
    } else {
      proposalsData = await res.json();
      renderProposals(proposalsData);
    }
  } catch (err) {
    content.innerHTML = `<div class="empty-state">Failed to load proposals — check server connection.</div>`;
    console.error(err);
  } finally {
    loading.classList.add("hidden");
  }
}

function renderProposals(data) {
  const content = document.getElementById("proposals-content");

  if (!data?.proposals?.length) {
    content.innerHTML = `<div class="empty-state">
      No proposals yet. Click ↻ Run Agent to generate schedule proposals from Monday.com jobs.
    </div>`;
    return;
  }

  const list = document.createElement("div");
  list.className = "proposals-list";
  for (const p of data.proposals) {
    list.appendChild(buildProposalCard(p));
  }
  content.innerHTML = "";
  content.appendChild(list);
}

function buildProposalCard(p) {
  const card = elp("div", `proposal-card ${p.status !== "pending" ? p.status : ""}`);

  // Header
  const header = elp("div", "proposal-header");
  const nameEl = elp("div", "proposal-name", p.jobName);
  const typesEl = elp("div", "proposal-types", p.jobTypes?.join(" · ") ?? "");
  header.append(nameEl, typesEl);

  if (p.status !== "pending") {
    const tag = elp("span", `proposal-status-tag ${p.status}`,
      p.status === "approved" ? "✓ Approved" : "✕ Rejected");
    header.appendChild(tag);
  }

  // Body
  const body = elp("div", "proposal-body");

  // Key fields
  body.appendChild(row("Proposed date", p.proposedDate ?? "TBD"));
  body.appendChild(row("Est. duration", `${p.estimatedDays} day${p.estimatedDays !== 1 ? "s" : ""}`));
  body.appendChild(row("Address", p.address || "—"));
  body.appendChild(row("Builder", p.builder || "—"));
  body.appendChild(row("Materials", p.materialNote || "—"));
  if (p.equipmentNeeded) body.appendChild(row("Equipment", p.equipmentNeeded));

  // Reasoning
  if (p.reasoning) {
    const r = elp("div", "proposal-reasoning", p.reasoning);
    body.appendChild(r);
  }

  // Flags
  if (p.blockers?.length || p.warnings?.length) {
    const flags = elp("div", "proposal-flags");
    for (const b of (p.blockers ?? [])) flags.appendChild(elp("div", "proposal-blocker", b));
    for (const w of (p.warnings ?? [])) flags.appendChild(elp("div", "proposal-warning", w));
    body.appendChild(flags);
  }

  // Actions (only for pending)
  if (p.status === "pending") {
    const actions = elp("div", "proposal-actions");

    // Crew override select
    const crewLabel = elp("span", "", "Crew: ");
    crewLabel.style.fontSize = "12px";
    crewLabel.style.color = "var(--text-dim)";

    const crewSelect = buildCrewSelect(p.proposedCrew, p.alternativeCrews);
    crewSelect.className = "crew-override";

    const approveBtn = elp("button", "btn-approve", "✓ Approve");
    approveBtn.addEventListener("click", async () => {
      approveBtn.disabled = true;
      approveBtn.textContent = "Approving…";
      try {
        const res = await fetch(`/api/proposals/${encodeURIComponent(p.id)}/approve?date=${todayISOp()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ crewKey: crewSelect.value }),
        });
        const data = await res.json();
        if (data.ok) {
          p.status = "approved";
          card.className = "proposal-card approved";
          approveBtn.className = "btn-approve done";
          approveBtn.textContent = "✓ Approved";
          actions.innerHTML = "";
          actions.appendChild(approveBtn);
          const tag = elp("span", "proposal-status-tag approved", "✓ Approved");
          header.appendChild(tag);
          toastp("Approved — Monday.com updated", "success");
        }
      } catch {
        approveBtn.disabled = false;
        approveBtn.textContent = "✓ Approve";
        toastp("Approve failed", "error");
      }
    });

    const rejectBtn = elp("button", "btn-reject", "✕ Skip");
    rejectBtn.addEventListener("click", async () => {
      rejectBtn.disabled = true;
      try {
        await fetch(`/api/proposals/${encodeURIComponent(p.id)}/reject?date=${todayISOp()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Skipped by coordinator" }),
        });
        p.status = "rejected";
        card.className = "proposal-card rejected";
        actions.innerHTML = `<span class="proposal-status-tag rejected">✕ Skipped</span>`;
        const tag = elp("span", "proposal-status-tag rejected", "✕ Skipped");
        header.appendChild(tag);
      } catch {
        rejectBtn.disabled = false;
        toastp("Skip failed", "error");
      }
    });

    const mondayLink = elp("a", "", "View in Monday ↗");
    mondayLink.href = p.mondayUrl ?? "#";
    mondayLink.target = "_blank";
    mondayLink.style.cssText = "font-size:12px;color:var(--accent);text-decoration:none;margin-left:auto";

    actions.append(crewLabel, crewSelect, approveBtn, rejectBtn, mondayLink);
    body.appendChild(actions);
  }

  card.append(header, body);
  return card;
}

function buildCrewSelect(proposedKey, alternatives) {
  const select = document.createElement("select");
  const allOptions = [
    { key: proposedKey, label: proposedKey ?? "—" },
    ...(alternatives ?? []).map(a => ({ key: a.key, label: a.displayName })),
  ].filter((o, i, arr) => o.key && arr.findIndex(x => x.key === o.key) === i);

  for (const opt of allOptions) {
    const o = document.createElement("option");
    o.value = opt.key;
    o.textContent = opt.label;
    if (opt.key === proposedKey) o.selected = true;
    select.appendChild(o);
  }
  return select;
}

function row(label, value) {
  const r = elp("div", "proposal-row");
  r.appendChild(elp("div", "proposal-label", label));
  r.appendChild(elp("div", "", value));
  return r;
}

// ── Run scheduler ─────────────────────────────────────────────────────────
async function onRunScheduler() {
  const btn = document.getElementById("btn-run-scheduler");
  const loading = document.getElementById("proposals-loading");
  btn.disabled = true;
  btn.textContent = "Running…";
  loading.classList.remove("hidden");
  document.getElementById("proposals-content").innerHTML = "";
  proposalsData = null;

  try {
    const res = await fetch("/api/proposals/generate", { method: "POST" });
    proposalsData = await res.json();
    renderProposals(proposalsData);
    toastp(`${proposalsData.proposals?.length ?? 0} proposals generated`, "success");
  } catch (err) {
    document.getElementById("proposals-content").innerHTML =
      `<div class="empty-state">Agent failed to run. Check server logs.</div>`;
    toastp("Scheduler failed", "error");
  } finally {
    loading.classList.add("hidden");
    btn.disabled = false;
    btn.textContent = "↻ Run Agent";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function elp(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

let toastTimerP;
function toastp(message, type = "success") {
  const t = document.getElementById("toast");
  t.textContent = message;
  t.className = `toast ${type}`;
  clearTimeout(toastTimerP);
  toastTimerP = setTimeout(() => t.classList.add("hidden"), 3500);
}
