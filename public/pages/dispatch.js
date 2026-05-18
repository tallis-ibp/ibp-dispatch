/* IBP Dispatch — Dispatch page v3 */

IBP.registerRoute('dispatch', async (main) => {
  const today = IBP.todayISO();

  // ─── Header ──────────────────────────────────────────────
  const header = IBP.el('div', 'page-header');
  const left = IBP.el('div');
  left.appendChild(IBP.el('h1', 'page-title', IBP.formatDate(today)));
  const meta = IBP.el('div', 'page-meta');
  meta.innerHTML = `
    <span class="meta-item"><i class="ti ti-users"></i><span id="dp-crew-count">—</span></span>
    <span class="meta-item"><i class="ti ti-clipboard-list"></i><span id="dp-job-count">—</span></span>
    <span class="meta-item" id="dp-flag-meta-item" style="color: var(--warning-700)"><i class="ti ti-flag"></i><span id="dp-flag-count">—</span></span>
  `;
  left.appendChild(meta);
  header.appendChild(left);

  const statusPill = IBP.el('div');
  statusPill.id = 'dp-status-pill';
  header.appendChild(statusPill);
  main.appendChild(header);

  // ─── Stats strip ─────────────────────────────────────────
  const stats = IBP.el('div', 'stat-strip');
  stats.innerHTML = `
    <div class="stat-card"><div class="stat-num" id="dp-stat-crews">—</div><div class="stat-label">Crews scheduled</div></div>
    <div class="stat-card"><div class="stat-num" id="dp-stat-jobs">—</div><div class="stat-label">Jobs assigned</div></div>
    <div class="stat-card"><div class="stat-num" id="dp-stat-dispatched">—</div><div class="stat-label">Dispatched</div></div>
    <div class="stat-card"><div class="stat-num" id="dp-stat-flags" style="color: var(--warning-700)">—</div><div class="stat-label">Flags pending</div></div>
  `;
  main.appendChild(stats);

  // ─── Skeleton grid while loading ─────────────────────────
  const gridWrap = IBP.el('div');
  gridWrap.id = 'dp-grid-wrap';
  const skeletonGrid = IBP.el('div', 'crew-grid');
  for (let i = 0; i < 4; i++) skeletonGrid.appendChild(IBP.skeletonCard());
  gridWrap.appendChild(skeletonGrid);
  main.appendChild(gridWrap);

  const footer = IBP.el('div', 'page-footer');
  footer.id = 'dp-footer';
  footer.classList.add('hidden');
  main.appendChild(footer);

  // ─── Load data ───────────────────────────────────────────
  const [briefResult, flagsResult, healthResult] = await Promise.allSettled([
    fetch(`/api/briefs/${today}`).then((r) => r.status === 404 ? null : r.json()),
    fetch(`/api/flags?date=${today}`).then((r) => r.ok ? r.json() : []),
    fetch('/api/health/integrations').then((r) => r.ok ? r.json() : null),
  ]);

  const brief = briefResult.status === 'fulfilled' ? briefResult.value : null;
  const flags = flagsResult.status === 'fulfilled' ? flagsResult.value : [];
  const health = healthResult.status === 'fulfilled' ? healthResult.value : null;
  const openFlags = (flags || []).filter((f) => !f.resolved);

  // Update flag count + sidebar badge
  document.getElementById('dp-flag-count').textContent = `${IBP.roundNum(openFlags.length)} flag${openFlags.length === 1 ? '' : 's'}`;
  document.getElementById('dp-stat-flags').textContent = IBP.roundNum(openFlags.length);
  IBP.updateFlagBadge(openFlags.length);
  if (openFlags.length === 0) {
    document.getElementById('dp-flag-meta-item').style.color = 'var(--ink-500)';
  }

  // ─── Empty state (no brief) ──────────────────────────────
  if (!brief || !brief.crews?.length) {
    document.getElementById('dp-crew-count').textContent = '0 crews scheduled';
    document.getElementById('dp-job-count').textContent = '0 jobs';
    document.getElementById('dp-stat-crews').textContent = '0';
    document.getElementById('dp-stat-jobs').textContent = '0';
    document.getElementById('dp-stat-dispatched').textContent = '0';

    gridWrap.innerHTML = '';
    gridWrap.appendChild(buildEmptyDispatchPanel(today, health));
    return;
  }

  // ─── Render brief ────────────────────────────────────────
  const totalJobs = brief.crews.reduce((n, c) => n + (c.jobs?.length ?? 0), 0);
  const dispatched = brief.crews.filter((c) => c.sentAt).length;
  document.getElementById('dp-crew-count').textContent = `${IBP.roundNum(brief.crews.length)} crews scheduled`;
  document.getElementById('dp-job-count').textContent  = `${IBP.roundNum(totalJobs)} jobs`;
  document.getElementById('dp-stat-crews').textContent = IBP.roundNum(brief.crews.length);
  document.getElementById('dp-stat-jobs').textContent  = IBP.roundNum(totalJobs);
  document.getElementById('dp-stat-dispatched').textContent = IBP.roundNum(dispatched);

  const approved = brief.approved === 1 || brief.approved === true;
  statusPill.innerHTML = `<span class="status-pill ${approved ? 'approved' : 'pending'}">${approved ? 'Approved' : 'Awaiting approval'}</span>`;

  const grid = IBP.el('div', 'crew-grid');
  for (const crew of brief.crews) {
    grid.appendChild(buildBriefCrewCard(crew));
  }
  gridWrap.innerHTML = '';
  gridWrap.appendChild(grid);

  // Footer
  footer.classList.remove('hidden');
  const lastSync = brief.generated_at || brief.generatedAt;
  footer.innerHTML = '';
  const footerLeft = IBP.el('div', 'page-footer-meta',
    lastSync ? `Last AI sync · ${IBP.formatTime(lastSync)}` : '');
  const approveBtn = IBP.el('button', 'btn btn-primary');
  approveBtn.innerHTML = approved
    ? '<i class="ti ti-check"></i><span>Approved & sent</span>'
    : '<i class="ti ti-send"></i><span>Approve & send all</span>';
  approveBtn.disabled = approved;
  approveBtn.addEventListener('click', async () => {
    approveBtn.disabled = true;
    approveBtn.innerHTML = '<span class="spinner"></span><span>Sending…</span>';
    try {
      await IBP.fetchJson(`/api/briefs/${today}/approve`, { method: 'POST' });
      IBP.toast('Approved and dispatched', 'success');
      IBP.render();
    } catch (err) {
      approveBtn.disabled = false;
      approveBtn.innerHTML = '<i class="ti ti-send"></i><span>Approve & send all</span>';
      IBP.toast(err.message || 'Approve failed', 'error');
    }
  });
  footer.appendChild(footerLeft);
  footer.appendChild(approveBtn);
});

