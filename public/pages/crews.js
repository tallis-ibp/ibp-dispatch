/* IBP Dispatch — Crews page v5 (template-string rendering, robust) */

const RELIABILITY_BADGE = {
  high: 'success', medium: 'warning', low: 'danger',
};

IBP.registerRoute('crews', async (main) => {
  // Page header
  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Crews</h1>
        <div class="page-meta">Operational view — who's working today, recent activity, and dispatch health.</div>
      </div>
      <button class="btn btn-primary" id="crews-add"><i class="ti ti-plus"></i><span>Add crew</span></button>
    </div>
    <div id="crews-body"><div class="loading-row"><span class="spinner"></span><span>Loading crews…</span></div></div>
  `;
  document.getElementById('crews-add')?.addEventListener('click', () => IBP.openAddCrewModal());

  let crews;
  try { crews = await IBP.fetchJson('/api/crews'); }
  catch (err) {
    document.getElementById('crews-body').innerHTML = '';
    document.getElementById('crews-body').appendChild(IBP.emptyState({
      icon: 'alert-triangle', title: 'Failed to load crews', sub: err.message,
    }));
    return;
  }
  if (!crews.length) {
    document.getElementById('crews-body').innerHTML = '';
    document.getElementById('crews-body').appendChild(IBP.emptyState({
      icon: 'users-off', title: 'No crews yet',
      sub: 'Click Add crew to create the first one.',
      ctaLabel: 'Add crew', ctaAction: () => IBP.openAddCrewModal(),
    }));
    return;
  }

  // Bucket counts (and tagged crews for grouping)
  const working = crews.filter((c) => (c.jobsToday || 0) > 0);
  const standby = crews.filter((c) => (c.jobsToday || 0) === 0 && !!c.telegram_group_id);
  const idle    = crews.filter((c) => !c.telegram_group_id);
  const totalJobsToday = crews.reduce((n, c) => n + (Number(c.jobsToday) || 0), 0);

  console.info('[crews] buckets',
    `total=${crews.length} · working=${working.length} · standby=${standby.length} · idle=${idle.length}`);

  // Render whole page as one HTML string — sidesteps any silent appendChild bug
  document.getElementById('crews-body').innerHTML = `
    <div class="stat-strip" style="grid-template-columns:repeat(4,1fr);">
      <div class="stat-card"><div class="stat-num">${IBP.roundNum(crews.length)}</div><div class="stat-label">Total crews</div></div>
      <div class="stat-card"><div class="stat-num" style="color:var(--success-700)">${IBP.roundNum(working.length)}</div><div class="stat-label">Working today</div></div>
      <div class="stat-card"><div class="stat-num" style="color:var(--info-700)">${IBP.roundNum(standby.length)}</div><div class="stat-label">On standby</div></div>
      <div class="stat-card"><div class="stat-num" style="color:var(--ink-400)">${IBP.roundNum(totalJobsToday)}</div><div class="stat-label">Jobs assigned today</div></div>
    </div>
    ${working.length ? renderSection('active', 'Working today', working, { collapsible: false, collapsed: false }) : ''}
    ${standby.length ? renderSection('standby', 'On standby', standby, { collapsible: false, collapsed: false }) : ''}
    ${idle.length    ? renderSection('idle',    'Inactive · No Telegram link yet', idle, { collapsible: true, collapsed: true }) : ''}
  `;

  // Wire all click handlers after the HTML is in the DOM
  wireSectionToggles();
  wireCardClicks(crews);
  wireCardActions(crews);
});

function renderSection(dotClass, label, crews, { collapsible, collapsed }) {
  const id = `sec-${dotClass}`;
  return `
    <div class="section-group ${collapsed ? 'collapsed' : ''}" id="${id}">
      <div class="section-heading ${collapsible ? 'toggle' : ''}" ${collapsible ? `data-toggle="${id}"` : ''}>
        <span class="section-heading-dot ${dotClass}"></span>
        <span class="section-heading-label">${IBP.escHtml(label)}</span>
        <span class="section-heading-count">${IBP.roundNum(crews.length)}</span>
        ${collapsible ? '<span class="section-heading-spacer"></span><span class="section-heading-caret"><i class="ti ti-chevron-down"></i></span>' : ''}
      </div>
      <div class="card-grid-3 section-grid">
        ${crews.map(renderCardHtml).join('')}
      </div>
    </div>
  `;
}

function renderCardHtml(crew) {
  const connected = !!crew.telegram_group_id;
  const initials = IBP.initials(crew.display_name);
  const colorIdx = IBP.colorIndex(crew.display_name);
  const language = (crew.language || 'en').toUpperCase();
  const reliabilityClass = RELIABILITY_BADGE[crew.reliability] || 'neutral';
  const reliability = crew.reliability;

  const todayCount = Number(crew.jobsToday) || 0;
  const weekCount  = Number(crew.jobsLast7Days) || 0;
  const lastSeen   = crew.lastActivity ? IBP.relativeTime(crew.lastActivity) : 'Never';

  // Skills preview (only for non-connected crews — connected ones use the stat grid)
  let skillsBlock = '';
  if (!connected) {
    const strengths = IBP.safeJson(crew.strengths, []);
    if (strengths.length) {
      const visible = strengths.slice(0, 3);
      const overflow = strengths.length - 3;
      skillsBlock = `
        <div class="crew-mgmt-skills">
          ${visible.map((s) => `<span class="crew-skill-mini">${IBP.escHtml(s)}</span>`).join('')}
          ${overflow > 0 ? `<span class="crew-skill-mini">+${overflow}</span>` : ''}
        </div>
      `;
    } else {
      skillsBlock = `<div class="crew-skill-empty">Not configured for AI scheduling yet</div>`;
    }
  }

  // Operational mini-stats grid (for connected crews)
  const statsBlock = connected ? `
    <div class="crew-stat-grid">
      <div class="crew-stat-cell">
        <div class="crew-stat-label">Today</div>
        <div class="crew-stat-value ${todayCount ? 'success' : 'muted'}">${IBP.roundNum(todayCount)} ${todayCount === 1 ? 'job' : 'jobs'}</div>
      </div>
      <div class="crew-stat-cell">
        <div class="crew-stat-label">7 days</div>
        <div class="crew-stat-value ${weekCount ? '' : 'muted'}">${IBP.roundNum(weekCount)}</div>
      </div>
      <div class="crew-stat-cell">
        <div class="crew-stat-label">Last seen</div>
        <div class="crew-stat-value ${crew.lastActivity ? '' : 'muted'}" style="font-size:11px">${IBP.escHtml(lastSeen)}</div>
      </div>
    </div>
    ${crew.lastJob ? `
      <div class="crew-last-activity">
        <i class="ti ti-clipboard-text"></i>
        <span class="quote">${IBP.escHtml(crew.lastJob.jobName || '—')} · ${IBP.escHtml(crew.lastJob.briefDate || '')}</span>
      </div>` : ''}
  ` : '';

  const actionsRight = connected
    ? `<button class="btn-icon" title="Send test message" data-action="test" data-key="${IBP.escHtml(crew.key)}"><i class="ti ti-send"></i></button>`
    : `<button class="btn btn-outline btn-sm" data-action="connect" data-key="${IBP.escHtml(crew.key)}"><i class="ti ti-link"></i><span>Connect</span></button>`;

  return `
    <div class="crew-mgmt-card ${connected ? 'connected' : ''}" data-key="${IBP.escHtml(crew.key)}" data-clickable="card">
      <div class="crew-mgmt-head">
        <div class="crew-mgmt-identity">
          <div class="avatar avatar-md avatar-c${colorIdx}">${IBP.escHtml(initials)}</div>
          <div class="crew-mgmt-name-wrap">
            <div class="crew-mgmt-name">${IBP.escHtml(crew.display_name)}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <span class="badge neutral" data-action="lang" data-key="${IBP.escHtml(crew.key)}" title="Bot reply language — click to change" style="cursor:pointer">${language}</span>
          ${reliability ? `<span class="badge ${reliabilityClass}" title="Reliability">${IBP.escHtml(reliability)}</span>` : ''}
          <div class="tg-status ${connected ? '' : 'disconnected'}">
            <span class="dot"></span><span>${connected ? 'Live' : 'Not set'}</span>
          </div>
        </div>
      </div>

      ${statsBlock}
      ${skillsBlock}

      <div class="crew-mgmt-footer">
        <div class="${connected ? 'crew-mgmt-id' : 'crew-mgmt-id empty'}">${connected ? IBP.escHtml(crew.telegram_group_id) : 'No Telegram group'}</div>
        <div class="crew-mgmt-actions">
          ${actionsRight}
          <button class="btn-icon" title="AI scheduling profile" data-action="config" data-key="${IBP.escHtml(crew.key)}"><i class="ti ti-adjustments"></i></button>
        </div>
      </div>
    </div>
  `;
}

function wireSectionToggles() {
  document.querySelectorAll('[data-toggle]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-toggle');
      document.getElementById(id)?.classList.toggle('collapsed');
    });
  });
}

function wireCardClicks(crews) {
  document.querySelectorAll('[data-clickable="card"]').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button, a, [data-action]')) return;
      const key = card.getAttribute('data-key');
      const crew = crews.find((c) => c.key === key);
      if (crew) openOpDrawer(crew);
    });
  });
}

function wireCardActions(crews) {
  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      const key = btn.getAttribute('data-key');
      const crew = crews.find((c) => c.key === key);
      if (!crew) return;

      if (action === 'test') {
        btn.disabled = true;
        try {
          await IBP.fetchJson(`/api/crews/${key}/test`, { method: 'POST' });
          IBP.toast('Test message sent', 'success');
        } catch (err) { IBP.toast(err.message, 'error'); }
        finally { btn.disabled = false; }
        return;
      }
      if (action === 'connect') {
        IBP.openCrewSetupForEdit(crew);
        return;
      }
      if (action === 'config' || action === 'lang') {
        openConfigDrawer(crew);
        return;
      }
    });
  });
}

// ════════════════════════════════════════════════════════════════
// OPERATIONAL DRAWER — work info, recent activity, photos, flags
// ════════════════════════════════════════════════════════════════
async function openOpDrawer(crew) {
  const profileHeader = IBP.el('div', 'drawer-profile-header');
  profileHeader.appendChild(IBP.avatar(crew.display_name, 'lg'));
  const info = IBP.el('div', 'drawer-profile-info');
  info.appendChild(IBP.el('div', 'drawer-profile-name', crew.display_name));
  const badges = IBP.el('div', 'badge-row');
  badges.appendChild(IBP.el('span', 'badge neutral', (crew.language || 'en').toUpperCase()));
  if (crew.reliability) {
    badges.appendChild(IBP.el('span', `badge ${RELIABILITY_BADGE[crew.reliability] || 'neutral'}`, `${crew.reliability} reliability`));
  }
  info.appendChild(badges);
  profileHeader.appendChild(info);
  const hs = IBP.el('div', `tg-status ${crew.telegram_group_id ? '' : 'disconnected'}`);
  hs.innerHTML = `<span class="dot"></span><span>${crew.telegram_group_id ? 'Live' : 'Not set'}</span>`;
  profileHeader.appendChild(hs);

  const body = IBP.el('div');
  body.appendChild(profileHeader);
  const content = IBP.el('div');
  content.appendChild(IBP.spinner('Loading operational data…'));
  body.appendChild(content);

  const footer = IBP.el('div');
  const configBtn = IBP.el('button', 'btn btn-outline btn-block');
  configBtn.innerHTML = '<i class="ti ti-adjustments"></i><span>Edit AI scheduling profile</span>';
  configBtn.addEventListener('click', () => {
    IBP.closeDrawer();
    openConfigDrawer(crew);
  });
  footer.appendChild(configBtn);
  if (crew.telegram_group_id) {
    const testBtn = IBP.el('button', 'btn btn-outline btn-block');
    testBtn.innerHTML = '<i class="ti ti-send"></i><span>Send test message</span>';
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      const orig = testBtn.innerHTML;
      testBtn.innerHTML = '<span class="spinner"></span><span>Sending…</span>';
      try {
        await IBP.fetchJson(`/api/crews/${crew.key}/test`, { method: 'POST' });
        IBP.toast('Test message sent', 'success');
      } catch (err) { IBP.toast(err.message, 'error'); }
      finally { testBtn.disabled = false; testBtn.innerHTML = orig; }
    });
    footer.appendChild(testBtn);
  }

  IBP.openDrawer({ body, footer });

  // Fetch detail
  try {
    const today = IBP.todayISO();
    const [detail, photos, flags] = await Promise.all([
      IBP.fetchJson(`/api/crews/${crew.key}`),
      fetch(`/api/photos?date=${today}&crewKey=${crew.key}&limit=5`).then((r) => r.ok ? r.json() : []),
      fetch(`/api/flags?date=${today}`).then((r) => r.ok ? r.json() : []),
    ]);
    const crewFlags = (flags || []).filter((f) => f.crew_key === crew.key).slice(0, 5);

    // Split history into done / in-progress / pending
    const allJobs = detail.recentJobs || [];
    const todayJobs = allJobs.filter((j) => j.briefDate === today);
    const doneJobs  = allJobs.filter((j) => j.checkInStatus === 'done').slice(0, 6);
    const todoJobs  = allJobs.filter((j) => j.checkInStatus !== 'done' && j.briefDate >= today).slice(0, 6);
    const pastJobs  = allJobs.filter((j) => j.briefDate < today && j.checkInStatus !== 'done').slice(0, 6);

    content.innerHTML = '';

    // Activity summary
    const summary = IBP.el('div', 'op-block');
    summary.innerHTML = `
      <div class="op-block-head"><div class="op-block-title">Activity</div></div>
      <div class="op-summary">
        <div class="op-summary-cell"><div class="op-summary-num">${IBP.roundNum(todayJobs.length)}</div><div class="op-summary-label">Today</div></div>
        <div class="op-summary-cell"><div class="op-summary-num" style="color:var(--success-700)">${IBP.roundNum(doneJobs.length)}</div><div class="op-summary-label">Done</div></div>
        <div class="op-summary-cell"><div class="op-summary-num">${IBP.roundNum(crew.jobsLast7Days || 0)}</div><div class="op-summary-label">Last 7 days</div></div>
      </div>
      ${crew.lastActivity ? `<div class="crew-last-activity" style="margin-top:6px"><i class="ti ti-clock"></i><span>Last check-in <strong style="color:var(--ink-700)">${IBP.escHtml(IBP.relativeTime(crew.lastActivity))}</strong></span></div>` : ''}
    `;
    content.appendChild(summary);

    // To-do today/upcoming
    const todoBlock = IBP.el('div', 'op-block');
    todoBlock.innerHTML = `<div class="op-block-head"><div class="op-block-title">To do</div><div class="op-block-count">${IBP.roundNum(todoJobs.length)}</div></div>`;
    if (!todoJobs.length) {
      todoBlock.innerHTML += `<div style="font-size:12px;color:var(--ink-400);padding:8px 0;font-style:italic;">No upcoming jobs assigned</div>`;
    } else {
      todoBlock.innerHTML += todoJobs.map(renderJobRow).join('');
    }
    content.appendChild(todoBlock);

    // Done recently
    if (doneJobs.length) {
      const doneBlock = IBP.el('div', 'op-block');
      doneBlock.innerHTML = `<div class="op-block-head"><div class="op-block-title">Recently done</div><div class="op-block-count">${IBP.roundNum(doneJobs.length)}</div></div>` + doneJobs.map(renderJobRow).join('');
      content.appendChild(doneBlock);
    }

    // Past pending (didn't finish on time)
    if (pastJobs.length) {
      const pastBlock = IBP.el('div', 'op-block');
      pastBlock.innerHTML = `<div class="op-block-head"><div class="op-block-title">Past · not completed</div><div class="op-block-count">${IBP.roundNum(pastJobs.length)}</div></div>` + pastJobs.map(renderJobRow).join('');
      content.appendChild(pastBlock);
    }

    // Photos today
    if (photos.length) {
      const photosBlock = IBP.el('div', 'op-block');
      photosBlock.innerHTML = `<div class="op-block-head"><div class="op-block-title">Photos today</div><div class="op-block-count">${photos.length}</div></div>`;
      const strip = IBP.el('div');
      strip.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:6px;';
      strip.innerHTML = photos.slice(0, 5).map((p) =>
        `<img src="/api/photos/${IBP.escHtml(p.id)}/image" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;cursor:pointer;border:1px solid var(--border-soft);" title="${IBP.escHtml(p.aiSummary || '')}">`
      ).join('');
      photosBlock.appendChild(strip);
      content.appendChild(photosBlock);
    }

    // Flags today
    if (crewFlags.length) {
      const flagsBlock = IBP.el('div', 'op-block');
      flagsBlock.innerHTML = `<div class="op-block-head"><div class="op-block-title">Flags today</div><div class="op-block-count">${crewFlags.length}</div></div>` +
        crewFlags.map((f) => `
          <div class="op-row">
            <div class="op-row-main">
              <div class="op-row-primary">"${IBP.escHtml(f.text)}"</div>
              <div class="op-row-secondary"><span>${IBP.escHtml(f.sender || 'unknown')}</span>${f.resolved ? '<span class="dot-sep"></span><span style="color:var(--success-700)">resolved</span>' : ''}</div>
            </div>
            <div class="op-row-date">${IBP.escHtml(IBP.formatTime(f.timestamp))}</div>
          </div>
        `).join('');
      content.appendChild(flagsBlock);
    }

    // Telegram group ID
    if (crew.telegram_group_id) {
      content.appendChild(IBP.el('div')).innerHTML = `
        <div class="op-block">
          <div class="op-block-head"><div class="op-block-title">Telegram</div></div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;">
            <span style="color:var(--ink-600)">Group chat ID</span>
            <span style="font-family:JetBrains Mono,Menlo,monospace;color:var(--ink-900)">${IBP.escHtml(crew.telegram_group_id)}</span>
          </div>
        </div>`;
    }
  } catch (err) {
    content.innerHTML = '';
    content.appendChild(IBP.emptyState({
      icon: 'alert-triangle', title: 'Failed to load operational data', sub: err.message,
    }));
  }
}

