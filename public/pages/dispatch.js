/* IBP Dispatch — Dispatch page */

IBP.registerRoute('dispatch', async (main) => {
  const today = IBP.todayISO();

  // Header
  const header = IBP.el('div', 'page-header');
  const left = IBP.el('div');
  left.appendChild(IBP.el('h1', 'page-title', IBP.formatDate(today)));
  const meta = IBP.el('div', 'page-meta');
  meta.innerHTML = `
    <span class="meta-item"><i class="ti ti-users"></i><span id="dp-crew-count">—</span></span>
    <span class="meta-item"><i class="ti ti-clipboard-list"></i><span id="dp-job-count">—</span></span>
    <span class="meta-item" style="color: var(--warning-700)"><i class="ti ti-flag"></i><span id="dp-flag-count">—</span></span>
  `;
  left.appendChild(meta);
  header.appendChild(left);

  const statusPill = IBP.el('div');
  statusPill.id = 'dp-status-pill';
  header.appendChild(statusPill);
  main.appendChild(header);

  // Stats strip
  const stats = IBP.el('div', 'stat-strip');
  stats.innerHTML = `
    <div class="stat-card"><div class="stat-num" id="dp-stat-crews">0</div><div class="stat-label">Crews scheduled</div></div>
    <div class="stat-card"><div class="stat-num" id="dp-stat-jobs">0</div><div class="stat-label">Jobs assigned</div></div>
    <div class="stat-card"><div class="stat-num" id="dp-stat-dispatched">0</div><div class="stat-label">Dispatched</div></div>
    <div class="stat-card"><div class="stat-num" id="dp-stat-flags">0</div><div class="stat-label">Flags pending</div></div>
  `;
  main.appendChild(stats);

  // Crew grid container
  const gridWrap = IBP.el('div');
  gridWrap.id = 'dp-grid-wrap';
  gridWrap.appendChild(IBP.spinner('Loading today\'s brief…'));
  main.appendChild(gridWrap);

  // Footer (rendered after brief loads)
  const footer = IBP.el('div', 'page-footer');
  footer.id = 'dp-footer';
  footer.classList.add('hidden');
  main.appendChild(footer);

  // Load brief + flags in parallel
  const [briefResult, flagsResult] = await Promise.allSettled([
    fetch(`/api/briefs/${today}`).then((r) => r.status === 404 ? null : r.json()),
    fetch(`/api/flags?date=${today}`).then((r) => r.ok ? r.json() : []),
  ]);

  const brief = briefResult.status === 'fulfilled' ? briefResult.value : null;
  const flags = flagsResult.status === 'fulfilled' ? flagsResult.value : [];
  const openFlags = (flags || []).filter((f) => !f.resolved);

  // Update meta + flags badge
  document.getElementById('dp-flag-count').textContent = `${IBP.roundNum(openFlags.length)} flag${openFlags.length === 1 ? '' : 's'}`;
  document.getElementById('dp-stat-flags').textContent = IBP.roundNum(openFlags.length);
  IBP.updateFlagBadge(openFlags.length);

  if (!brief || !brief.crews?.length) {
    document.getElementById('dp-crew-count').textContent = '0 crews scheduled';
    document.getElementById('dp-job-count').textContent = '0 jobs';
    gridWrap.innerHTML = '';
    gridWrap.appendChild(IBP.emptyState({
      icon: 'clipboard-off',
      title: 'No brief for today yet',
      sub: 'Generate one from the latest approved proposals or run the agent first.',
      ctaLabel: 'Generate brief',
      ctaAction: async () => {
        try {
          await IBP.fetchJson('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: today }),
          });
          IBP.render();
        } catch (err) { IBP.toast(err.message, 'error'); }
      },
    }));
    return;
  }

  const totalJobs = brief.crews.reduce((n, c) => n + (c.jobs?.length ?? 0), 0);
  const dispatched = brief.crews.filter((c) => c.sentAt).length;
  document.getElementById('dp-crew-count').textContent = `${IBP.roundNum(brief.crews.length)} crews scheduled`;
  document.getElementById('dp-job-count').textContent  = `${IBP.roundNum(totalJobs)} jobs`;
  document.getElementById('dp-stat-crews').textContent = IBP.roundNum(brief.crews.length);
  document.getElementById('dp-stat-jobs').textContent  = IBP.roundNum(totalJobs);
  document.getElementById('dp-stat-dispatched').textContent = IBP.roundNum(dispatched);

  // Status pill
  const approved = brief.approved === 1 || brief.approved === true;
  statusPill.innerHTML = `<span class="status-pill ${approved ? 'approved' : 'pending'}">${approved ? 'Approved' : 'Awaiting approval'}</span>`;

  // Crew grid
  const grid = IBP.el('div', 'crew-grid');
  for (const crew of brief.crews) {
    grid.appendChild(buildCrewCard(crew));
  }
  gridWrap.innerHTML = '';
  gridWrap.appendChild(grid);

  // Footer
  footer.classList.remove('hidden');
  const lastSync = brief.generated_at || brief.generatedAt;
  footer.innerHTML = '';
  const footerLeft = IBP.el('div', 'page-footer-meta', lastSync ? `Last AI sync: ${IBP.formatTime(lastSync)}` : '');
  const approveBtn = IBP.el('button', 'btn btn-primary', approved ? 'Approved & sent' : 'Approve & send all');
  approveBtn.disabled = approved;
  approveBtn.addEventListener('click', async () => {
    approveBtn.disabled = true;
    approveBtn.textContent = 'Sending…';
    try {
      await IBP.fetchJson(`/api/briefs/${today}/approve`, { method: 'POST' });
      IBP.toast('Approved and dispatched', 'success');
      IBP.render();
    } catch (err) {
      approveBtn.disabled = false;
      approveBtn.textContent = 'Approve & send all';
      IBP.toast(err.message || 'Approve failed', 'error');
    }
  });
  footer.appendChild(footerLeft);
  footer.appendChild(approveBtn);
});

