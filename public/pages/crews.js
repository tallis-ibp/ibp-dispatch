/* IBP Dispatch — Crews page v4 (operational) */

IBP.registerRoute('crews', async (main) => {
  const header = IBP.el('div', 'page-header');
  const left = IBP.el('div');
  left.appendChild(IBP.el('h1', 'page-title', 'Crews'));
  left.appendChild(IBP.el('div', 'page-meta',
    'Operational view — who\'s working today, recent activity, and dispatch health.'));
  header.appendChild(left);

  const addBtn = IBP.el('button', 'btn btn-primary');
  addBtn.innerHTML = '<i class="ti ti-plus"></i><span>Add crew</span>';
  addBtn.addEventListener('click', () => IBP.openAddCrewModal());
  header.appendChild(addBtn);
  main.appendChild(header);

  // Skeleton
  const wrap = IBP.el('div');
  const skel = IBP.el('div', 'card-grid-3');
  for (let i = 0; i < 6; i++) skel.appendChild(IBP.skeletonCard());
  wrap.appendChild(skel);
  main.appendChild(wrap);

  let crews;
  try { crews = await IBP.fetchJson('/api/crews'); }
  catch (err) {
    wrap.innerHTML = '';
    wrap.appendChild(IBP.emptyState({
      icon: 'alert-triangle', title: 'Failed to load crews', sub: err.message,
    }));
    return;
  }

  wrap.innerHTML = '';
  if (!crews.length) {
    wrap.appendChild(IBP.emptyState({
      icon: 'users-off',
      title: 'No crews yet',
      sub: 'Click Add crew to create the first one.',
      ctaLabel: 'Add crew',
      ctaAction: () => IBP.openAddCrewModal(),
    }));
    return;
  }

  // ─── Top-level stats (operational counts) ────────────────
  const workingToday = crews.filter((c) => c.jobsToday > 0);
  const onStandby    = crews.filter((c) => c.jobsToday === 0 && c.telegram_group_id);
  const awaitingSetup = crews.filter((c) => !c.telegram_group_id);
  const totalJobsToday = crews.reduce((n, c) => n + (c.jobsToday || 0), 0);

  // Render trace — visible diagnostics if something silently fails
  console.info('[crews] loaded',
    `total=${crews.length} · working=${workingToday.length} · standby=${onStandby.length} · awaiting=${awaitingSetup.length}`);

  const stats = IBP.el('div', 'stat-strip');
  stats.style.gridTemplateColumns = 'repeat(4, 1fr)';
  stats.innerHTML = `
    <div class="stat-card"><div class="stat-num">${IBP.roundNum(crews.length)}</div><div class="stat-label">Total crews</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--success-700)">${IBP.roundNum(workingToday.length)}</div><div class="stat-label">Working today</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--info-700)">${IBP.roundNum(onStandby.length)}</div><div class="stat-label">On standby</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--ink-400)">${IBP.roundNum(totalJobsToday)}</div><div class="stat-label">Jobs assigned today</div></div>
  `;
  wrap.appendChild(stats);

  // ─── Three sections ──────────────────────────────────────
  if (workingToday.length) {
    wrap.appendChild(buildSection('active', 'Working today', workingToday, { collapsible: false }));
  }
  if (onStandby.length) {
    wrap.appendChild(buildSection('standby', 'On standby', onStandby, { collapsible: false }));
  }
  if (awaitingSetup.length) {
    // Collapsed by default — these crews aren't operational today, so they're
    // noise on the daily view. Click to expand when you need to configure one.
    wrap.appendChild(buildSection('idle', 'Inactive', awaitingSetup, {
      collapsible: true,
      collapsed: true,
      sub: 'No Telegram link yet',
    }));
  }
});

