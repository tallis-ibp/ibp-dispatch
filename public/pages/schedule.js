/* IBP Dispatch — Schedule page v3 (sheet embed + AI proposals) */

// Source planilha — the human scheduler's master view. Edited in Google Sheets,
// embedded here so the dispatcher sees both the human plan and the AI proposals.
// Sheet must be shared as "Anyone with the link can view" for the iframe to render.
const SHEET_ID = '1516H1ZQImJ4arKe6wYeFMqFw6V_-697QM-HiBs7qOY8';
const SHEET_DEFAULT_GID = '526995137'; // active week tab — adjust if Lucas changes it
const SHEET_EDIT_URL  = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SHEET_DEFAULT_GID}#gid=${SHEET_DEFAULT_GID}`;
const SHEET_EMBED_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SHEET_DEFAULT_GID}&rm=minimal&widget=true&headers=false#gid=${SHEET_DEFAULT_GID}`;

IBP.registerRoute('schedule', async (main) => {
  const today = IBP.todayISO();

  // Header
  const header = IBP.el('div', 'page-header');
  const left = IBP.el('div');
  left.appendChild(IBP.el('h1', 'page-title', 'Schedule'));
  left.appendChild(IBP.el('div', 'page-meta',
    'Human-planned weekly schedule (source) above · AI proposals for the next 7 days below.'));
  header.appendChild(left);

  const runBtn = IBP.el('button', 'btn btn-primary');
  runBtn.innerHTML = '<i class="ti ti-sparkles"></i><span>Run agent for today</span>';
  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    runBtn.innerHTML = '<span class="spinner"></span><span>Running…</span>';
    try {
      const result = await IBP.fetchJson('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today }),
      });
      const count = Array.isArray(result) ? result.length : 0;
      if (count === 0) {
        IBP.toast(
          'Agent ran but generated 0 proposals — likely no Monday jobs with material_ready=1 today, or no crews with reliability set. Sync Monday from Settings + set reliability on crews.',
          'error',
        );
      } else {
        IBP.toast(`Agent generated ${count} proposal${count === 1 ? '' : 's'}`, 'success');
      }
      IBP.render();
    } catch (err) {
      IBP.toast(err.message || 'Agent failed', 'error');
      runBtn.disabled = false;
      runBtn.innerHTML = '<i class="ti ti-sparkles"></i><span>Run agent for today</span>';
    }
  });
  header.appendChild(runBtn);
  main.appendChild(header);

  // ─── Embedded Google Sheet (human-planned weekly schedule) ───
  main.appendChild(buildSheetEmbed());

  // Skeleton state
  const wrap = IBP.el('div');
  const skel = IBP.el('div');
  for (let i = 0; i < 2; i++) {
    skel.appendChild(IBP.skeleton('30%', 12));
    const grp = IBP.el('div');
    grp.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin:8px 0 16px;';
    for (let j = 0; j < 3; j++) grp.appendChild(IBP.skeleton('100%', 44));
    skel.appendChild(grp);
  }
  wrap.appendChild(skel);
  main.appendChild(wrap);

  // Fetch proposals
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  let allProposals = [];
  try {
    const responses = await Promise.all(
      dates.map((d) => fetch(`/api/proposals?date=${d}`).then((r) => r.ok ? r.json() : [])),
    );
    allProposals = responses.flat();
  } catch (err) {
    wrap.innerHTML = '';
    wrap.appendChild(IBP.emptyState({
      icon: 'alert-triangle',
      title: 'Failed to load proposals',
      sub: err.message,
    }));
    return;
  }

  wrap.innerHTML = '';

  if (!allProposals.length) {
    wrap.appendChild(IBP.emptyState({
      icon: 'calendar-off',
      title: 'No proposals scheduled',
      sub: 'Run the agent to have the AI scan today\'s jobs and pair them with available crews.',
      ctaLabel: 'Run agent for today',
      ctaAction: () => runBtn.click(),
    }));
    return;
  }

  // Stats
  const pending = allProposals.filter((p) => p.status === 'pending').length;
  const approved = allProposals.filter((p) => p.status === 'approved').length;
  const rejected = allProposals.filter((p) => p.status === 'rejected').length;
  const stats = IBP.el('div', 'stat-strip');
  stats.style.gridTemplateColumns = 'repeat(4, 1fr)';
  stats.innerHTML = `
    <div class="stat-card"><div class="stat-num">${IBP.roundNum(allProposals.length)}</div><div class="stat-label">Total proposals</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--warning-700)">${IBP.roundNum(pending)}</div><div class="stat-label">Pending review</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--success-700)">${IBP.roundNum(approved)}</div><div class="stat-label">Approved</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--ink-400)">${IBP.roundNum(rejected)}</div><div class="stat-label">Rejected</div></div>
  `;
  wrap.appendChild(stats);

  // Convert-to-brief CTA: turns approved proposals for TODAY into brief_jobs ready to dispatch
  if (approved > 0) {
    const todayApproved = allProposals.filter((p) => p.status === 'approved' && p.date === today).length;
    if (todayApproved > 0) {
      const banner = IBP.el('div');
      banner.style.cssText = 'background:var(--paper);border:1px solid var(--success-100);border-left:3px solid var(--success-700);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;';
      banner.innerHTML = `
        <div style="font-size:13px;color:var(--ink-700);">
          <strong>${IBP.roundNum(todayApproved)}</strong> approved proposal${todayApproved === 1 ? '' : 's'} for today are ready to convert into a dispatchable brief.
        </div>
      `;
      const convertBtn = IBP.el('button', 'btn btn-primary btn-sm');
      convertBtn.innerHTML = '<i class="ti ti-clipboard-check"></i><span>Generate today\'s brief</span>';
      convertBtn.addEventListener('click', async () => {
        convertBtn.disabled = true;
        convertBtn.innerHTML = '<span class="spinner"></span><span>Generating…</span>';
        try {
          await IBP.fetchJson('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: today }),
          });
          IBP.toast('Brief generated — go to Dispatch to send', 'success');
          IBP.navigate('dispatch');
        } catch (err) {
          IBP.toast(err.message || 'Generate failed', 'error');
          convertBtn.disabled = false;
          convertBtn.innerHTML = '<i class="ti ti-clipboard-check"></i><span>Generate today\'s brief</span>';
        }
      });
      banner.appendChild(convertBtn);
      wrap.appendChild(banner);
    }
  }

  // Group by date
  const byDate = new Map();
  for (const p of allProposals) {
    if (!byDate.has(p.date)) byDate.set(p.date, []);
    byDate.get(p.date).push(p);
  }

  // Timeline
  const timeline = IBP.el('div');
  timeline.style.cssText = 'display:flex;flex-direction:column;gap:18px;';

  for (const [date, props] of [...byDate.entries()].sort()) {
    timeline.appendChild(buildDayGroup(date, props));
  }
  wrap.appendChild(timeline);
});