// ─── Rich empty state when no brief exists ──────────────────────
function buildEmptyDispatchPanel(today, health) {
  const wrap = IBP.el('div');
  wrap.style.cssText = 'display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-top:8px;';
  if (window.innerWidth < 820) wrap.style.gridTemplateColumns = '1fr';

  // ─── Main empty state card ─────────────────
  const mainCard = IBP.el('div');
  mainCard.style.cssText = `
    background: var(--paper);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-lg);
    padding: 40px 32px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
  `;

  const iconWrap = IBP.el('div');
  iconWrap.style.cssText = `
    width: 56px;
    height: 56px;
    border-radius: 12px;
    background: var(--navy-100);
    color: var(--navy-900);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  `;
  iconWrap.innerHTML = '<i class="ti ti-calendar-plus" style="font-size:28px"></i>';
  mainCard.appendChild(iconWrap);

  const title = IBP.el('div');
  title.style.cssText = 'font-size:20px;font-weight:500;color:var(--ink-900);letter-spacing:-0.01em;';
  title.textContent = 'No brief for today yet';
  mainCard.appendChild(title);

  const sub = IBP.el('div');
  sub.style.cssText = 'font-size:13px;color:var(--ink-500);line-height:1.6;max-width:480px;';
  sub.textContent = 'Generate a brief from the latest approved proposals, or run the scheduling agent to create fresh proposals first.';
  mainCard.appendChild(sub);

  const actions = IBP.el('div');
  actions.style.cssText = 'display:flex;gap:8px;margin-top:6px;';
  const genBtn = IBP.el('button', 'btn btn-primary');
  genBtn.innerHTML = '<i class="ti ti-sparkles"></i><span>Generate brief</span>';
  genBtn.addEventListener('click', async () => {
    genBtn.disabled = true;
    genBtn.innerHTML = '<span class="spinner"></span><span>Generating…</span>';
    try {
      await IBP.fetchJson('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today }),
      });
      IBP.toast('Brief generated', 'success');
      IBP.render();
    } catch (err) {
      IBP.toast(err.message || 'Generate failed', 'error');
      genBtn.disabled = false;
      genBtn.innerHTML = '<i class="ti ti-sparkles"></i><span>Generate brief</span>';
    }
  });
  const scheduleBtn = IBP.el('button', 'btn btn-outline');
  scheduleBtn.innerHTML = '<i class="ti ti-calendar"></i><span>Open schedule</span>';
  scheduleBtn.addEventListener('click', () => IBP.navigate('schedule'));
  actions.appendChild(genBtn);
  actions.appendChild(scheduleBtn);
  mainCard.appendChild(actions);

  wrap.appendChild(mainCard);

  // ─── Right-side health snapshot ────────────
  if (health) {
    const healthCard = IBP.el('div');
    healthCard.style.cssText = `
      background: var(--paper);
      border: 1px solid var(--border-soft);
      border-radius: var(--radius-lg);
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;
    const hLabel = IBP.el('div');
    hLabel.style.cssText = 'font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.08em;color:var(--ink-400);';
    hLabel.textContent = 'System health';
    healthCard.appendChild(hLabel);

    const rows = [
      { name: 'Telegram',  icon: 'brand-telegram', status: health.telegram },
      { name: 'Monday.com', icon: 'square-letter-m', status: health.monday },
      { name: 'Anthropic',  icon: 'brain',           status: health.anthropic },
      { name: 'Supabase',   icon: 'database',        status: health.supabase },
    ];
    for (const r of rows) {
      const row = IBP.el('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;';
      const lhs = IBP.el('div');
      lhs.style.cssText = 'display:flex;align-items:center;gap:8px;color:var(--ink-700);';
      lhs.innerHTML = `<i class="ti ti-${r.icon}" style="font-size:15px;color:var(--ink-500)"></i><span>${r.name}</span>`;
      const dot = IBP.el('span', `tg-status ${r.status.ok ? '' : 'disconnected'}`);
      dot.innerHTML = `<span class="dot"></span><span>${r.status.ok ? 'OK' : 'Issue'}</span>`;
      row.appendChild(lhs);
      row.appendChild(dot);
      healthCard.appendChild(row);
    }
    wrap.appendChild(healthCard);
  }

  return wrap;
}

// ─── Crew card inside a brief ──────────────────────────────────
function buildBriefCrewCard(crew) {
  const card = IBP.el('div', 'crew-card');
  card.dataset.crewKey = crew.crewKey;

  card.addEventListener('click', (e) => {
    if (e.target.closest('button, a')) return;
    openCrewDrawer(crew.crewKey);
  });

  // Head: avatar + name + send count badge
  const head = IBP.el('div');
  head.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:10px;';
  head.appendChild(IBP.avatar(crew.displayName, 'sm'));
  head.appendChild(IBP.el('div', 'crew-card-name', crew.displayName));
  if (crew.sentAt) {
    const sentBadge = IBP.el('span', 'badge success');
    sentBadge.style.marginLeft = 'auto';
    sentBadge.innerHTML = '<i class="ti ti-check" style="font-size:12px;margin-right:2px"></i>Sent';
    head.appendChild(sentBadge);
  }
  card.appendChild(head);

  for (const job of crew.jobs ?? []) {
    card.appendChild(buildJobBlock(job, crew));
  }

  const footer = IBP.el('div', 'crew-card-footer');
  const sendBtn = IBP.el('button', 'btn btn-outline btn-block');
  if (!crew.telegramGroupId) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="ti ti-link-off"></i><span>No Telegram group connected</span>';
  } else if (crew.sentAt) {
    sendBtn.innerHTML = '<i class="ti ti-refresh"></i><span>Resend brief</span>';
  } else {
    sendBtn.innerHTML = `<i class="ti ti-send"></i><span>Send to ${crew.displayName.split(' ')[0]}</span>`;
  }
  sendBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="spinner"></span><span>Sending…</span>';
    try {
      await IBP.fetchJson(`/api/briefs/${IBP.todayISO()}/crew/${crew.crewKey}`, { method: 'POST' });
      sendBtn.innerHTML = '<i class="ti ti-check"></i><span>Sent</span>';
      IBP.toast(`Sent to ${crew.displayName}`, 'success');
    } catch (err) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = `<i class="ti ti-send"></i><span>Send to ${crew.displayName.split(' ')[0]}</span>`;
      IBP.toast(err.message || 'Send failed', 'error');
    }
  });
  footer.appendChild(sendBtn);
  card.appendChild(footer);

  return card;
}

function buildJobBlock(job, crew) {
  const block = IBP.el('div', 'crew-job');

  block.appendChild(IBP.el('div', 'crew-job-num', `#${job.jobNumber ?? '?'}`));

  const name = IBP.el('div', 'crew-job-name', job.jobName ?? '—');
  name.addEventListener('click', (e) => {
    e.stopPropagation();
    if (job.jobNumber) openJobDrawer(job.jobNumber);
  });
  block.appendChild(name);

  if (job.address) {
    const addr = IBP.el('div', 'crew-job-addr');
    addr.innerHTML = `<i class="ti ti-map-pin"></i><span>${IBP.escHtml(job.address)}</span>`;
    block.appendChild(addr);
  }

  const riskFlags = job.riskFlags ?? [];
  for (const flag of riskFlags) {
    const isMaterial = /material/i.test(flag);
    const pill = IBP.el('button', 'flag-pill');
    pill.innerHTML = `<i class="ti ti-alert-triangle"></i><span>${IBP.escHtml(flag)}</span>`;
    if (isMaterial && job.jobNumber) {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        openMaterialDrawer(job.jobNumber, job.jobName, crew.displayName);
      });
    }
    block.appendChild(pill);
  }

  return block;
}

