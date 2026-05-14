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
