/* IBP Dispatch — Crews page v3 (richer) */

IBP.registerRoute('crews', async (main) => {
  const header = IBP.el('div', 'page-header');
  const left = IBP.el('div');
  left.appendChild(IBP.el('h1', 'page-title', 'Crews'));
  left.appendChild(IBP.el('div', 'page-meta', 'Connect each crew\'s Telegram group, edit their AI profile, and send test messages.'));
  header.appendChild(left);

  const addBtn = IBP.el('button', 'btn btn-primary');
  addBtn.innerHTML = '<i class="ti ti-plus"></i><span>Add crew</span>';
  addBtn.addEventListener('click', () => IBP.openAddCrewModal());
  header.appendChild(addBtn);
  main.appendChild(header);

  // Skeleton placeholder
  const wrap = IBP.el('div');
  const skeletonGrid = IBP.el('div', 'card-grid-3');
  for (let i = 0; i < 6; i++) skeletonGrid.appendChild(IBP.skeletonCard());
  wrap.appendChild(skeletonGrid);
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

  // Stats
  const connectedCount = crews.filter((c) => c.telegram_group_id).length;
  const highRel = crews.filter((c) => c.reliability === 'high').length;
  const stats = IBP.el('div', 'stat-strip');
  stats.style.gridTemplateColumns = 'repeat(4, 1fr)';
  stats.innerHTML = `
    <div class="stat-card"><div class="stat-num">${IBP.roundNum(crews.length)}</div><div class="stat-label">Total crews</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--success-700)">${IBP.roundNum(connectedCount)}</div><div class="stat-label">Connected to Telegram</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--ink-400)">${IBP.roundNum(crews.length - connectedCount)}</div><div class="stat-label">Awaiting setup</div></div>
    <div class="stat-card"><div class="stat-num" style="color:var(--info-700)">${IBP.roundNum(highRel)}</div><div class="stat-label">High reliability</div></div>
  `;
  wrap.appendChild(stats);

  const grid = IBP.el('div', 'card-grid-3');
  for (const crew of sorted) {
    grid.appendChild(buildCrewCard(crew));
  }
  wrap.appendChild(grid);
});

function buildCrewCard(crew) {
  const connected = !!crew.telegram_group_id;
  const card = IBP.el('div', `crew-mgmt-card ${connected ? 'connected' : ''}`);
  card.addEventListener('click', (e) => {
    if (e.target.closest('button, a')) return;
    openCrewEditDrawer(crew);
  });

  // ─── Head: avatar + name + status pill ───────────────
  const head = IBP.el('div', 'crew-mgmt-head');
  const identity = IBP.el('div', 'crew-mgmt-identity');
  identity.appendChild(IBP.avatar(crew.display_name, 'md'));
  const nameWrap = IBP.el('div', 'crew-mgmt-name-wrap');
  nameWrap.appendChild(IBP.el('div', 'crew-mgmt-name', crew.display_name));

  // Tagline = language · reliability (replaces the dev key)
  const tagline = IBP.el('div', 'crew-mgmt-tagline');
  tagline.appendChild(IBP.el('span', '', (crew.language || 'en').toUpperCase()));
  if (crew.reliability) {
    tagline.appendChild(IBP.el('span', 'dot-sep'));
    tagline.appendChild(IBP.el('span', '', `${crew.reliability} reliability`));
  }
  nameWrap.appendChild(tagline);

  identity.appendChild(nameWrap);
  head.appendChild(identity);

  const status = IBP.el('div', `tg-status ${connected ? '' : 'disconnected'}`);
  status.innerHTML = `<span class="dot"></span><span>${connected ? 'Live' : 'Not set'}</span>`;
  head.appendChild(status);
  card.appendChild(head);

  // ─── Skills preview (max 3 chips + "+N more") ─────────
  const strengths = IBP.safeJson(crew.strengths, []);
  const skillsWrap = IBP.el('div', 'crew-mgmt-skills');
  if (strengths.length === 0) {
    skillsWrap.appendChild(IBP.el('span', 'crew-skill-empty', 'No skills set'));
  } else {
    const visible = strengths.slice(0, 3);
    for (const s of visible) skillsWrap.appendChild(IBP.el('span', 'crew-skill-mini', s));
    if (strengths.length > 3) {
      skillsWrap.appendChild(IBP.el('span', 'crew-skill-mini', `+${strengths.length - 3} more`));
    }
  }
  card.appendChild(skillsWrap);

  // ─── Footer: chat ID + icon actions ───────────────────
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
  editBtn.title = 'Edit crew profile';
  editBtn.innerHTML = '<i class="ti ti-edit"></i>';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openCrewEditDrawer(crew);
  });
  actions.appendChild(editBtn);

  footer.appendChild(actions);
  card.appendChild(footer);

  return card;
}