// ─── Drawers (with avatar headers) ───────────────────────────
async function openCrewDrawer(crewKey) {
  try {
    const crew = await IBP.fetchJson(`/api/crews/${crewKey}`);

    const profileHeader = IBP.el('div', 'drawer-profile-header');
    profileHeader.appendChild(IBP.avatar(crew.displayName, 'lg'));
    const info = IBP.el('div', 'drawer-profile-info');
    info.appendChild(IBP.el('div', 'drawer-profile-name', crew.displayName));
    info.appendChild(IBP.el('div', 'drawer-profile-key', crew.key));
    profileHeader.appendChild(info);
    const hs = IBP.el('div', `tg-status ${crew.telegramGroupId ? '' : 'disconnected'}`);
    hs.innerHTML = `<span class="dot"></span><span>${crew.telegramGroupId ? 'Live' : 'Not set'}</span>`;
    profileHeader.appendChild(hs);

    const body = IBP.el('div');
    body.appendChild(profileHeader);

    const inner = IBP.el('div');
    inner.style.padding = '12px 20px';
    inner.appendChild(IBP.drawerRow('Language', (crew.language || 'en').toUpperCase()));
    if (crew.reliability) {
      const rel = crew.reliability;
      inner.appendChild(IBP.drawerRow('Reliability',
        IBP.el('span', `badge ${rel === 'high' ? 'success' : rel === 'low' ? 'danger' : 'warning'}`, rel)));
    }
    inner.appendChild(IBP.drawerRow('Telegram', crew.telegramGroupId || 'Not set'));
    if (crew.strengths?.length) {
      const chips = IBP.el('div');
      chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
      for (const s of crew.strengths) chips.appendChild(IBP.el('span', 'badge neutral', s));
      inner.appendChild(IBP.drawerRow('Skills', chips, { column: true }));
    }
    if (crew.recentJobs?.length) {
      const list = IBP.el('div');
      for (const r of crew.recentJobs.slice(0, 5)) {
        const row = IBP.el('div');
        row.style.cssText = 'padding:6px 0;border-bottom:1px solid var(--border-soft);font-size:12px;display:flex;justify-content:space-between;';
        row.innerHTML = `
          <span><strong>#${IBP.escHtml(r.jobNumber ?? '?')}</strong> ${IBP.escHtml(r.jobName ?? '')}</span>
          <span style="color:var(--ink-400);font-family:JetBrains Mono,Menlo,monospace">${IBP.escHtml(r.briefDate)}</span>
        `;
        list.appendChild(row);
      }
      inner.appendChild(IBP.drawerRow('Recent jobs', list, { column: true }));
    }
    body.appendChild(inner);

    const footer = IBP.el('div');
    const editBtn = IBP.el('button', 'btn btn-outline btn-block');
    editBtn.innerHTML = '<i class="ti ti-edit"></i><span>Edit crew profile</span>';
    editBtn.addEventListener('click', () => {
      IBP.closeDrawer();
      IBP.navigate('crews');
    });
    footer.appendChild(editBtn);

    IBP.openDrawer({ body, footer });
  } catch (err) {
    IBP.toast(err.message || 'Failed to load crew', 'error');
  }
}

