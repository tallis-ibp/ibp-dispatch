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

  // State the drawer manages locally; sent on Save
  const state = {
    displayName: crew.display_name,
    language: crew.language || 'en',
    reliability: crew.reliability || '',
    strengths: IBP.safeJson(crew.strengths, []),
    cautions:  IBP.safeJson(crew.cautions,  []),
  };

  // Display name
  body.appendChild(buildInput('Display name', state.displayName, (v) => { state.displayName = v; }));

  // Language dropdown
  body.appendChild(buildSelect('Language', state.language, [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
    { value: 'pt', label: 'Português' },
  ], (v) => { state.language = v; }));

  // Reliability dropdown (with "unset")
  body.appendChild(buildSelect('Reliability', state.reliability, [
    { value: '',       label: '— Not set —' },
    { value: 'high',   label: 'High · trusted for critical work' },
    { value: 'medium', label: 'Medium · standard reliability' },
    { value: 'low',    label: 'Low · needs supervision or backup' },
  ], (v) => { state.reliability = v; }));

  // Skills chip input
  body.appendChild(buildChipInput('Skills', state.strengths,
    'What this crew is good at (used by the AI to assign jobs). Type and press Enter to add.',
    (next) => { state.strengths = next; }));

  // Cautions chip input
  body.appendChild(buildChipInput('Cautions', state.cautions,
    'Things the AI should avoid for this crew (e.g. "no gooseneck jobs"). Press Enter to add.',
    (next) => { state.cautions = next; }, 'danger'));

  // Telegram group section
  const tgRow = IBP.el('div', 'input-row');
  tgRow.appendChild(IBP.el('label', 'input-label', 'Telegram group'));
  const tgWrap = IBP.el('div');
  tgWrap.style.cssText = 'display:flex;gap:6px;align-items:center;';
  const tgVal = IBP.el('span');
  tgVal.style.cssText = 'flex:1;font-family:JetBrains Mono,ui-monospace,Menlo,monospace;font-size:12px;color:var(--ink-700);';
  tgVal.textContent = crew.telegram_group_id || 'Not set';
  const tgBtn = IBP.el('button', 'btn btn-outline btn-sm', crew.telegram_group_id ? 'Change' : 'Connect');
  tgBtn.addEventListener('click', () => {
    IBP.closeDrawer();
    IBP.openCrewSetupForEdit(crew);
  });
  tgWrap.appendChild(tgVal);
  tgWrap.appendChild(tgBtn);
  tgRow.appendChild(tgWrap);
  body.appendChild(tgRow);

  // Helper note
  const note = IBP.el('div');
  note.style.cssText = 'font-size:11px;color:var(--ink-500);margin-top:8px;padding:10px;background:var(--paper-alt);border:1px solid var(--border-soft);border-radius:6px;line-height:1.5;';
  note.textContent = 'Skills and reliability feed the AI scheduling agent every morning. Be specific (e.g. "gooseneck capable", "pool deck install") — vague tags hurt the assignment quality.';
  body.appendChild(note);

  // Footer: Save + Delete
  const footer = IBP.el('div');
  const saveBtn = IBP.el('button', 'btn btn-primary btn-block', 'Save changes');
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
      saveBtn.textContent = 'Save changes';
    }
  });
  footer.appendChild(saveBtn);

  const deleteBtn = IBP.el('button', 'btn btn-danger btn-block', 'Delete crew');
  deleteBtn.addEventListener('click', async () => {
    if (!confirm(`Delete "${crew.display_name}" permanently? This cannot be undone.`)) return;
    deleteBtn.disabled = true;
    deleteBtn.textContent = 'Deleting…';
    try {
      await IBP.fetchJson(`/api/crews/${crew.key}`, { method: 'DELETE' });
      IBP.toast(`Deleted ${crew.display_name}`, 'success');
      IBP.closeDrawer();
      IBP.render();
    } catch (err) {
      IBP.toast(err.message || 'Delete failed', 'error');
      deleteBtn.disabled = false;
      deleteBtn.textContent = 'Delete crew';
    }
  });
  footer.appendChild(deleteBtn);

  IBP.openDrawer({
    title: crew.display_name,
    subtitle: crew.key,
    body,
    footer,
  });
}

// ─── Drawer form helpers ───────────────────────────────────────
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

  const renderChips = () => {
    // Clear all chip children but keep the input field
    [...container.querySelectorAll('.chip')].forEach((c) => c.remove());
    const inputField = container.querySelector('.chip-input-field');
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
  };

  const inputField = IBP.el('input', 'chip-input-field');
  inputField.type = 'text';
  inputField.placeholder = chips.length ? '' : 'Type and press Enter…';
  inputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const v = inputField.value.trim().replace(/,$/, '');
      if (v && !chips.includes(v)) {
        chips.push(v);
        inputField.value = '';
        inputField.placeholder = '';
        onChange(chips);
        renderChips();
      }
    } else if (e.key === 'Backspace' && !inputField.value && chips.length) {
      chips.pop();
      onChange(chips);
      renderChips();
      inputField.placeholder = chips.length ? '' : 'Type and press Enter…';
    }
  });
  container.appendChild(inputField);
  renderChips();
  wrap.appendChild(container);

  if (help) wrap.appendChild(IBP.el('div', 'chip-help', help));
  return wrap;
}
