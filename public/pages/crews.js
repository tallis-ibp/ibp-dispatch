/* IBP Dispatch — Crews page */

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

  const grid = IBP.el('div', 'card-grid-3');
  for (const crew of crews) {
    grid.appendChild(buildCrewMgmtCard(crew));
  }
  wrap.appendChild(grid);
});

function buildCrewMgmtCard(crew) {
  const card = IBP.el('div', 'crew-mgmt-card');
  const connected = !!crew.telegram_group_id;

  const head = IBP.el('div', 'crew-mgmt-head');
  const nameWrap = IBP.el('div');
  nameWrap.appendChild(IBP.el('div', 'crew-mgmt-name', crew.display_name));
  nameWrap.appendChild(IBP.el('div', 'crew-mgmt-key', crew.key));
  head.appendChild(nameWrap);
  const status = IBP.el('div', `tg-status ${connected ? '' : 'disconnected'}`);
  status.innerHTML = `<span class="dot"></span><span>${connected ? 'Connected' : 'Not set'}</span>`;
  head.appendChild(status);
  card.appendChild(head);

  const langRow = IBP.el('div', 'crew-mgmt-row');
  langRow.appendChild(IBP.el('span', 'crew-mgmt-row-label', 'Language'));
  langRow.appendChild(IBP.el('span', 'badge neutral', (crew.language || 'en').toUpperCase()));
  card.appendChild(langRow);

  if (crew.reliability) {
    const relRow = IBP.el('div', 'crew-mgmt-row');
    relRow.appendChild(IBP.el('span', 'crew-mgmt-row-label', 'Reliability'));
    const rel = crew.reliability;
    relRow.appendChild(IBP.el('span',
      `badge ${rel === 'high' ? 'success' : rel === 'low' ? 'danger' : 'warning'}`, rel));
    card.appendChild(relRow);
  }

  const strengths = IBP.safeJson(crew.strengths, []);
  if (strengths.length) {
    const skillsRow = IBP.el('div');
    skillsRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;';
    for (const s of strengths) skillsRow.appendChild(IBP.el('span', 'badge neutral', s));
    card.appendChild(skillsRow);
  }

  if (connected) {
    const idRow = IBP.el('div', 'crew-mgmt-row');
    idRow.appendChild(IBP.el('span', 'crew-mgmt-row-label', 'Chat ID'));
    const idEl = IBP.el('span', '', crew.telegram_group_id);
    idEl.style.cssText = 'font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--ink-700);';
    idRow.appendChild(idEl);
    card.appendChild(idRow);
  }

  const actions = IBP.el('div');
  actions.style.cssText = 'display:flex;gap:6px;margin-top:8px;';
  const editBtn = IBP.el('button', 'btn btn-outline btn-sm', connected ? 'Edit group' : 'Connect group');
  editBtn.style.flex = '1';
  editBtn.addEventListener('click', () => IBP.openCrewSetupForEdit(crew));
  actions.appendChild(editBtn);

  if (connected) {
    const testBtn = IBP.el('button', 'btn-icon');
    testBtn.title = 'Send test message';
    testBtn.innerHTML = '<i class="ti ti-send"></i>';
    testBtn.addEventListener('click', async () => {
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
  card.appendChild(actions);

  return card;
}
