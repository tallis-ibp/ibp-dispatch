/* IBP Dispatch — Settings page */

IBP.registerRoute('settings', async (main) => {
  const header = IBP.el('div', 'page-header');
  const left = IBP.el('div');
  left.appendChild(IBP.el('h1', 'page-title', 'Settings'));
  left.appendChild(IBP.el('div', 'page-meta', 'Integration health and bot training.'));
  header.appendChild(left);
  main.appendChild(header);

  const integrationsWrap = IBP.el('div', 'card-grid-2');
  integrationsWrap.appendChild(IBP.spinner('Checking integrations…'));
  main.appendChild(integrationsWrap);

  // ─── Telegram setup / reset tools ─────────────────────────
  const toolsTitle = IBP.el('h2');
  toolsTitle.style.cssText = 'font-size:14px;font-weight:500;margin:28px 0 10px;color:var(--ink-900);text-transform:uppercase;letter-spacing:0.06em;';
  toolsTitle.textContent = 'Telegram setup';
  main.appendChild(toolsTitle);
  main.appendChild(buildToolsPanel());

  // Learned phrases section
  const phrasesTitle = IBP.el('h2');
  phrasesTitle.style.cssText = 'font-family:Fraunces,Georgia,serif;font-size:18px;font-weight:500;margin:32px 0 12px;color:var(--ink-900);';
  phrasesTitle.textContent = 'Learned phrases';
  main.appendChild(phrasesTitle);

  const phrasesWrap = IBP.el('div');
  phrasesWrap.appendChild(IBP.spinner('Loading…'));
  main.appendChild(phrasesWrap);

  // Load integrations
  try {
    const health = await IBP.fetchJson('/api/health/integrations');
    integrationsWrap.innerHTML = '';
    integrationsWrap.appendChild(buildIntegrationCard('Telegram', 'brand-telegram', health.telegram, () => {
      // Sync now action — just re-render
      IBP.render();
    }));
    integrationsWrap.appendChild(buildIntegrationCard('Monday.com', 'square-letter-m', health.monday, async () => {
      try {
        await IBP.fetchJson('/api/sync', { method: 'POST' });
        IBP.toast('Monday sync started', 'success');
      } catch (err) {
        IBP.toast(err.message, 'error');
      }
    }, 'Sync now'));
    integrationsWrap.appendChild(buildIntegrationCard('Anthropic', 'brain', health.anthropic));
    integrationsWrap.appendChild(buildIntegrationCard('Supabase', 'database', health.supabase));
  } catch (err) {
    integrationsWrap.innerHTML = '';
    integrationsWrap.appendChild(IBP.emptyState({
      icon: 'alert-triangle', title: 'Failed to load integration health', sub: err.message,
    }));
  }

  // Load learned phrases
  try {
    const phrases = await IBP.fetchJson('/api/learned-phrases');
    phrasesWrap.innerHTML = '';
    phrasesWrap.appendChild(buildAddPhraseForm(() => IBP.render()));
    if (!phrases.length) {
      phrasesWrap.appendChild(IBP.emptyState({
        icon: 'school-off',
        title: 'No phrases taught yet',
        sub: 'Teach the bot from any flag — or add a phrase above.',
      }));
      return;
    }
    for (const p of phrases) phrasesWrap.appendChild(buildPhraseRow(p));
  } catch (err) {
    phrasesWrap.innerHTML = '';
    phrasesWrap.appendChild(IBP.emptyState({
      icon: 'alert-triangle', title: 'Failed to load phrases', sub: err.message,
    }));
  }
});