async function openJobDrawer(jobNumber) {
  try {
    const [job, assignment] = await Promise.all([
      IBP.fetchJson(`/api/jobs/${jobNumber}`),
      fetch(`/api/jobs/${jobNumber}/assignment`).then((r) => r.ok ? r.json() : { assignments: [] }),
    ]);
    const latestAssign = assignment.assignments?.[0];

    const body = IBP.el('div');

    // Top: current assignment + reassign quick action
    if (latestAssign) {
      const assignBlock = IBP.el('div');
      assignBlock.style.cssText = 'background:var(--info-100);border:1px solid var(--info-100);border-left:3px solid var(--info-700);border-radius:6px;padding:10px 12px;margin-bottom:12px;';
      assignBlock.innerHTML = `
        <div style="font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.06em;color:var(--info-700);margin-bottom:4px;">Currently assigned to</div>
        <div style="font-size:14px;font-weight:500;color:var(--ink-900);">${IBP.escHtml(latestAssign.crewName ?? latestAssign.crewKey)}</div>
        <div style="font-size:11px;color:var(--ink-600);margin-top:2px;">for <span style="font-family:JetBrains Mono,Menlo,monospace;">${IBP.escHtml(latestAssign.date)}</span> · status: <strong>${IBP.escHtml(latestAssign.status)}</strong></div>
      `;
      body.appendChild(assignBlock);
    } else {
      const noAssign = IBP.el('div');
      noAssign.style.cssText = 'background:var(--paper-alt);border:1px solid var(--border-soft);border-radius:6px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:var(--ink-500);';
      noAssign.textContent = 'Not assigned to any crew yet.';
      body.appendChild(noAssign);
    }

    body.appendChild(IBP.drawerRow('Status', job.status || '—'));
    body.appendChild(IBP.drawerRow('Address', job.address || 'TBD'));
    body.appendChild(IBP.drawerRow('City', job.city || '—'));
    body.appendChild(IBP.drawerRow('Customer', job.customerName || '—'));
    body.appendChild(IBP.drawerRow('Material', job.materialReady === 1 ? 'Confirmed delivered' : (job.materialStatus || 'Not confirmed')));
    if (job.trailerNeeded?.length) body.appendChild(IBP.drawerRow('Trailer', job.trailerNeeded.join(', ')));
    if (job.promisedDate) body.appendChild(IBP.drawerRow('Promised', job.promisedDate));
    if (job.history?.length) {
      const list = IBP.el('div');
      for (const h of job.history.slice(0, 6)) {
        const row = IBP.el('div');
        row.style.cssText = 'padding:6px 0;border-bottom:1px solid var(--border-soft);font-size:12px;display:flex;justify-content:space-between;';
        row.innerHTML = `
          <span>${IBP.escHtml(h.briefDate)} · ${IBP.escHtml(h.crewKey)}</span>
          <span class="badge ${h.checkInStatus === 'done' ? 'success' : 'neutral'}">${IBP.escHtml(h.checkInStatus || 'pending')}</span>
        `;
        list.appendChild(row);
      }
      body.appendChild(IBP.drawerRow('Recent runs', list, { column: true }));
    }

    const footer = IBP.el('div');
    const reassignBtn = IBP.el('button', 'btn btn-primary btn-block');
    reassignBtn.innerHTML = latestAssign
      ? '<i class="ti ti-refresh"></i><span>Re-assign to another crew</span>'
      : '<i class="ti ti-user-plus"></i><span>Assign to a crew</span>';
    reassignBtn.addEventListener('click', () => {
      IBP.closeDrawer();
      // Lazy-call the Jobs page's assignment dialog if present, else navigate
      if (typeof window.openAssignDialog === 'function') {
        window.openAssignDialog(job);
      } else {
        IBP.navigate('jobs');
      }
    });
    footer.appendChild(reassignBtn);

    const mondayBtn = IBP.el('a', 'btn btn-outline btn-block');
    mondayBtn.innerHTML = '<i class="ti ti-external-link"></i><span>Open in Monday.com</span>';
    mondayBtn.href = job.mondayItemUrl;
    mondayBtn.target = '_blank';
    mondayBtn.rel = 'noopener';
    footer.appendChild(mondayBtn);

    IBP.openDrawer({ title: job.itemName, subtitle: `#${job.jobNumber}`, body, footer });
  } catch (err) {
    IBP.toast(err.message || 'Failed to load job', 'error');
  }
}