// ─── Profile editor drawer ───────────────────────────────────────
async function openCrewEditDrawer(crew) {
  const state = {
    displayName: crew.display_name,
    language: crew.language || 'en',
    reliability: crew.reliability || '',
    strengths: IBP.safeJson(crew.strengths, []),
    cautions:  IBP.safeJson(crew.cautions,  []),
  };

  // ─── Profile header (avatar + name + status) ─────────
  const profileHeader = IBP.el('div', 'drawer-profile-header');
  profileHeader.appendChild(IBP.avatar(crew.display_name, 'lg'));
  const profileInfo = IBP.el('div', 'drawer-profile-info');
  profileInfo.appendChild(IBP.el('div', 'drawer-profile-name', crew.display_name));
  profileInfo.appendChild(IBP.el('div', 'drawer-profile-key', crew.key));
  profileHeader.appendChild(profileInfo);
  const headerStatus = IBP.el('div', `tg-status ${crew.telegram_group_id ? '' : 'disconnected'}`);
  headerStatus.innerHTML = `<span class="dot"></span><span>${crew.telegram_group_id ? 'Live' : 'Not set'}</span>`;
  profileHeader.appendChild(headerStatus);

  // ─── Body: stacked sections ──────────────────────────
  const body = IBP.el('div');

  // Section: Profile
  const profileSection = IBP.el('div', 'drawer-section');
  profileSection.appendChild(IBP.el('div', 'drawer-section-label', 'Profile'));
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

  // Section: AI brain
  const aiSection = IBP.el('div', 'drawer-section');
  aiSection.appendChild(IBP.el('div', 'drawer-section-label', 'AI scheduling profile'));
  aiSection.appendChild(buildChipInput('Skills', state.strengths,
    'What this crew is good at. Press Enter to add. The AI uses these every morning to assign jobs.',
    (next) => { state.strengths = next; }));
  aiSection.appendChild(buildChipInput('Cautions', state.cautions,
    'Things the AI should avoid for this crew (e.g. "no gooseneck jobs", "no large slab work").',
    (next) => { state.cautions = next; }, 'danger'));
  body.appendChild(aiSection);

  // Section: Telegram
  const tgSection = IBP.el('div', 'drawer-section');
  tgSection.appendChild(IBP.el('div', 'drawer-section-label', 'Telegram dispatch'));
  const tgInputRow = IBP.el('div', 'input-row');
  tgInputRow.appendChild(IBP.el('label', 'input-label', 'Group chat ID'));
  const tgWrap = IBP.el('div');
  tgWrap.style.cssText = 'display:flex;gap:6px;align-items:stretch;';
  const tgInput = IBP.el('input');
  tgInput.type = 'text';
  tgInput.readOnly = true;
  tgInput.value = crew.telegram_group_id || 'Not configured';
  tgInput.style.fontFamily = 'JetBrains Mono, ui-monospace, Menlo, monospace';
  tgInput.style.fontSize = '12px';
  tgInput.style.background = 'var(--paper-alt)';
  tgInput.style.cursor = 'default';
  const tgChangeBtn = IBP.el('button', 'btn btn-outline');
  tgChangeBtn.innerHTML = crew.telegram_group_id
    ? '<i class="ti ti-arrows-right-left"></i><span>Change</span>'
    : '<i class="ti ti-link"></i><span>Connect</span>';
  tgChangeBtn.addEventListener('click', () => {
    IBP.closeDrawer();
    IBP.openCrewSetupForEdit(crew);
  });
  tgWrap.appendChild(tgInput);
  tgWrap.appendChild(tgChangeBtn);
  tgInputRow.appendChild(tgWrap);
  tgSection.appendChild(tgInputRow);

  if (crew.telegram_group_id) {
    const testBtn = IBP.el('button', 'btn btn-outline btn-sm');
    testBtn.innerHTML = '<i class="ti ti-send"></i><span>Send test message</span>';
    testBtn.style.marginTop = '4px';
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      const original = testBtn.innerHTML;
      testBtn.innerHTML = '<span class="spinner"></span><span>Sending…</span>';
      try {
        await IBP.fetchJson(`/api/crews/${crew.key}/test`, { method: 'POST' });
        IBP.toast(`Test message sent to ${crew.display_name}`, 'success');
      } catch (err) { IBP.toast(err.message, 'error'); }
      finally { testBtn.disabled = false; testBtn.innerHTML = original; }
    });
    tgSection.appendChild(testBtn);
  }
  body.appendChild(tgSection);

  // Section: Danger zone
  const dangerSection = IBP.el('div', 'drawer-section danger');
  dangerSection.appendChild(IBP.el('div', 'drawer-section-label', 'Danger zone'));
  const deleteBtn = IBP.el('button', 'btn btn-danger');
  deleteBtn.innerHTML = '<i class="ti ti-trash"></i><span>Delete crew permanently</span>';
  deleteBtn.addEventListener('click', async () => {
    const ok = await IBP.confirm({
      title: `Delete ${crew.display_name}?`,
      message: `This cannot be undone. The crew, its skills, and Telegram connection will be removed.`,
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
  const dangerHelp = IBP.el('div');
  dangerHelp.style.cssText = 'font-size:11px;color:var(--ink-500);margin-bottom:10px;line-height:1.5;';
  dangerHelp.textContent = 'Deleting removes this crew from the AI scheduler and the dispatch dashboard. Past briefs and photos are preserved.';
  dangerSection.appendChild(dangerHelp);
  dangerSection.appendChild(deleteBtn);
  body.appendChild(dangerSection);

  // ─── Sticky save footer ──────────────────────────────
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
      IBP.toast('Crew updated', 'success');
      IBP.closeDrawer();
      IBP.render();
    } catch (err) {
      IBP.toast(err.message || 'Save failed', 'error');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="ti ti-check"></i><span>Save changes</span>';
    }
  });
  footer.appendChild(saveBtn);

  // Compose: header + sectioned body
  const bodyWithHeader = IBP.el('div');
  bodyWithHeader.appendChild(profileHeader);
  bodyWithHeader.appendChild(body);

  IBP.openDrawer({
    title: null, // hide default drawer header (we use our own profile header)
    body: bodyWithHeader,
    footer,
  });
}

// ─── Form helpers (reused) ───────────────────────────────────────
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