function buildDayGroup(date, props) {
  const group = IBP.el('div');

  // Day header
  const dayHead = IBP.el('div');
  dayHead.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px;';

  const dayPill = IBP.el('div');
  const isToday = date === IBP.todayISO();
  const isPast = date < IBP.todayISO();
  dayPill.style.cssText = `
    display:flex;align-items:center;justify-content:center;
    min-width:48px;height:48px;border-radius:8px;
    background:${isToday ? 'var(--navy-900)' : isPast ? 'var(--paper-alt)' : 'var(--paper)'};
    color:${isToday ? '#fff' : isPast ? 'var(--ink-400)' : 'var(--ink-900)'};
    border:1px solid ${isToday ? 'var(--navy-900)' : 'var(--border-soft)'};
    flex-direction:column;
    line-height:1;
  `;
  const d = new Date(date + 'T12:00:00');
  const day = d.getDate();
  const monthShort = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  dayPill.innerHTML = `
    <div style="font-size:10px;letter-spacing:0.04em;opacity:0.7;">${monthShort}</div>
    <div style="font-size:18px;font-weight:500;">${day}</div>
  `;
  dayHead.appendChild(dayPill);

  const labelWrap = IBP.el('div');
  const dayLabel = IBP.el('div');
  dayLabel.style.cssText = 'font-size:14px;font-weight:500;color:var(--ink-900);';
  dayLabel.textContent = isToday ? `Today · ${d.toLocaleDateString('en-US', { weekday: 'long' })}` : d.toLocaleDateString('en-US', { weekday: 'long' });
  labelWrap.appendChild(dayLabel);
  const dayMeta = IBP.el('div');
  dayMeta.style.cssText = 'font-size:11px;color:var(--ink-500);';
  const pendingCount = props.filter((p) => (p.status || 'pending') === 'pending').length;
  dayMeta.textContent = `${IBP.roundNum(props.length)} proposal${props.length === 1 ? '' : 's'}${pendingCount ? ` · ${pendingCount} pending` : ''}`;
  labelWrap.appendChild(dayMeta);
  dayHead.appendChild(labelWrap);
  group.appendChild(dayHead);

  // Proposals
  const list = IBP.el('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-left:8px;padding-left:24px;border-left:1px dashed var(--border-medium);';

  for (const p of props) {
    list.appendChild(buildProposalCard(p));
  }
  group.appendChild(list);
  return group;
}

function buildProposalCard(p) {
  const crewKey = p.crew_key ?? p.crewKey ?? '?';
  const jobName = p.job_name ?? p.jobName ?? '—';
  const jobNum  = p.job_number ?? p.jobNumber ?? '?';
  const status = p.status ?? 'pending';
  const confidence = p.confidence ?? 'medium';

  const card = IBP.el('div', 'proposal-card');

  const row = IBP.el('div', 'proposal-row');
  const info = IBP.el('div');
  info.style.cssText = 'display:flex;gap:10px;align-items:center;min-width:0;flex:1;';

  info.appendChild(IBP.avatar(crewKey, 'sm'));

  const text = IBP.el('div');
  text.style.cssText = 'display:flex;flex-direction:column;gap:1px;min-width:0;';
  const line1 = IBP.el('div');
  line1.style.cssText = 'font-size:13px;color:var(--ink-900);font-weight:500;';
  line1.textContent = crewKey;
  text.appendChild(line1);
  const line2 = IBP.el('div');
  line2.style.cssText = 'font-size:12px;color:var(--ink-600);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  line2.innerHTML = `${IBP.escHtml(jobName)} · <span style="font-family:JetBrains Mono,Menlo,monospace;color:var(--ink-400);">#${IBP.escHtml(jobNum)}</span>`;
  text.appendChild(line2);
  info.appendChild(text);

  const badges = IBP.el('div');
  badges.style.cssText = 'display:flex;gap:6px;align-items:center;';
  badges.appendChild(IBP.el('span',
    `badge ${confidence === 'high' ? 'success' : confidence === 'low' ? 'warning' : 'info'}`,
    confidence));

  const actions = IBP.el('div');
  actions.style.cssText = 'display:flex;gap:4px;';
  if (status === 'pending') {
    const approveBtn = IBP.el('button', 'btn-icon');
    approveBtn.title = 'Approve';
    approveBtn.innerHTML = '<i class="ti ti-check" style="color:var(--success-700)"></i>';
    approveBtn.addEventListener('click', (e) => { e.stopPropagation(); updateProposal(p.id, 'approved'); });
    const rejectBtn = IBP.el('button', 'btn-icon');
    rejectBtn.title = 'Reject';
    rejectBtn.innerHTML = '<i class="ti ti-x" style="color:var(--danger-700)"></i>';
    rejectBtn.addEventListener('click', (e) => { e.stopPropagation(); updateProposal(p.id, 'rejected'); });
    actions.appendChild(approveBtn);
    actions.appendChild(rejectBtn);
  } else {
    actions.appendChild(IBP.el('span', `badge ${status === 'approved' ? 'success' : 'danger'}`, status));
  }
  badges.appendChild(actions);

  row.appendChild(info);
  row.appendChild(badges);
  card.appendChild(row);

  if (p.reasoning) {
    const r = IBP.el('div', 'proposal-reasoning', p.reasoning);
    card.appendChild(r);
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => card.classList.toggle('expanded'));
  }
  return card;
}