async function openMaterialDrawer(jobNumber, jobName, crewName) {
  try {
    const data = await IBP.fetchJson(`/api/jobs/${jobNumber}/material-status`);
    const body = IBP.el('div');
    const statusVal = IBP.el('span', `badge ${data.confirmed ? 'success' : 'warning'}`, data.status);
    body.appendChild(IBP.drawerRow('Current status', statusVal));
    body.appendChild(IBP.drawerRow('Last update', `${IBP.relativeTime(data.lastUpdate)} — Monday.com`));
    if (data.supplier) body.appendChild(IBP.drawerRow('Supplier', `${data.supplier}${data.poNumber ? ' · PO ' + data.poNumber : ''}`));
    if (data.riskNote) body.appendChild(IBP.drawerRow('Risk if dispatched', data.riskNote, { column: true }));

    const footer = IBP.el('div');
    if (!data.confirmed) {
      const confirmBtn = IBP.el('button', 'btn btn-primary btn-block');
      confirmBtn.innerHTML = '<i class="ti ti-check"></i><span>Mark as confirmed and send</span>';
      confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span class="spinner"></span><span>Confirming…</span>';
        try {
          await IBP.fetchJson(`/api/jobs/${jobNumber}/material-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirmed: true }),
          });
          IBP.toast('Material confirmed', 'success');
          IBP.closeDrawer();
          IBP.render();
        } catch (err) {
          IBP.toast(err.message, 'error');
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = '<i class="ti ti-check"></i><span>Mark as confirmed and send</span>';
        }
      });
      footer.appendChild(confirmBtn);
    }
    const mondayBtn = IBP.el('a', 'btn btn-outline btn-block');
    mondayBtn.innerHTML = `<i class="ti ti-external-link"></i><span>Open job #${jobNumber} in Monday.com</span>`;
    mondayBtn.href = data.mondayItemUrl;
    mondayBtn.target = '_blank';
    mondayBtn.rel = 'noopener';
    footer.appendChild(mondayBtn);

    IBP.openDrawer({
      title: 'Material status — ' + (data.confirmed ? 'confirmed' : 'not confirmed'),
      subtitle: `${jobName ?? ''} · #${jobNumber} · ${crewName ?? ''}`,
      body,
      footer,
    });
  } catch (err) {
    IBP.toast(err.message || 'Failed to load material status', 'error');
  }
}

IBP.openCrewDrawer = openCrewDrawer;
IBP.openJobDrawer = openJobDrawer;
IBP.openMaterialDrawer = openMaterialDrawer;

IBP.updateFlagBadge = (count) => {
  const b = document.getElementById('flags-nav-badge');
  if (!b) return;
  b.textContent = IBP.roundNum(count);
  b.classList.toggle('hidden', count <= 0);
};