function renderJobRow(job) {
  const statusLabel = job.checkInStatus || 'pending';
  const statusClass = statusLabel === 'done' ? 'success'
                    : statusLabel === 'issue' ? 'danger'
                    : statusLabel === 'working' ? 'info' : 'neutral';
  return `
    <div class="op-row">
      <div class="op-row-main">
        <div class="op-row-primary"><span style="font-family:JetBrains Mono,Menlo,monospace;font-size:11px;color:var(--ink-400);margin-right:6px;">#${IBP.escHtml(job.jobNumber ?? '?')}</span>${IBP.escHtml(job.jobName ?? '—')}</div>
        <div class="op-row-secondary"><span class="badge ${statusClass}">${IBP.escHtml(statusLabel)}</span>${job.sentAt ? '<span class="dot-sep"></span><span>sent</span>' : ''}</div>
      </div>
      <div class="op-row-date">${IBP.escHtml(job.briefDate || '')}</div>
    </div>`;
}

// ════════════════════════════════════════════════════════════════
// AI CONFIG DRAWER — skills/cautions/reliability/language editor
// ════════════════════════════════════════════════════════════════
async function openConfigDrawer(crew) {
  const state = {
    displayName: crew.display_name,
    language: crew.language || 'en',
    reliability: crew.reliability || '',
    strengths: IBP.safeJson(crew.strengths, []),
    cautions:  IBP.safeJson(crew.cautions,  []),
  };

  const profileHeader = IBP.el('div', 'drawer-profile-header');
  profileHeader.appendChild(IBP.avatar(crew.display_name, 'lg'));
  const profileInfo = IBP.el('div', 'drawer-profile-info');
  profileInfo.appendChild(IBP.el('div', 'drawer-profile-name', crew.display_name));
  profileInfo.appendChild(IBP.el('div', 'drawer-profile-key', `AI scheduling profile · ${crew.key}`));
  profileHeader.appendChild(profileInfo);

  const body = IBP.el('div');
  body.appendChild(profileHeader);

  const profileSection = IBP.el('div', 'drawer-section');
  profileSection.appendChild(IBP.el('div', 'drawer-section-label', 'Identity'));
  profileSection.appendChild(buildInput('Display name', state.displayName, (v) => { state.displayName = v; }));
  profileSection.appendChild(buildSelect('Language', state.language, [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
    { value: 'pt', label: 'Português' },
  ], (v) => { state.language = v; }));
  profileSection.appendChild(buildSelect('Reliability', state.reliability, [
    { value: '',       label: '— Not set —' },
    { value: 'high',   label: 'High · trusted for critical work' },
    { value: 'medium', label: 'Medium · standard reliability' },
    { value: 'low',    label: 'Low · needs supervision or backup' },
  ], (v) => { state.reliability = v; }));
  body.appendChild(profileSection);

  const aiSection = IBP.el('div', 'drawer-section');
  aiSection.appendChild(IBP.el('div', 'drawer-section-label', 'How the AI assigns jobs'));
  const aiHelp = IBP.el('div');
  aiHelp.style.cssText = 'font-size:12px;color:var(--ink-600);line-height:1.5;margin-bottom:12px;padding:10px 12px;background:var(--paper-alt);border-radius:6px;border:1px solid var(--border-soft);';
  aiHelp.innerHTML = `Every morning the AI uses <strong>skills</strong>, <strong>cautions</strong>, and <strong>reliability</strong> to decide which jobs this crew should get. Be specific — vague tags hurt assignment quality.`;
  aiSection.appendChild(aiHelp);
  aiSection.appendChild(buildChipInput('Skills', state.strengths,
    'What this crew is good at (e.g. "gooseneck capable", "pool deck install"). Press Enter to add.',
    (next) => { state.strengths = next; }));
  aiSection.appendChild(buildChipInput('Cautions', state.cautions,
    'Things to avoid for this crew (e.g. "no gooseneck jobs", "no large slab work").',
    (next) => { state.cautions = next; }, 'danger'));
  body.appendChild(aiSection);

  const dangerSection = IBP.el('div', 'drawer-section danger');
  dangerSection.appendChild(IBP.el('div', 'drawer-section-label', 'Danger zone'));
  const dangerHelp = IBP.el('div');
  dangerHelp.style.cssText = 'font-size:11px;color:var(--ink-500);margin-bottom:10px;line-height:1.5;';
  dangerHelp.textContent = 'Deleting removes this crew from the AI scheduler and the dispatch dashboard. Past briefs and photos are preserved.';
  dangerSection.appendChild(dangerHelp);
  const deleteBtn = IBP.el('button', 'btn btn-danger');
  deleteBtn.innerHTML = '<i class="ti ti-trash"></i><span>Delete crew permanently</span>';
  deleteBtn.addEventListener('click', async () => {
    const ok = await IBP.confirm({
      title: `Delete ${crew.display_name}?`,
      message: 'This cannot be undone. The crew, its skills, and Telegram connection will be removed.',
      confirmLabel: 'Delete', cancelLabel: 'Keep', danger: true,
    });
    if (!ok) return;
    deleteBtn.disabled = true;
    deleteBtn.innerHTML = '<span class="spinner"></span><span>Deleting…</span>';
    try {
      await IBP.fetchJson(`/api/crews/${crew.key}`, { method: 'DELETE' });
      IBP.toast(`Deleted ${crew.display_name}`, 'success');
      IBP.closeDrawer();
      IBP.render();
    } catch (err) {
      IBP.toast(err.message || 'Delete failed', 'error');
      deleteBtn.disabled = false;
      deleteBtn.innerHTML = '<i class="ti ti-trash"></i><span>Delete crew permanently</span>';
    }
  });
  dangerSection.appendChild(deleteBtn);
  body.appendChild(dangerSection);

  const footer = IBP.el('div');
  const saveBtn = IBP.el('button', 'btn btn-primary btn-block');
  saveBtn.innerHTML = '<i class="ti ti-check"></i><span>Save changes</span>';
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span><span>Saving…</span>';
    try {
      await IBP.fetchJson(`/api/crews/${crew.key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: state.displayName,
          language: state.language,
          reliability: state.reliability || null,
          strengths: state.strengths,
          cautions:  state.cautions,
        }),
      });
      IBP.toast('AI profile saved', 'success');
      IBP.closeDrawer();
      IBP.render();
    } catch (err) {
      IBP.toast(err.message || 'Save failed', 'error');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="ti ti-check"></i><span>Save changes</span>';
    }
  });
  footer.appendChild(saveBtn);

  IBP.openDrawer({ body, footer });
}

IBP.openConfigDrawer = openConfigDrawer;
IBP.openOpDrawer = openOpDrawer;

// ─── Form helpers ─────────────────────────────────────────────
function buildInput(label, value, onChange) {
  const wrap = IBP.el('div', 'input-row');
  wrap.appendChild(IBP.el('label', 'input-label', label));
  const input = IBP.el('input');
  input.type = 'text';
  input.value = value || '';
  input.addEventListener('input', () => onChange(input.value));
  wrap.appendChild(input);
  return wrap;
}

function buildSelect(label, value, options, onChange) {
  const wrap = IBP.el('div', 'input-row');
  wrap.appendChild(IBP.el('label', 'input-label', label));
  const sel = IBP.el('select');
  for (const opt of options) {
    const o = IBP.el('option', '', opt.label);
    o.value = opt.value;
    if (opt.value === value) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  wrap.appendChild(sel);
  return wrap;
}

function buildChipInput(label, initialChips, help, onChange, variant = '') {
  const wrap = IBP.el('div', 'input-row');
  wrap.appendChild(IBP.el('label', 'input-label', label));
  const container = IBP.el('div', 'chip-input');
  const chips = [...initialChips];

  const inputField = IBP.el('input', 'chip-input-field');
  inputField.type = 'text';
  inputField.placeholder = chips.length ? '' : 'Type and press Enter…';

  const renderChips = () => {
    [...container.querySelectorAll('.chip')].forEach((c) => c.remove());
    for (const chip of chips) {
      const c = IBP.el('span', `chip ${variant}`, chip);
      const x = IBP.el('button', 'chip-remove');
      x.type = 'button';
      x.innerHTML = '<i class="ti ti-x"></i>';
      x.addEventListener('click', () => {
        const idx = chips.indexOf(chip);
        if (idx >= 0) { chips.splice(idx, 1); onChange(chips); renderChips(); }
      });
      c.appendChild(x);
      container.insertBefore(c, inputField);
    }
    inputField.placeholder = chips.length ? '' : 'Type and press Enter…';
  };

  inputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const v = inputField.value.trim().replace(/,$/, '');
      if (v && !chips.includes(v)) { chips.push(v); inputField.value = ''; onChange(chips); renderChips(); }
    } else if (e.key === 'Backspace' && !inputField.value && chips.length) {
      chips.pop(); onChange(chips); renderChips();
    }
  });
  container.appendChild(inputField);
  renderChips();
  wrap.appendChild(container);
  if (help) wrap.appendChild(IBP.el('div', 'chip-help', help));
  return wrap;
}
