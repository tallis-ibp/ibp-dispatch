/* IBP Dispatch — Logistics page (today's dispatch route) */

IBP.registerRoute('logistics', async (main) => {
  const today = IBP.todayISO();

  main.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Logistics</h1>
        <div class="page-meta">Today's dispatch route — addresses, gate codes, trailers, and crew sequence.</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-outline" id="logistics-print"><i class="ti ti-printer"></i><span>Print</span></button>
        <button class="btn btn-outline" id="logistics-copy"><i class="ti ti-copy"></i><span>Copy as text</span></button>
      </div>
    </div>
    <div id="logistics-body"><div class="loading-row"><span class="spinner"></span><span>Loading today's plan…</span></div></div>
  `;

  let brief;
  try { brief = await fetch(`/api/briefs/${today}`).then((r) => r.status === 404 ? null : r.json()); }
  catch (err) {
    document.getElementById('logistics-body').innerHTML = '';
    document.getElementById('logistics-body').appendChild(IBP.emptyState({
      icon: 'alert-triangle', title: 'Failed to load brief', sub: err.message,
    }));
    return;
  }

  const body = document.getElementById('logistics-body');
  if (!brief || !brief.crews?.length) {
    body.innerHTML = '';
    body.appendChild(IBP.emptyState({
      icon: 'truck-off',
      title: 'No dispatch route for today',
      sub: 'Assign jobs from the Jobs page or run the agent to generate today\'s brief.',
      ctaLabel: 'Browse jobs',
      ctaAction: () => IBP.navigate('jobs'),
    }));
    return;
  }

  // Flatten all jobs across crews for stats + an "all stops" route view
  const allJobs = [];
  for (const crew of brief.crews) {
    for (const job of crew.jobs ?? []) {
      allJobs.push({ ...job, crewName: crew.displayName, crewKey: crew.crewKey, telegramGroupId: crew.telegramGroupId });
    }
  }

  const withGate    = allJobs.filter((j) => j.gateCode && j.gateCode !== 'NA').length;
  const withTrailer = allJobs.filter((j) => j.trailerType).length;
  const withSup     = allJobs.filter((j) => j.supervisor).length;

  body.innerHTML = `
    <div class="stat-strip" style="grid-template-columns:repeat(4,1fr);">
      <div class="stat-card"><div class="stat-num">${IBP.roundNum(allJobs.length)}</div><div class="stat-label">Stops today</div></div>
      <div class="stat-card"><div class="stat-num">${IBP.roundNum(brief.crews.length)}</div><div class="stat-label">Crews dispatched</div></div>
      <div class="stat-card"><div class="stat-num" style="color:var(--info-700)">${IBP.roundNum(withTrailer)}</div><div class="stat-label">Trailer assigned</div></div>
      <div class="stat-card"><div class="stat-num" style="color:var(--warning-700)">${IBP.roundNum(allJobs.length - withGate)}</div><div class="stat-label">Missing gate code</div></div>
    </div>

    <div class="logistics-grid">
      ${brief.crews.map(renderCrewRoute).join('')}
    </div>
  `;

  // Print + copy actions
  document.getElementById('logistics-print').addEventListener('click', () => window.print());
  document.getElementById('logistics-copy').addEventListener('click', () => {
    const text = buildTextSummary(brief);
    navigator.clipboard?.writeText(text)
      .then(() => IBP.toast('Copied to clipboard', 'success'))
      .catch(() => IBP.toast('Copy failed', 'error'));
  });
});

function renderCrewRoute(crew) {
  const jobs = crew.jobs ?? [];
  if (!jobs.length) return '';

  const initials = IBP.initials(crew.displayName);
  const colorIdx = IBP.colorIndex(crew.displayName);

  const stops = jobs.map((j, i) => {
    const mapsHref = j.address ? `https://maps.google.com/?q=${encodeURIComponent(j.address)}` : null;
    const risks = (j.riskFlags ?? []).map((f) =>
      `<span class="badge warning" style="font-size:10px;">${IBP.escHtml(f)}</span>`).join(' ');
    return `
      <div class="route-stop">
        <div class="route-stop-num">${i + 1}</div>
        <div class="route-stop-body">
          <div class="route-stop-head">
            <span class="route-stop-num-text">#${IBP.escHtml(j.jobNumber ?? '?')}</span>
            <span class="route-stop-name">${IBP.escHtml(j.jobName ?? '—')}</span>
          </div>
          ${j.address ? `<div class="route-stop-addr">${mapsHref ? `<a href="${mapsHref}" target="_blank" rel="noopener">` : ''}<i class="ti ti-map-pin"></i><span>${IBP.escHtml(j.address)}</span>${mapsHref ? '</a>' : ''}</div>` : ''}
          <div class="route-stop-meta">
            ${j.gateCode && j.gateCode !== 'NA' ? `<span><strong>Gate</strong> <code>${IBP.escHtml(j.gateCode)}</code></span>` : ''}
            ${j.supervisor ? `<span><strong>Sup</strong> ${IBP.escHtml(j.supervisor)}</span>` : ''}
            ${j.trailerType ? `<span><strong>Trailer</strong> ${IBP.escHtml(j.trailerType)}</span>` : ''}
            ${j.nextStop ? `<span><strong>Next</strong> ${IBP.escHtml(j.nextStop)}</span>` : ''}
          </div>
          ${risks ? `<div style="margin-top:6px;">${risks}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  const sentBadge = crew.sentAt
    ? `<span class="badge success" style="font-size:11px;"><i class="ti ti-check" style="font-size:11px"></i>&nbsp;Dispatched ${IBP.escHtml(IBP.formatTime(crew.sentAt))}</span>`
    : crew.telegramGroupId
      ? `<span class="badge neutral" style="font-size:11px;">Awaiting send</span>`
      : `<span class="badge danger" style="font-size:11px;">No Telegram link</span>`;

  return `
    <div class="route-card">
      <div class="route-card-head">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="avatar avatar-md avatar-c${colorIdx}">${IBP.escHtml(initials)}</div>
          <div>
            <div style="font-size:14px;font-weight:500;color:var(--ink-900);">${IBP.escHtml(crew.displayName)}</div>
            <div style="font-size:11px;color:var(--ink-500);">${IBP.roundNum(jobs.length)} stop${jobs.length === 1 ? '' : 's'}</div>
          </div>
        </div>
        ${sentBadge}
      </div>
      <div class="route-stops">${stops}</div>
    </div>
  `;
}

function buildTextSummary(brief) {
  const lines = [];
  lines.push(`*Dispatch route — ${brief.date}*`, '');
  for (const crew of brief.crews ?? []) {
    lines.push(`*${crew.displayName}* (${(crew.jobs ?? []).length} stops)`);
    (crew.jobs ?? []).forEach((j, i) => {
      lines.push(`  ${i + 1}. #${j.jobNumber ?? '?'} ${j.jobName ?? '—'}`);
      if (j.address) lines.push(`     ${j.address}`);
      const meta = [
        j.gateCode && j.gateCode !== 'NA' ? `Gate ${j.gateCode}` : null,
        j.supervisor ? `Sup ${j.supervisor}` : null,
        j.trailerType ? `Trailer ${j.trailerType}` : null,
      ].filter(Boolean);
      if (meta.length) lines.push(`     ${meta.join(' · ')}`);
    });
    lines.push('');
  }
  return lines.join('\n');
}
