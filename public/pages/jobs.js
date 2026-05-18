/* IBP Dispatch — Jobs page (Monday jobs browser) */

const JOB_STATUS_STYLE = {
  'NEED_TO_SCHEDULE': { color: 'warning', label: 'Need to schedule' },
  'SCHEDULED_JOB':    { color: 'info',    label: 'Scheduled' },
  'WORKING_ON':       { color: 'info',    label: 'Working on' },
  'WORKING ON':       { color: 'info',    label: 'Working on' },
  'DONE':             { color: 'success', label: 'Done' },
  'COMPLETE':         { color: 'success', label: 'Complete' },
  'CANCELLED':        { color: 'neutral', label: 'Cancelled' },
  'ON_HOLD':          { color: 'danger',  label: 'On hold' },
};

const MATERIAL_STYLE = {
  ready:   { color: 'success', label: 'Material ready' },
  pending: { color: 'warning', label: 'Material pending' },
  unknown: { color: 'neutral', label: 'Material unknown' },
};

IBP.registerRoute('jobs', async (main) => {
  // ─── Page header ─────────────────────────────────────────
  const header = IBP.el('div', 'page-header');
  const left = IBP.el('div');
  left.appendChild(IBP.el('h1', 'page-title', 'Jobs'));
  left.appendChild(IBP.el('div', 'page-meta',
    'Live mirror of the Monday general jobs board — synced every 30 minutes.'));
  header.appendChild(left);

  const right = IBP.el('div');
  right.style.cssText = 'display:flex;gap:8px;';
  const syncBtn = IBP.el('button', 'btn btn-outline');
  syncBtn.innerHTML = '<i class="ti ti-refresh"></i><span>Sync from Monday</span>';
  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    syncBtn.innerHTML = '<span class="spinner"></span><span>Syncing…</span>';
    try {
      await IBP.fetchJson('/api/sync', { method: 'POST' });
      IBP.toast('Monday synced', 'success');
      IBP.render();
    } catch (err) {
      IBP.toast(err.message || 'Sync failed', 'error');
    } finally {
      syncBtn.disabled = false;
      syncBtn.innerHTML = '<i class="ti ti-refresh"></i><span>Sync from Monday</span>';
    }
  });
  const mondayBtn = IBP.el('a', 'btn btn-outline');
  mondayBtn.innerHTML = '<i class="ti ti-external-link"></i><span>Open board in Monday</span>';
  mondayBtn.href = 'https://installbrickpavers-team.monday.com/boards/2214820863';
  mondayBtn.target = '_blank';
  mondayBtn.rel = 'noopener';
  right.appendChild(syncBtn);
  right.appendChild(mondayBtn);
  header.appendChild(right);
  main.appendChild(header);

  // ─── Filters ────────────────────────────────────────────
  const filters = IBP.el('div', 'filter-row');
  const search = IBP.el('input');
  search.type = 'search';
  search.placeholder = 'Search job # / name / customer / address…';
  search.style.maxWidth = '320px';

  const statusSelect = IBP.el('select');
  statusSelect.innerHTML = '<option value="">All statuses</option>';
  statusSelect.style.maxWidth = '200px';

  const materialSelect = IBP.el('select');
  materialSelect.innerHTML = `
    <option value="">All materials</option>
    <option value="ready">Material ready</option>
    <option value="pending">Material pending</option>
    <option value="unknown">Material unknown</option>
  `;
  materialSelect.style.maxWidth = '180px';

  filters.appendChild(search);
  filters.appendChild(statusSelect);
  filters.appendChild(materialSelect);
  main.appendChild(filters);

  // ─── Body ───────────────────────────────────────────────
  const stats = IBP.el('div', 'stat-strip');
  stats.id = 'jobs-stats';
  stats.innerHTML = '';
  main.appendChild(stats);

  const wrap = IBP.el('div');
  wrap.id = 'jobs-wrap';
  wrap.appendChild(IBP.spinner('Loading jobs…'));
  main.appendChild(wrap);

  let debounce;
  const reload = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => fetchAndRender(search.value, statusSelect.value, materialSelect.value, stats, wrap), 220);
  };
  search.addEventListener('input', reload);
  statusSelect.addEventListener('change', reload);
  materialSelect.addEventListener('change', reload);

  await fetchAndRender('', '', '', stats, wrap, statusSelect);
});