function buildSection(dotClass, label, crews, opts = {}) {
  const { collapsible = false, collapsed = false, sub = '' } = opts;
  const section = IBP.el('div', `section-group${collapsed ? ' collapsed' : ''}`);

  const heading = IBP.el('div', `section-heading ${collapsible ? 'toggle' : ''}`);
  const dot = IBP.el('span', `section-heading-dot ${dotClass}`);
  heading.appendChild(dot);
  heading.appendChild(IBP.el('span', 'section-heading-label', label));
  if (sub) {
    const subEl = IBP.el('span');
    subEl.style.cssText = 'font-size:11px;color:var(--ink-400);';
    subEl.textContent = `· ${sub}`;
    heading.appendChild(subEl);
  }
  heading.appendChild(IBP.el('span', 'section-heading-count', IBP.roundNum(crews.length)));

  if (collapsible) {
    heading.appendChild(IBP.el('span', 'section-heading-spacer'));
    const caret = IBP.el('span', 'section-heading-caret');
    caret.innerHTML = '<i class="ti ti-chevron-down"></i>';
    heading.appendChild(caret);
    heading.addEventListener('click', () => section.classList.toggle('collapsed'));
  }
  section.appendChild(heading);

  const grid = IBP.el('div', 'card-grid-3 section-grid');
  const sorted = [...crews].sort((a, b) => a.display_name.localeCompare(b.display_name));
  // Render each card defensively — a single broken crew payload must not blow
  // up the whole section. Logs the failure to console for debugging.
  for (const c of sorted) {
    try {
      grid.appendChild(buildOpCard(c));
    } catch (err) {
      console.error('[crews] failed to render card', c, err);
      const fallback = IBP.el('div', 'crew-mgmt-card');
      fallback.style.cssText = 'border-color:var(--danger-200);background:var(--danger-100);';
      fallback.innerHTML = `
        <div style="font-size:13px;font-weight:500;color:var(--danger-700);">${IBP.escHtml(c.display_name || c.key || 'Unknown crew')}</div>
        <div style="font-size:11px;color:var(--danger-700);">Could not render — see browser console.</div>
      `;
      grid.appendChild(fallback);
    }
  }
  section.appendChild(grid);
  return section;
}

function buildOpCard(crew) {
  const connected = !!crew.telegram_group_id;
  const card = IBP.el('div', `crew-mgmt-card ${connected ? 'connected' : ''}`);

  // Click anywhere except buttons → operational drawer
  card.addEventListener('click', (e) => {
    if (e.target.closest('button, a')) return;
    openOpDrawer(crew);
  });

  // ─── Head: avatar + name + status ───────────────
  const head = IBP.el('div', 'crew-mgmt-head');
  const identity = IBP.el('div', 'crew-mgmt-identity');
  identity.appendChild(IBP.avatar(crew.display_name, 'md'));
  const nameWrap = IBP.el('div', 'crew-mgmt-name-wrap');
  nameWrap.appendChild(IBP.el('div', 'crew-mgmt-name', crew.display_name));
  // Head stays clean — just name. Operational stats live in the mini-grid below,
  // AI metadata (language, reliability) lives in the drawer.
  identity.appendChild(nameWrap);
  head.appendChild(identity);

  // Right side: language badge + connection status
  const right = IBP.el('div');
  right.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0;';

  const langBadge = IBP.el('span', 'badge neutral');
  langBadge.textContent = (crew.language || 'en').toUpperCase();
  langBadge.title = 'Bot reply language — click to change';
  langBadge.style.cursor = 'pointer';
  langBadge.addEventListener('click', (e) => {
    e.stopPropagation();
    openConfigDrawer(crew);
  });
  right.appendChild(langBadge);

  const status = IBP.el('div', `tg-status ${connected ? '' : 'disconnected'}`);
  status.innerHTML = `<span class="dot"></span><span>${connected ? 'Live' : 'Not set'}</span>`;
  right.appendChild(status);

  head.appendChild(right);
  card.appendChild(head);

  // ─── Operational mini-stat grid (only for connected crews) ─
  if (connected) {
    const grid = IBP.el('div', 'crew-stat-grid');
    const todayCount = crew.jobsToday || 0;
    const weekCount  = crew.jobsLast7Days || 0;
    grid.innerHTML = `
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
        <div class="crew-stat-value ${crew.lastActivity ? '' : 'muted'}" style="font-size:11px">${crew.lastActivity ? IBP.relativeTime(crew.lastActivity) : 'Never'}</div>
      </div>
    `;
    card.appendChild(grid);

    // Last job line (if exists)
    if (crew.lastJob) {
      const last = IBP.el('div', 'crew-last-activity');
      last.innerHTML = `
        <i class="ti ti-clipboard-text"></i>
        <span class="quote">${IBP.escHtml(crew.lastJob.jobName)} · ${IBP.escHtml(crew.lastJob.briefDate)}</span>
      `;
      card.appendChild(last);
    }
  } else {
    // Awaiting setup state — show skills preview (so user can see what they offer)
    const strengths = IBP.safeJson(crew.strengths, []);
    if (strengths.length) {
      const skillsWrap = IBP.el('div', 'crew-mgmt-skills');
      const visible = strengths.slice(0, 3);
      for (const s of visible) skillsWrap.appendChild(IBP.el('span', 'crew-skill-mini', s));
      if (strengths.length > 3) {
        skillsWrap.appendChild(IBP.el('span', 'crew-skill-mini', `+${strengths.length - 3}`));
      }
      card.appendChild(skillsWrap);
    } else {
      card.appendChild(IBP.el('div', 'crew-skill-empty', 'Not configured for AI scheduling yet'));
    }
  }

  // ─── Footer: chat ID + actions ─────────────────
  const footer = IBP.el('div', 'crew-mgmt-footer');
  const idEl = IBP.el('div', connected ? 'crew-mgmt-id' : 'crew-mgmt-id empty',
    connected ? crew.telegram_group_id : 'No Telegram group');
  footer.appendChild(idEl);

  const actions = IBP.el('div', 'crew-mgmt-actions');
  if (connected) {
    const testBtn = IBP.el('button', 'btn-icon');
    testBtn.title = 'Send test message';
    testBtn.innerHTML = '<i class="ti ti-send"></i>';
    testBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      testBtn.disabled = true;
      try {
        await IBP.fetchJson(`/api/crews/${crew.key}/test`, { method: 'POST' });
        IBP.toast('Test message sent', 'success');
      } catch (err) { IBP.toast(err.message, 'error'); }
      finally { testBtn.disabled = false; }
    });
    actions.appendChild(testBtn);
  } else {
    const connectBtn = IBP.el('button', 'btn btn-outline btn-sm');
    connectBtn.innerHTML = '<i class="ti ti-link"></i><span>Connect</span>';
    connectBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      IBP.openCrewSetupForEdit(crew);
    });
    actions.appendChild(connectBtn);
  }

  const editBtn = IBP.el('button', 'btn-icon');
  editBtn.title = 'AI scheduling profile';
  editBtn.innerHTML = '<i class="ti ti-adjustments"></i>';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openConfigDrawer(crew);
  });
  actions.appendChild(editBtn);

  footer.appendChild(actions);
  card.appendChild(footer);

  return card;
}

