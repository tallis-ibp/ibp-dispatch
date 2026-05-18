/* IBP Dispatch — Flags page */

const INTENT_OPTIONS = ['arrived', 'working', 'done', 'issue', 'leaving', 'at-pickup', 'material-delivered', 'loading', 'dumping', 'ignore'];

IBP.registerRoute('flags', async (main) => {
  const today = IBP.todayISO();

  const header = IBP.el('div', 'page-header');
  const left = IBP.el('div');
  left.appendChild(IBP.el('h1', 'page-title', 'Flags'));
  left.appendChild(IBP.el('div', 'page-meta', 'Unknown crew messages awaiting review.'));
  header.appendChild(left);
  main.appendChild(header);

  const filters = IBP.el('div', 'filter-row');
  const dateInput = IBP.el('input');
  dateInput.type = 'date';
  dateInput.value = today;
  const statusSel = IBP.el('select');
  statusSel.innerHTML = `
    <option value="open">Open only</option>
    <option value="all">All</option>
    <option value="resolved">Resolved only</option>
  `;
  filters.appendChild(dateInput);
  filters.appendChild(statusSel);
  main.appendChild(filters);

  const stats = IBP.el('div', 'stat-strip');
  stats.style.gridTemplateColumns = 'repeat(3, 1fr)';
  stats.innerHTML = `
    <div class="stat-card"><div class="stat-num" id="fl-total">—</div><div class="stat-label">Flags today</div></div>
    <div class="stat-card"><div class="stat-num" id="fl-open" style="color:var(--warning-700)">—</div><div class="stat-label">Open</div></div>
    <div class="stat-card"><div class="stat-num" id="fl-resolved" style="color:var(--success-700)">—</div><div class="stat-label">Resolved</div></div>
  `;
  main.appendChild(stats);

  const wrap = IBP.el('div');
  wrap.appendChild(IBP.spinner('Loading flags…'));
  main.appendChild(wrap);

  const load = async () => {
    wrap.innerHTML = '';
    wrap.appendChild(IBP.spinner('Loading flags…'));
    try {
      const flags = await IBP.fetchJson(`/api/flags?date=${dateInput.value}`);
      const open = flags.filter((f) => !f.resolved).length;
      const resolved = flags.filter((f) => f.resolved).length;
      document.getElementById('fl-total').textContent = IBP.roundNum(flags.length);
      document.getElementById('fl-open').textContent  = IBP.roundNum(open);
      document.getElementById('fl-resolved').textContent = IBP.roundNum(resolved);

      const filtered = flags.filter((f) => {
        if (statusSel.value === 'open')     return !f.resolved;
        if (statusSel.value === 'resolved') return f.resolved;
        return true;
      });
      wrap.innerHTML = '';
      if (!filtered.length) {
        wrap.appendChild(IBP.emptyState({
          icon: 'flag-off',
          title: 'No flags',
          sub: 'When the bot receives a message it doesn\'t understand, it lands here for review.',
        }));
        return;
      }
      for (const f of filtered) wrap.appendChild(buildFlagRow(f));
      IBP.updateFlagBadge(open);
    } catch (err) {
      wrap.innerHTML = '';
      wrap.appendChild(IBP.emptyState({
        icon: 'alert-triangle', title: 'Failed to load flags', sub: err.message,
      }));
      document.getElementById('fl-total').textContent = '0';
      document.getElementById('fl-open').textContent = '0';
      document.getElementById('fl-resolved').textContent = '0';
    }
  };

  dateInput.addEventListener('change', load);
  statusSel.addEventListener('change', load);
  load();
});

function buildFlagRow(f) {
  const card = IBP.el('div', `flag-card ${f.resolved ? 'resolved' : ''}`);
  card.addEventListener('click', () => openFlagDrawer(f.id));

  const row1 = IBP.el('div', 'flag-row1');
  row1.appendChild(IBP.el('span', 'flag-crew', f.displayName ?? f.crew_key ?? 'Unknown'));
  if (f.sender) row1.appendChild(IBP.el('span', '', `· ${f.sender}`));
  row1.appendChild(IBP.el('span', 'flag-time', IBP.formatDateTime(f.timestamp)));
  card.appendChild(row1);

  card.appendChild(IBP.el('div', 'flag-text', `"${f.text}"`));

  if (f.resolved) {
    card.appendChild(IBP.el('span', 'badge success', f.note ? `Resolved · ${f.note}` : 'Resolved'));
  }
  return card;
}

async function openFlagDrawer(id) {
  let detail;
  try { detail = await IBP.fetchJson(`/api/flags/${id}`); }
  catch (err) { IBP.toast(err.message, 'error'); return; }

  const body = IBP.el('div');
  body.appendChild(IBP.drawerRow('Crew', detail.displayName ?? detail.crewKey ?? 'Unknown'));
  body.appendChild(IBP.drawerRow('Sender', detail.sender || '—'));
  body.appendChild(IBP.drawerRow('When', IBP.formatDateTime(detail.timestamp)));
  body.appendChild(IBP.drawerRow('Chat ID', detail.chatId || '—'));
  body.appendChild(IBP.drawerRow('Message', `"${detail.text}"`, { column: true }));
  if (detail.jobContext) {
    body.appendChild(IBP.drawerRow('Related job',
      `${detail.jobContext.jobName} · #${detail.jobContext.jobNumber}`));
  }
  if (detail.resolved) {
    body.appendChild(IBP.drawerRow('Resolved', IBP.formatDateTime(detail.resolvedAt)));
    if (detail.note) body.appendChild(IBP.drawerRow('Note', detail.note, { column: true }));
  }

  // Teach intent dropdown
  if (!detail.resolved) {
    const teachWrap = IBP.el('div');
    teachWrap.style.marginTop = '12px';
    teachWrap.appendChild(IBP.el('div', 'input-label', 'Teach bot · this message means'));
    const select = IBP.el('select');
    for (const i of INTENT_OPTIONS) {
      const o = IBP.el('option', '', i);
      o.value = i;
      select.appendChild(o);
    }
    teachWrap.appendChild(select);
    body.appendChild(teachWrap);
    body._teachSelect = select;
  }

  const footer = IBP.el('div');
  footer.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  if (!detail.resolved) {
    const teachBtn = IBP.el('button', 'btn btn-primary btn-block', 'Teach & resolve');
    teachBtn.addEventListener('click', async () => {
      teachBtn.disabled = true;
      try {
        await IBP.fetchJson('/api/learned-phrases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phrase: detail.text, intent: body._teachSelect.value }),
        });
        await IBP.fetchJson(`/api/flags/${id}/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: `Taught as: ${body._teachSelect.value}` }),
        });
        IBP.toast('Taught and resolved', 'success');
        IBP.closeDrawer();
        IBP.render();
      } catch (err) {
        IBP.toast(err.message, 'error');
        teachBtn.disabled = false;
      }
    });
    footer.appendChild(teachBtn);

    const resolveBtn = IBP.el('button', 'btn btn-outline btn-block', 'Mark resolved (no teach)');
    resolveBtn.addEventListener('click', async () => {
      resolveBtn.disabled = true;
      try {
        await IBP.fetchJson(`/api/flags/${id}/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        IBP.toast('Resolved', 'success');
        IBP.closeDrawer();
        IBP.render();
      } catch (err) {
        IBP.toast(err.message, 'error');
        resolveBtn.disabled = false;
      }
    });
    footer.appendChild(resolveBtn);
  }

  IBP.openDrawer({
    title: 'Flag detail',
    subtitle: id,
    body,
    footer: footer.children.length ? footer : null,
  });
}