function buildToolsPanel() {
  const wrap = IBP.el('div');
  wrap.style.cssText = 'background:var(--paper);border:1px solid var(--border-soft);border-radius:8px;padding:14px 16px;display:flex;flex-direction:column;gap:14px;';

  // ─── Cleanup unused crews ──────────────────
  const cleanupBlock = IBP.el('div');
  cleanupBlock.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:12px;';
  const cleanupInfo = IBP.el('div');
  cleanupInfo.style.cssText = 'flex:1;min-width:0;';
  cleanupInfo.innerHTML = `
    <div style="font-size:13px;font-weight:500;color:var(--ink-900);margin-bottom:2px;">Delete crews not yet configured for AI</div>
    <div style="font-size:12px;color:var(--ink-500);line-height:1.5;">Removes every crew that has <strong>no reliability set and no Telegram link</strong>. Use this to clean up the default seed list and only keep the crews you actually dispatch to.</div>
  `;
  const cleanupBtn = IBP.el('button', 'btn btn-danger');
  cleanupBtn.innerHTML = '<i class="ti ti-broom"></i><span>Cleanup</span>';
  cleanupBtn.addEventListener('click', async () => {
    let crews;
    try { crews = await IBP.fetchJson('/api/crews'); }
    catch (err) { IBP.toast(err.message, 'error'); return; }
    const candidates = crews.filter((c) => !c.reliability && !c.telegram_group_id);
    if (!candidates.length) {
      IBP.toast('No crews match the cleanup criteria', 'success');
      return;
    }
    const ok = await IBP.confirm({
      title: `Delete ${candidates.length} crew${candidates.length === 1 ? '' : 's'}?`,
      message: candidates.map((c) => c.display_name).slice(0, 6).join(', ') + (candidates.length > 6 ? `, and ${candidates.length - 6} more…` : ''),
      confirmLabel: 'Delete all',
      cancelLabel: 'Keep',
      danger: true,
    });
    if (!ok) return;
    cleanupBtn.disabled = true;
    cleanupBtn.innerHTML = '<span class="spinner"></span><span>Deleting…</span>';
    let n = 0;
    for (const c of candidates) {
      try { await IBP.fetchJson(`/api/crews/${c.key}`, { method: 'DELETE' }); n++; }
      catch { /* keep going */ }
    }
    IBP.toast(`Deleted ${IBP.roundNum(n)} crew${n === 1 ? '' : 's'}`, 'success');
    cleanupBtn.disabled = false;
    cleanupBtn.innerHTML = '<i class="ti ti-broom"></i><span>Cleanup</span>';
  });
  cleanupBlock.appendChild(cleanupInfo);
  cleanupBlock.appendChild(cleanupBtn);
  wrap.appendChild(cleanupBlock);

  const div0 = IBP.el('div');
  div0.style.cssText = 'border-top:1px solid var(--border-soft);margin:2px 0;';
  wrap.appendChild(div0);

  // ─── Webhook setup ─────────────────────
  const webhookBlock = IBP.el('div');
  webhookBlock.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:12px;';
  const webhookInfo = IBP.el('div');
  webhookInfo.style.cssText = 'flex:1;min-width:0;';
  webhookInfo.innerHTML = `
    <div style="font-size:13px;font-weight:500;color:var(--ink-900);margin-bottom:2px;">Re-register Telegram webhook</div>
    <div style="font-size:12px;color:var(--ink-500);line-height:1.5;">Tells Telegram to send us <code style="font-family:JetBrains Mono,monospace;font-size:11px;background:var(--paper-alt);padding:0 4px;border-radius:3px;">my_chat_member</code> events so the bot auto-detects when added to a group. Safe to click anytime — idempotent.</div>
  `;
  const webhookBtn = IBP.el('button', 'btn btn-outline');
  webhookBtn.innerHTML = '<i class="ti ti-webhook"></i><span>Re-register</span>';
  webhookBtn.addEventListener('click', async () => {
    webhookBtn.disabled = true;
    webhookBtn.innerHTML = '<span class="spinner"></span><span>Working…</span>';
    try {
      const result = await IBP.fetchJson('/api/admin/setup-webhook', { method: 'POST' });
      const allowed = (result.allowedUpdates || []).join(', ');
      IBP.toast(`Webhook OK · allowed: ${allowed}`, 'success');
    } catch (err) {
      IBP.toast(err.message || 'Setup failed', 'error');
    } finally {
      webhookBtn.disabled = false;
      webhookBtn.innerHTML = '<i class="ti ti-webhook"></i><span>Re-register</span>';
    }
  });
  webhookBlock.appendChild(webhookInfo);
  webhookBlock.appendChild(webhookBtn);
  wrap.appendChild(webhookBlock);

  // ─── Divider ───────────────────────────
  const div = IBP.el('div');
  div.style.cssText = 'border-top:1px solid var(--border-soft);margin:2px 0;';
  wrap.appendChild(div);

  // ─── Wipe test data ────────────────────
  const wipeBlock = IBP.el('div');
  wipeBlock.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:12px;';
  const wipeInfo = IBP.el('div');
  wipeInfo.style.cssText = 'flex:1;min-width:0;';
  wipeInfo.innerHTML = `
    <div style="font-size:13px;font-weight:500;color:var(--ink-900);margin-bottom:2px;">Reset test data</div>
    <div style="font-size:12px;color:var(--ink-500);line-height:1.5;">Wipes <strong>photos, flags, brief_jobs, briefs, schedule_proposals</strong> and unlinks fake Telegram IDs. Keeps your Admin DM link, all crew profiles, skills, and Monday jobs.</div>
  `;
  const wipeBtn = IBP.el('button', 'btn btn-danger');
  wipeBtn.innerHTML = '<i class="ti ti-trash"></i><span>Wipe</span>';
  wipeBtn.addEventListener('click', async () => {
    const ok = await IBP.confirm({
      title: 'Wipe operational test data?',
      message: 'photos · flags · brief_jobs · briefs · schedule_proposals will be cleared. Crew profiles and Monday jobs are kept. Cannot be undone.',
      confirmLabel: 'Wipe',
      cancelLabel: 'Keep',
      danger: true,
    });
    if (!ok) return;
    wipeBtn.disabled = true;
    wipeBtn.innerHTML = '<span class="spinner"></span><span>Wiping…</span>';
    try {
      const result = await IBP.fetchJson('/api/admin/reset-test-data', { method: 'POST' });
      const w = result.wiped || {};
      const total = Object.values(w).reduce((n, x) => n + (typeof x === 'number' ? x : 0), 0);
      IBP.toast(`Reset complete — ${IBP.roundNum(total)} rows wiped`, 'success');
    } catch (err) {
      IBP.toast(err.message || 'Reset failed', 'error');
    } finally {
      wipeBtn.disabled = false;
      wipeBtn.innerHTML = '<i class="ti ti-trash"></i><span>Wipe</span>';
    }
  });
  wipeBlock.appendChild(wipeInfo);
  wipeBlock.appendChild(wipeBtn);
  wrap.appendChild(wipeBlock);

  return wrap;
}