// ════════════════════════════════════════════════════════════════
// OPERATIONAL DRAWER — work info, recent activity, photos, flags
// ════════════════════════════════════════════════════════════════
async function openOpDrawer(crew) {
  // Profile header — clear, visible AI metadata as badges
  const profileHeader = IBP.el('div', 'drawer-profile-header');
  profileHeader.appendChild(IBP.avatar(crew.display_name, 'lg'));
  const info = IBP.el('div', 'drawer-profile-info');
  info.appendChild(IBP.el('div', 'drawer-profile-name', crew.display_name));

  // Badge row: language + reliability — visible, not buried gray text
  const badges = IBP.el('div', 'badge-row');
  badges.appendChild(IBP.el('span', 'badge neutral', (crew.language || 'en').toUpperCase()));
  if (crew.reliability) {
    const rel = crew.reliability;
    badges.appendChild(IBP.el('span',
      `badge ${rel === 'high' ? 'success' : rel === 'low' ? 'danger' : 'warning'}`,
      `${rel} reliability`));
  }
  info.appendChild(badges);
  profileHeader.appendChild(info);

  const hs = IBP.el('div', `tg-status ${crew.telegram_group_id ? '' : 'disconnected'}`);
  hs.innerHTML = `<span class="dot"></span><span>${crew.telegram_group_id ? 'Live' : 'Not set'}</span>`;
  profileHeader.appendChild(hs);

  const body = IBP.el('div');
  body.appendChild(profileHeader);

  // Loading state
  const content = IBP.el('div');
  content.appendChild(IBP.spinner('Loading operational data…'));
  body.appendChild(content);

  // Footer
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

    content.innerHTML = '';

    // ─── Summary stats ────────────────────────────
    const summary = IBP.el('div', 'op-block');
    summary.appendChild(buildBlockHead('Activity'));
    const grid = IBP.el('div', 'op-summary');
    const todayJobs = (crew.jobsToday || 0);
    const weekJobs  = (crew.jobsLast7Days || 0);
    const doneToday = (detail.recentJobs || []).filter((j) => j.briefDate === today && j.checkInStatus === 'done').length;
    grid.innerHTML = `
      <div class="op-summary-cell">
        <div class="op-summary-num">${IBP.roundNum(todayJobs)}</div>
        <div class="op-summary-label">Today</div>
      </div>
      <div class="op-summary-cell">
        <div class="op-summary-num" style="color:var(--success-700)">${IBP.roundNum(doneToday)}</div>
        <div class="op-summary-label">Done today</div>
      </div>
      <div class="op-summary-cell">
        <div class="op-summary-num">${IBP.roundNum(weekJobs)}</div>
        <div class="op-summary-label">Last 7 days</div>
      </div>
    `;
    summary.appendChild(grid);
    if (crew.lastActivity) {
      const last = IBP.el('div', 'crew-last-activity');
      last.style.marginTop = '4px';
      last.innerHTML = `<i class="ti ti-clock"></i><span>Last check-in <strong style="color:var(--ink-700)">${IBP.relativeTime(crew.lastActivity)}</strong></span>`;
      summary.appendChild(last);
    }
    content.appendChild(summary);

    // ─── Recent jobs ──────────────────────────────
    const jobsBlock = IBP.el('div', 'op-block');
    jobsBlock.appendChild(buildBlockHead('Recent jobs', detail.recentJobs?.length));
    if (!detail.recentJobs?.length) {
      jobsBlock.appendChild(buildEmpty('No jobs assigned yet'));
    } else {
      for (const j of detail.recentJobs.slice(0, 6)) {
        jobsBlock.appendChild(buildJobRow(j));
      }
    }
    content.appendChild(jobsBlock);

    // ─── Recent photos ────────────────────────────
    const photosBlock = IBP.el('div', 'op-block');
    photosBlock.appendChild(buildBlockHead('Photos today', photos.length));
    if (!photos.length) {
      photosBlock.appendChild(buildEmpty('No photos sent today'));
    } else {
      const photoStrip = IBP.el('div');
      photoStrip.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:6px;';
      for (const p of photos.slice(0, 5)) {
        const thumb = IBP.el('img');
        thumb.src = `/api/photos/${p.id}/image`;
        thumb.style.cssText = 'width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;cursor:pointer;border:1px solid var(--border-soft);';
        thumb.title = p.aiSummary || '';
        photoStrip.appendChild(thumb);
      }
      photosBlock.appendChild(photoStrip);
    }
    content.appendChild(photosBlock);

    // ─── Recent flags ─────────────────────────────
    const flagsBlock = IBP.el('div', 'op-block');
    flagsBlock.appendChild(buildBlockHead('Flags today', crewFlags.length));
    if (!crewFlags.length) {
      flagsBlock.appendChild(buildEmpty('No flags raised today'));
    } else {
      for (const f of crewFlags) {
        const row = IBP.el('div', 'op-row');
        const main = IBP.el('div', 'op-row-main');
        main.appendChild(IBP.el('div', 'op-row-primary', `"${f.text}"`));
        const sub = IBP.el('div', 'op-row-secondary');
        sub.innerHTML = `<span>${IBP.escHtml(f.sender || 'unknown')}</span>${f.resolved ? '<span class="dot-sep"></span><span style="color:var(--success-700)">resolved</span>' : ''}`;
        main.appendChild(sub);
        row.appendChild(main);
        row.appendChild(IBP.el('div', 'op-row-date', IBP.formatTime(f.timestamp)));
        flagsBlock.appendChild(row);
      }
    }
    content.appendChild(flagsBlock);

    // ─── Telegram footer ──────────────────────────
    if (crew.telegram_group_id) {
      const tgBlock = IBP.el('div', 'op-block');
      tgBlock.appendChild(buildBlockHead('Telegram'));
      const row = IBP.el('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;';
      row.innerHTML = `
        <span style="color:var(--ink-600)">Group chat ID</span>
        <span style="font-family:JetBrains Mono,Menlo,monospace;color:var(--ink-900)">${crew.telegram_group_id}</span>
      `;
      tgBlock.appendChild(row);
      content.appendChild(tgBlock);
    }
  } catch (err) {
    content.innerHTML = '';
    content.appendChild(IBP.emptyState({
      icon: 'alert-triangle', title: 'Failed to load operational data', sub: err.message,
    }));
  }
}