async function fetchAndRender(searchVal, statusVal, materialVal, stats, wrap, statusSelect) {
  wrap.innerHTML = '';
  wrap.appendChild(IBP.spinner('Loading jobs…'));

  const params = new URLSearchParams();
  if (searchVal)   params.set('search', searchVal);
  if (statusVal)   params.set('status', statusVal);
  if (materialVal) params.set('materialReady', materialVal);

  let data;
  try { data = await IBP.fetchJson(`/api/jobs?${params}`); }
  catch (err) {
    wrap.innerHTML = '';
    wrap.appendChild(IBP.emptyState({
      icon: 'alert-triangle', title: 'Failed to load jobs', sub: err.message,
    }));
    return;
  }

  const jobs = data.jobs ?? [];
  const total = (data.statusCounts ?? []).reduce((n, x) => n + (x.count || 0), 0);
  const readyCount = (data.materialCounts ?? []).find((m) => m.bucket === 'ready')?.count ?? 0;
  const pendingCount = (data.materialCounts ?? []).find((m) => m.bucket === 'pending')?.count ?? 0;

  stats.style.gridTemplateColumns = 'repeat(4, 1fr)';
  stats.innerHTML = `
    <div class="stat-card"><div class="stat-num">${IBP.roundNum(total)}</div><div class="stat-label">Total jobs in DB</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--success-700)">${IBP.roundNum(readyCount)}</div><div class="stat-label">Material ready</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--warning-700)">${IBP.roundNum(pendingCount)}</div><div class="stat-label">Material pending</div></div>
    <div class="stat-card"><div class="stat-num">${IBP.roundNum(jobs.length)}</div><div class="stat-label">Shown after filters</div></div>
  `;

  // Populate status select on first run
  if (statusSelect && statusSelect.options.length === 1 && data.statusCounts) {
    for (const s of data.statusCounts) {
      if (!s.status) continue;
      const o = IBP.el('option', '', `${(JOB_STATUS_STYLE[s.status]?.label ?? s.status)} · ${IBP.roundNum(s.count)}`);
      o.value = s.status;
      statusSelect.appendChild(o);
    }
  }

  wrap.innerHTML = '';
  if (!jobs.length) {
    wrap.appendChild(IBP.emptyState({
      icon: 'briefcase-off',
      title: 'No jobs match these filters',
      sub: 'Clear filters or sync from Monday if you expect data to be here.',
    }));
    return;
  }

  const table = IBP.el('div', 'jobs-table');
  // Headers
  const head = IBP.el('div', 'jobs-row jobs-row-head');
  head.innerHTML = `
    <div class="col-job">Job</div>
    <div class="col-customer">Customer</div>
    <div class="col-status">Status</div>
    <div class="col-material">Material</div>
    <div class="col-promised">Promised</div>
    <div class="col-actions"></div>
  `;
  table.appendChild(head);

  for (const job of jobs) table.appendChild(buildJobRow(job));
  wrap.appendChild(table);
}

function buildJobRow(job) {
  const row = IBP.el('div', 'jobs-row');
  row.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    if (typeof IBP.openJobDrawer === 'function' && job.jobNumber) IBP.openJobDrawer(job.jobNumber);
  });

  // Job column: number + name + address
  const jobCol = IBP.el('div', 'col-job');
  jobCol.innerHTML = `
    <div class="job-num">#${IBP.escHtml(job.jobNumber ?? '?')}</div>
    <div class="job-name">${IBP.escHtml(job.itemName ?? '—')}</div>
    ${job.address ? `<div class="job-addr"><i class="ti ti-map-pin"></i>${IBP.escHtml(job.address)}</div>` : ''}
  `;
  row.appendChild(jobCol);

  // Customer
  const customerCol = IBP.el('div', 'col-customer');
  customerCol.innerHTML = `
    <div>${IBP.escHtml(job.customerName ?? '—')}</div>
    ${job.clientType ? `<div class="job-meta">${IBP.escHtml(job.clientType)}</div>` : ''}
  `;
  row.appendChild(customerCol);

  // Status
  const statusInfo = JOB_STATUS_STYLE[job.status] || { color: 'neutral', label: job.status || 'Unknown' };
  const statusCol = IBP.el('div', 'col-status');
  statusCol.innerHTML = `<span class="badge ${statusInfo.color}">${IBP.escHtml(statusInfo.label)}</span>`;
  row.appendChild(statusCol);

  // Material
  const matBucket = job.materialReady === 1 ? 'ready' : job.materialReady === 0 ? 'pending' : 'unknown';
  const matInfo = MATERIAL_STYLE[matBucket];
  const matCol = IBP.el('div', 'col-material');
  matCol.innerHTML = `
    <span class="badge ${matInfo.color}">${IBP.escHtml(matInfo.label)}</span>
    ${job.materialStatus ? `<div class="job-meta">${IBP.escHtml(job.materialStatus)}</div>` : ''}
  `;
  row.appendChild(matCol);

  // Promised
  const promisedCol = IBP.el('div', 'col-promised');
  promisedCol.innerHTML = job.promisedDate
    ? `<div class="job-promised">${IBP.escHtml(job.promisedDate)}</div>`
    : `<div class="job-meta">—</div>`;
  row.appendChild(promisedCol);

  // Actions
  const actionsCol = IBP.el('div', 'col-actions');
  const link = IBP.el('a', 'btn-icon');
  link.title = 'Open in Monday';
  link.innerHTML = '<i class="ti ti-external-link"></i>';
  link.href = job.mondayItemUrl;
  link.target = '_blank';
  link.rel = 'noopener';
  link.addEventListener('click', (e) => e.stopPropagation());
  actionsCol.appendChild(link);
  row.appendChild(actionsCol);

  return row;
}
