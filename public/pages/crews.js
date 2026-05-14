/* IBP Dispatch — Crews page (simplified) */

IBP.registerRoute('crews', async (main) => {
  const header = IBP.el('div', 'page-header');
  const left = IBP.el('div');
  left.appendChild(IBP.el('h1', 'page-title', 'Crews'));
  left.appendChild(IBP.el('div', 'page-meta', 'Connect each crew\'s Telegram group to enable bot dispatch.'));
  header.appendChild(left);

  const addBtn = IBP.el('button', 'btn btn-primary');
  addBtn.innerHTML = '<i class="ti ti-plus"></i><span>Add crew</span>';
  addBtn.addEventListener('click', () => IBP.openAddCrewModal());
  header.appendChild(addBtn);
  main.appendChild(header);

  const wrap = IBP.el('div');
  wrap.appendChild(IBP.spinner('Loading crews…'));
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

  // Sort: connected first, then alphabetical
  const sorted = [...crews].sort((a, b) => {
    const aC = a.telegram_group_id ? 0 : 1;
    const bC = b.telegram_group_id ? 0 : 1;
    if (aC !== bC) return aC - bC;
    return a.display_name.localeCompare(b.display_name);
  });

  // Stats: connected count
  const connectedCount = crews.filter((c) => c.telegram_group_id).length;
  const stats = IBP.el('div', 'stat-strip');
  stats.style.gridTemplateColumns = 'repeat(3, 1fr)';
  stats.innerHTML = `
    <div class="stat-card"><div class="stat-num">${IBP.roundNum(crews.length)}</div><div class="stat-label">Total crews</div></div>
    <div class="stat-card"><div class="stat-num">${IBP.roundNum(connectedCount)}</div><div class="stat-label">Connected to Telegram</div></div>
    <div class="stat-card"><div class="stat-num">${IBP.roundNum(crews.length - connectedCount)}</div><div class="stat-label">Awaiting setup</div></div>
  `;
  wrap.appendChild(stats);

  const grid = IBP.el('div', 'card-grid-4');
  for (const crew of sorted) {
    grid.appendChild(buildCrewMgmtCard(crew));
  }
  wrap.appendChild(grid);
});

function buildCrewMgmtCard(crew) {
  const connected = !!crew.telegram_group_id;
  const card = IBP.el('div', `crew-mgmt-card ${connected ? 'connected' : ''}`);

  // Head: name + connection status
  const head = IBP.el('div', 'crew-mgmt-head');
  const nameWrap = IBP.el('div', 'crew-mgmt-name-wrap');
  nameWrap.appendChild(IBP.el('div', 'crew-mgmt-name', crew.display_name));
  nameWrap.appendChild(IBP.el('div', 'crew-mgmt-key', crew.key));
  head.appendChild(nameWrap);

  const status = IBP.el('div', `tg-status ${connected ? '' : 'disconnected'}`);
  status.innerHTML = `<span class="dot"></span><span>${connected ? 'Live' : 'Not set'}</span>`;
  head.appendChild(status);
  card.appendChild(head);

  // Chat ID (only when connected)
  if (connected) {
    const idRow = IBP.el('div', 'crew-mgmt-id', crew.telegram_group_id);
    card.appendChild(idRow);
  }

  // Actions: Edit + Test
  const actions = IBP.el('div', 'crew-mgmt-actions');
  const editBtn = IBP.el('button', 'btn btn-outline btn-sm', connected ? 'Edit' : 'Connect');
  editBtn.addEventListener('click', () => IBP.openCrewSetupForEdit(crew));
  actions.appendChild(editBtn);

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
      } catch (err) {
        IBP.toast(err.message, 'error');
      } finally {
        testBtn.disabled = false;
      }
    });
    actions.appendChild(testBtn);
  }

  // "Details" icon opens drawer with reliability/skills/language (AI metadata)
  const detailsBtn = IBP.el('button', 'btn-icon');
  detailsBtn.title = 'Crew profile';
  detailsBtn.innerHTML = '<i class="ti ti-info-circle"></i>';
  detailsBtn.addEventListener('click', () => openCrewProfileDrawer(crew));
  actions.appendChild(detailsBtn);

  card.appendChild(actions);
  return card;
}

async function openCrewProfileDrawer(crew) {
  const body = IBP.el('div');

  const strengths = IBP.safeJson(crew.strengths, []);
  const cautions = IBP.safeJson(crew.cautions, []);

  body.appendChild(IBP.drawerRow('Key', crew.key));
  body.appendChild(IBP.drawerRow('Language',
    IBP.el('span', 'badge neutral', (crew.language || 'en').toUpperCase())));

  if (crew.reliability) {
    const rel = crew.reliability;
    body.appendChild(IBP.drawerRow('Reliability',
      IBP.el('span', `badge ${rel === 'high' ? 'success' : rel === 'low' ? 'danger' : 'warning'}`, rel)));
  }

  body.appendChild(IBP.drawerRow('Telegram group', crew.telegram_group_id || 'Not set'));

  if (strengths.length) {
    const chips = IBP.el('div');
    chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;';
    for (const s of strengths) chips.appendChild(IBP.el('span', 'badge neutral', s));
    body.appendChild(IBP.drawerRow('Skills', chips, { column: true }));
  }
  if (cautions.length) {
    const chips = IBP.el('div');
    chips.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    for (const c of cautions) {
      const row = IBP.el('div');
      row.style.cssText = 'font-size:12px;color:var(--warning-700);background:var(--warning-100);border:1px solid var(--warning-200);padding:6px 8px;border-radius:4px;';
      row.textContent = c;
      chips.appendChild(row);
    }
    body.appendChild(IBP.drawerRow('Cautions', chips, { column: true }));
  }

  const sub = IBP.el('div');
  sub.style.cssText = 'font-size:11px;color:var(--ink-400);margin-top:14px;padding:10px;background:var(--paper-alt);border-radius:6px;line-height:1.5;';
  sub.textContent = 'Reliability, language and skills are used by the AI scheduling agent to assign jobs. Edit them in the database; they are read-only here.';
  body.appendChild(sub);

  const footer = IBP.el('div');
  const editBtn = IBP.el('button', 'btn btn-outline btn-block', crew.telegram_group_id ? 'Edit Telegram group' : 'Connect Telegram group');
  editBtn.addEventListener('click', () => {
    IBP.closeDrawer();
    IBP.openCrewSetupForEdit(crew);
  });
  footer.appendChild(editBtn);

  IBP.openDrawer({
    title: crew.display_name,
    subtitle: crew.key,
    body,
    footer,
  });
}