function buildBlockHead(title, count) {
  const head = IBP.el('div', 'op-block-head');
  head.appendChild(IBP.el('div', 'op-block-title', title));
  if (typeof count === 'number') {
    head.appendChild(IBP.el('div', 'op-block-count', IBP.roundNum(count)));
  }
  return head;
}

function buildEmpty(text) {
  const e = IBP.el('div');
  e.style.cssText = 'font-size:12px;color:var(--ink-400);padding:8px 0;font-style:italic;';
  e.textContent = text;
  return e;
}

function buildJobRow(job) {
  const row = IBP.el('div', 'op-row');
  const main = IBP.el('div', 'op-row-main');
  const primary = IBP.el('div', 'op-row-primary');
  primary.innerHTML = `<span style="font-family:JetBrains Mono,Menlo,monospace;font-size:11px;color:var(--ink-400);margin-right:6px;">#${IBP.escHtml(job.jobNumber ?? '?')}</span>${IBP.escHtml(job.jobName ?? '—')}`;
  main.appendChild(primary);
  const sub = IBP.el('div', 'op-row-secondary');
  const statusLabel = job.checkInStatus || 'pending';
  sub.innerHTML = `<span class="badge ${statusLabel === 'done' ? 'success' : statusLabel === 'issue' ? 'danger' : statusLabel === 'working' ? 'info' : 'neutral'}">${statusLabel}</span>${job.sentAt ? '<span class="dot-sep"></span><span>sent</span>' : ''}`;
  main.appendChild(sub);
  row.appendChild(main);
  row.appendChild(IBP.el('div', 'op-row-date', job.briefDate || ''));
  return row;
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

  // ─── Profile section ─────────────────
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

  // ─── AI brain section ─────────────────
  const aiSection = IBP.el('div', 'drawer-section');
  aiSection.appendChild(IBP.el('div', 'drawer-section-label', 'How the AI assigns jobs'));
  const aiHelp = IBP.el('div');
  aiHelp.style.cssText = 'font-size:12px;color:var(--ink-600);line-height:1.5;margin-bottom:12px;padding:10px 12px;background:var(--paper-alt);border-radius:6px;border:1px solid var(--border-soft);';
  aiHelp.innerHTML = `Every morning the AI looks at <strong>skills</strong>, <strong>cautions</strong>, and <strong>reliability</strong> to decide which jobs this crew should get. Be specific — vague tags hurt assignment quality.`;
  aiSection.appendChild(aiHelp);
  aiSection.appendChild(buildChipInput('Skills', state.strengths,
    'What this crew is good at (e.g. "gooseneck capable", "pool deck install"). Press Enter to add.',
    (next) => { state.strengths = next; }));
  aiSection.appendChild(buildChipInput('Cautions', state.cautions,
    'Things to avoid for this crew (e.g. "no gooseneck jobs", "no large slab work").',
    (next) => { state.cautions = next; }, 'danger'));
  body.appendChild(aiSection);

  // ─── Danger zone ──────────────────────
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
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
      danger: true,
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

  // ─── Sticky save footer ────────────────
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

// Public hooks
IBP.openOpDrawer = openOpDrawer;
IBP.openConfigDrawer = openConfigDrawer;

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
        if (idx >= 0) {
          chips.splice(idx, 1);
          onChange(chips);
          renderChips();
        }
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
      if (v && !chips.includes(v)) {
        chips.push(v);
        inputField.value = '';
        onChange(chips);
        renderChips();
      }
    } else if (e.key === 'Backspace' && !inputField.value && chips.length) {
      chips.pop();
      onChange(chips);
      renderChips();
    }
  });
  container.appendChild(inputField);
  renderChips();
  wrap.appendChild(container);

  if (help) wrap.appendChild(IBP.el('div', 'chip-help', help));
  return wrap;
}