function buildSheetEmbed() {
  // Default COLLAPSED — keeps the AI proposals as the primary focus.
  // User's preference (if any) sticks via localStorage.
  const pref = localStorage.getItem('ibp.sheetEmbed.collapsed');
  const collapsed = pref === null ? true : pref === '1';
  const card = IBP.el('div', `sheet-embed-card ${collapsed ? 'collapsed' : ''}`);

  const head = IBP.el('div', 'sheet-embed-head');
  head.innerHTML = `
    <div class="sheet-embed-title">
      <i class="ti ti-table brand"></i>
      <div class="sheet-embed-title-text">
        <span class="label">Weekly schedule · source planilha</span>
        <span class="sub">Edited in Google Sheets by the human scheduler. Updates live.</span>
      </div>
    </div>
    <div class="sheet-embed-actions">
      <a class="btn btn-outline btn-sm" target="_blank" rel="noopener" href="${SHEET_EDIT_URL}">
        <i class="ti ti-external-link"></i><span>Open in Google Sheets</span>
      </a>
      <span class="btn-caret"><i class="ti ti-chevron-down"></i></span>
    </div>
  `;
  // Click on the head (but not on the "Open" anchor) toggles collapse
  head.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    card.classList.toggle('collapsed');
    localStorage.setItem('ibp.sheetEmbed.collapsed',
      card.classList.contains('collapsed') ? '1' : '0');
  });
  card.appendChild(head);

  const body = IBP.el('div', 'sheet-embed-body');
  const iframe = IBP.el('iframe', 'sheet-embed-iframe');
  iframe.src = SHEET_EMBED_URL;
  iframe.loading = 'lazy';
  iframe.referrerPolicy = 'no-referrer-when-downgrade';
  iframe.title = 'Weekly schedule (Google Sheets)';
  iframe.addEventListener('load', () => iframe.classList.add('loaded'));

  // Fallback message in case the sheet isn't shared publicly (iframe stays blank)
  const fallback = IBP.el('div', 'sheet-embed-fallback');
  fallback.innerHTML = `
    <i class="ti ti-lock" style="font-size:24px;color:var(--ink-400)"></i>
    <span class="label">Sheet not accessible</span>
    <span class="sub">If you see a sign-in screen, share the sheet as <strong>Anyone with the link can view</strong> in Google Sheets.</span>
  `;
  body.appendChild(iframe);
  body.appendChild(fallback);
  card.appendChild(body);

  return card;
}

async function updateProposal(id, status) {
  try {
    await IBP.fetchJson(`/api/proposals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    IBP.toast(`Proposal ${status}`, 'success');
    IBP.render();
  } catch (err) {
    IBP.toast(err.message || 'Update failed', 'error');
  }
}