function buildCrewCard(crew) {
  const card = IBP.el('div', 'crew-card');
  card.dataset.crewKey = crew.crewKey;

  // Click anywhere on the card opens crew drawer (except buttons)
  card.addEventListener('click', (e) => {
    if (e.target.closest('button, a')) return;
    openCrewDrawer(crew.crewKey);
  });

  card.appendChild(IBP.el('div', 'crew-card-name', crew.displayName));

  for (const job of crew.jobs ?? []) {
    card.appendChild(buildJobBlock(job, crew));
  }

  const footer = IBP.el('div', 'crew-card-footer');
  const sendBtn = IBP.el('button', 'btn btn-outline btn-block',
    crew.sentAt ? 'Sent · resend' : `Send to ${crew.displayName.split(' ')[0]}`);
  if (!crew.telegramGroupId) {
    sendBtn.disabled = true;
    sendBtn.textContent = 'No Telegram group connected';
  }
  sendBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending…';
    try {
      await IBP.fetchJson(`/api/briefs/${IBP.todayISO()}/crew/${crew.crewKey}`, { method: 'POST' });
      sendBtn.textContent = 'Sent ✓';
      IBP.toast(`Sent to ${crew.displayName}`, 'success');
    } catch (err) {
      sendBtn.disabled = false;
      sendBtn.textContent = `Send to ${crew.displayName.split(' ')[0]}`;
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

  // Material-not-confirmed flag → click → material drawer
  const riskFlags = job.riskFlags ?? [];
  for (const flag of riskFlags) {
    const isMaterial = /material/i.test(flag);
    const pill = IBP.el('button', 'flag-pill warning');
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

// ─── Drawers ────────────────────────────────────────────────────
async function openCrewDrawer(crewKey) {
  try {
    const crew = await IBP.fetchJson(`/api/crews/${crewKey}`);
    const body = IBP.el('div');
    body.appendChild(IBP.drawerRow('Crew key', crew.key));
    body.appendChild(IBP.drawerRow('Language', (crew.language || 'en').toUpperCase()));
    if (crew.reliability) {
      const rel = IBP.el('span', `badge ${crew.reliability === 'high' ? 'success' : crew.reliability === 'low' ? 'danger' : 'warning'}`, `${crew.reliability} reliability`);
      body.appendChild(IBP.drawerRow('Reliability', rel));
    }
    body.appendChild(IBP.drawerRow('Telegram group', crew.telegramGroupId || 'Not set'));
    if (crew.strengths?.length) {
      body.appendChild(IBP.drawerRow('Skills', crew.strengths.join(', '), { column: true }));
    }
    if (crew.cautions?.length) {
      body.appendChild(IBP.drawerRow('Cautions', crew.cautions.join(', '), { column: true }));
    }
    if (crew.recentJobs?.length) {
      const list = IBP.el('div');
      for (const r of crew.recentJobs) {
        const row = IBP.el('div');
        row.style.padding = '6px 0';
        row.style.borderBottom = '0.5px solid var(--border-soft)';
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.fontSize = '12px';
        row.innerHTML = `
          <span><strong>#${IBP.escHtml(r.jobNumber ?? '?')}</strong> ${IBP.escHtml(r.jobName ?? '')}</span>
          <span style="color:var(--ink-400);font-family:ui-monospace,Menlo,monospace">${IBP.escHtml(r.briefDate)}</span>
        `;
        list.appendChild(row);
      }
      body.appendChild(IBP.drawerRow('Recent jobs', list, { column: true }));
    }

    const footer = IBP.el('div');
    footer.style.display = 'flex';
    footer.style.gap = '8px';
    const editBtn = IBP.el('button', 'btn btn-outline btn-block', 'Edit Telegram group');
    editBtn.addEventListener('click', () => {
      IBP.closeDrawer();
      openCrewSetupFromDispatch(crew);
    });
    footer.appendChild(editBtn);

    IBP.openDrawer({ title: crew.displayName, subtitle: crew.key, body, footer });
  } catch (err) {
    IBP.toast(err.message || 'Failed to load crew', 'error');
  }
}

async function openJobDrawer(jobNumber) {
  try {
    const job = await IBP.fetchJson(`/api/jobs/${jobNumber}`);
    const body = IBP.el('div');
    body.appendChild(IBP.drawerRow('Status', job.status || '—'));
    body.appendChild(IBP.drawerRow('Address', job.address || 'TBD'));
    body.appendChild(IBP.drawerRow('City', job.city || '—'));
    body.appendChild(IBP.drawerRow('Customer', job.customerName || '—'));
    body.appendChild(IBP.drawerRow('Material', job.materialReady === 1 ? 'Confirmed delivered' : (job.materialStatus || 'Not confirmed')));
    if (job.trailerNeeded?.length) body.appendChild(IBP.drawerRow('Trailer', job.trailerNeeded.join(', ')));
    if (job.promisedDate) body.appendChild(IBP.drawerRow('Promised', job.promisedDate));
    if (job.history?.length) {
      const list = IBP.el('div');
      for (const h of job.history) {
        const row = IBP.el('div');
        row.style.cssText = 'padding:6px 0;border-bottom:0.5px solid var(--border-soft);font-size:12px;display:flex;justify-content:space-between;';
        row.innerHTML = `
          <span>${IBP.escHtml(h.briefDate)} · ${IBP.escHtml(h.crewKey)}</span>
          <span class="badge ${h.checkInStatus === 'done' ? 'success' : 'neutral'}">${IBP.escHtml(h.checkInStatus || 'pending')}</span>
        `;
        list.appendChild(row);
      }
      body.appendChild(IBP.drawerRow('Recent runs', list, { column: true }));
    }

    const footer = IBP.el('div');
    footer.style.display = 'flex';
    footer.style.flexDirection = 'column';
    footer.style.gap = '8px';
    const mondayBtn = IBP.el('a', 'btn btn-outline btn-block', 'Open in Monday.com');
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
    footer.style.display = 'flex';
    footer.style.flexDirection = 'column';
    footer.style.gap = '8px';

    if (!data.confirmed) {
      const confirmBtn = IBP.el('button', 'btn btn-primary btn-block', 'Mark as confirmed and send');
      confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Confirming…';
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
          confirmBtn.textContent = 'Mark as confirmed and send';
        }
      });
      footer.appendChild(confirmBtn);
    }
    const mondayBtn = IBP.el('a', 'btn btn-outline btn-block', `Open job #${jobNumber} in Monday.com`);
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

// Expose helpers used by other pages
IBP.openCrewDrawer = openCrewDrawer;
IBP.openJobDrawer = openJobDrawer;
IBP.openMaterialDrawer = openMaterialDrawer;

IBP.updateFlagBadge = (count) => {
  const b = document.getElementById('flags-nav-badge');
  if (!b) return;
  b.textContent = IBP.roundNum(count);
  b.classList.toggle('hidden', count <= 0);
};
