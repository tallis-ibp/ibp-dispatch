/* IBP Dispatch — Schedule page (proposals) */

IBP.registerRoute('schedule', async (main) => {
  const today = IBP.todayISO();

  const header = IBP.el('div', 'page-header');
  const left = IBP.el('div');
  left.appendChild(IBP.el('h1', 'page-title', 'Schedule'));
  left.appendChild(IBP.el('div', 'page-meta',
    'AI-generated proposals for the next 7 days. Review, approve, or reject.'));
  header.appendChild(left);

  const runBtn = IBP.el('button', 'btn btn-primary');
  runBtn.innerHTML = '<i class="ti ti-sparkles"></i><span>Run agent</span>';
  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    runBtn.innerHTML = '<span class="spinner"></span><span>Running…</span>';
    try {
      await IBP.fetchJson('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today }),
      });
      IBP.toast('Proposals generated', 'success');
      IBP.render();
    } catch (err) {
      IBP.toast(err.message || 'Agent failed', 'error');
      runBtn.disabled = false;
      runBtn.innerHTML = '<i class="ti ti-sparkles"></i><span>Run agent</span>';
    }
  });
  header.appendChild(runBtn);
  main.appendChild(header);

  // Fetch proposals for next 7 days
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const wrap = IBP.el('div');
  wrap.appendChild(IBP.spinner('Loading proposals…'));
  main.appendChild(wrap);

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
      title: 'No proposals yet',
      sub: 'Run the scheduling agent to generate today\'s proposals.',
      ctaLabel: 'Run agent for today',
      ctaAction: () => runBtn.click(),
    }));
    return;
  }

  // Group by date
  const byDate = new Map();
  for (const p of allProposals) {
    if (!byDate.has(p.date)) byDate.set(p.date, []);
    byDate.get(p.date).push(p);
  }

  for (const [date, props] of [...byDate.entries()].sort()) {
    const label = IBP.el('div', 'date-group-label', IBP.formatDate(date));
    wrap.appendChild(label);
    for (const p of props) {
      wrap.appendChild(buildProposalCard(p));
    }
  }
});

function buildProposalCard(p) {
  const card = IBP.el('div', 'proposal-card');

  const row = IBP.el('div', 'proposal-row');
  const info = IBP.el('div');
  info.style.display = 'flex';
  info.style.gap = '12px';
  info.style.alignItems = 'center';
  info.appendChild(IBP.el('span', 'proposal-crew', p.crew_key ?? p.crewKey ?? '?'));
  info.appendChild(IBP.el('span', '', '→'));
  const job = IBP.el('span', 'proposal-job', `${p.job_name ?? p.jobName ?? '—'} #${p.job_number ?? p.jobNumber ?? '?'}`);
  info.appendChild(job);
  const confidence = p.confidence ?? 'medium';
  info.appendChild(IBP.el('span', `badge ${confidence === 'high' ? 'success' : confidence === 'low' ? 'warning' : 'info'}`, confidence));

  const actions = IBP.el('div');
  actions.style.display = 'flex';
  actions.style.gap = '6px';
  const status = p.status ?? 'pending';
  if (status === 'pending') {
    const approveBtn = IBP.el('button', 'btn btn-primary btn-sm', 'Approve');
    approveBtn.addEventListener('click', (e) => { e.stopPropagation(); updateProposal(p.id, 'approved'); });
    const rejectBtn = IBP.el('button', 'btn btn-outline btn-sm', 'Reject');
    rejectBtn.addEventListener('click', (e) => { e.stopPropagation(); updateProposal(p.id, 'rejected'); });
    actions.appendChild(approveBtn);
    actions.appendChild(rejectBtn);
  } else {
    actions.appendChild(IBP.el('span', `badge ${status === 'approved' ? 'success' : 'danger'}`, status));
  }

  row.appendChild(info);
  row.appendChild(actions);
  card.appendChild(row);

  if (p.reasoning) {
    const r = IBP.el('div', 'proposal-reasoning', p.reasoning);
    card.appendChild(r);
    card.addEventListener('click', () => card.classList.toggle('expanded'));
  }
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