function buildIntegrationCard(name, icon, status, action, actionLabel = 'Refresh') {
  const card = IBP.el('div', 'integration-card');
  const head = IBP.el('div', 'integration-head');
  head.innerHTML = `<i class="ti ti-${icon}" style="font-size:18px;color:var(--ink-700)"></i>`;
  head.appendChild(IBP.el('span', 'integration-name', name));
  head.appendChild(IBP.el('span',
    `badge ${status.ok ? 'success' : 'danger'}`,
    status.ok ? 'OK' : 'Issue'));
  card.appendChild(head);

  const detail = IBP.el('div', 'integration-detail');
  for (const [k, v] of Object.entries(status.detail ?? {})) {
    if (v == null) continue;
    let display;
    if (typeof v === 'object') {
      display = Object.entries(v).map(([kk, vv]) => `${kk}: ${IBP.roundNum(vv)}`).join(' · ');
    } else {
      display = String(v);
    }
    detail.appendChild(IBP.el('div', '', `${k.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${display}`));
  }
  card.appendChild(detail);

  if (action) {
    const btn = IBP.el('button', 'btn btn-outline btn-sm', actionLabel);
    btn.addEventListener('click', action);
    card.appendChild(btn);
  }
  return card;
}

function buildAddPhraseForm(onAdd) {
  const wrap = IBP.el('div');
  wrap.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;align-items:flex-end;';

  const phraseWrap = IBP.el('div', 'input-row');
  phraseWrap.style.flex = '1';
  phraseWrap.style.marginBottom = '0';
  phraseWrap.appendChild(IBP.el('label', 'input-label', 'Phrase'));
  const phraseInput = IBP.el('input');
  phraseInput.type = 'text';
  phraseInput.placeholder = 'e.g. cheguei na obra';
  phraseWrap.appendChild(phraseInput);

  const intentWrap = IBP.el('div', 'input-row');
  intentWrap.style.marginBottom = '0';
  intentWrap.appendChild(IBP.el('label', 'input-label', 'Intent'));
  const intentSelect = IBP.el('select');
  ['arrived','working','done','issue','leaving','at-pickup','material-delivered','loading','dumping','ignore'].forEach((i) => {
    const o = IBP.el('option', '', i);
    o.value = i;
    intentSelect.appendChild(o);
  });
  intentWrap.appendChild(intentSelect);

  const addBtn = IBP.el('button', 'btn btn-primary', 'Add');
  addBtn.addEventListener('click', async () => {
    if (!phraseInput.value.trim()) return;
    addBtn.disabled = true;
    try {
      await IBP.fetchJson('/api/learned-phrases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrase: phraseInput.value, intent: intentSelect.value }),
      });
      IBP.toast('Phrase added', 'success');
      onAdd();
    } catch (err) {
      IBP.toast(err.message, 'error');
      addBtn.disabled = false;
    }
  });

  wrap.appendChild(phraseWrap);
  wrap.appendChild(intentWrap);
  wrap.appendChild(addBtn);
  return wrap;
}

function buildPhraseRow(p) {
  const row = IBP.el('div', 'card-row');
  const left = IBP.el('div');
  left.style.cssText = 'display:flex;align-items:center;gap:10px;';
  const phrase = IBP.el('span', '', `"${p.phrase}"`);
  phrase.style.fontSize = '13px';
  left.appendChild(phrase);
  left.appendChild(IBP.el('span', 'badge info', p.intent));
  row.appendChild(left);

  const right = IBP.el('div');
  right.style.cssText = 'display:flex;gap:6px;align-items:center;';
  const learnedAt = IBP.el('span', '', IBP.relativeTime(p.learnedAt));
  learnedAt.style.cssText = 'font-size:11px;color:var(--ink-400);';
  right.appendChild(learnedAt);
  const delBtn = IBP.el('button', 'btn-icon');
  delBtn.innerHTML = '<i class="ti ti-trash"></i>';
  delBtn.title = 'Delete';
  delBtn.addEventListener('click', async () => {
    if (!confirm(`Delete "${p.phrase}"?`)) return;
    try {
      await IBP.fetchJson(`/api/learned-phrases/${p.id}`, { method: 'DELETE' });
      IBP.toast('Phrase deleted', 'success');
      IBP.render();
    } catch (err) {
      IBP.toast(err.message, 'error');
    }
  });
  right.appendChild(delBtn);
  row.appendChild(right);
  return row;
}
