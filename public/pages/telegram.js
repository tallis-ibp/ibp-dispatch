/* IBP Dispatch — Telegram page (testing console + chat registry) */

let _tgFeedTimer = null;
let _tgChatsCache = [];
let _tgCrewsCache = [];

IBP.registerRoute('telegram', async (main) => {
  // Stop any previous polling timer when re-rendering
  if (_tgFeedTimer) { clearInterval(_tgFeedTimer); _tgFeedTimer = null; }

  const header = IBP.el('div', 'page-header');
  const left = IBP.el('div');
  left.appendChild(IBP.el('h1', 'page-title', 'Telegram'));
  left.appendChild(IBP.el('div', 'page-meta',
    'Auto-detected groups, live activity feed, and quick-test panel for end-to-end testing.'));
  header.appendChild(left);
  const refreshBtn = IBP.el('button', 'btn btn-outline');
  refreshBtn.innerHTML = '<i class="ti ti-refresh"></i><span>Refresh</span>';
  refreshBtn.addEventListener('click', () => IBP.render());
  header.appendChild(refreshBtn);
  main.appendChild(header);

  // Status bar (live)
  const statusBar = IBP.el('div', 'tg-status-bar');
  statusBar.id = 'tg-status-bar';
  statusBar.innerHTML = '<span class="live-dot"></span><span>Loading…</span>';
  main.appendChild(statusBar);

  // Sections: Available chats, Linked chats, Activity feed, Quick test
  const availableSection = buildSection('Available to link', 'tg-available');
  const linkedSection    = buildSection('Linked to crews',  'tg-linked');
  const feedSection      = buildSection('Live activity',    'tg-feed-wrap');
  const testSection      = buildSection('Quick test',       'tg-test-wrap');
  main.appendChild(availableSection);
  main.appendChild(linkedSection);
  main.appendChild(feedSection);
  main.appendChild(testSection);

  // Initial load
  await Promise.all([
    refreshStatus(),
    refreshChats(),
    refreshFeed(),
  ]);

  // Auto-poll feed every 5s
  _tgFeedTimer = setInterval(() => {
    if (IBP.currentRoute !== 'telegram') {
      clearInterval(_tgFeedTimer);
      _tgFeedTimer = null;
      return;
    }
    refreshFeed();
    refreshStatus();
  }, 5000);
});

function buildSection(title, bodyId) {
  const section = IBP.el('div', 'tg-section');
  const head = IBP.el('div', 'tg-section-head');
  const titleWrap = IBP.el('div', 'tg-section-title');
  titleWrap.appendChild(IBP.el('span', '', title));
  const count = IBP.el('span', 'count', '');
  count.id = `${bodyId}-count`;
  titleWrap.appendChild(count);
  head.appendChild(titleWrap);
  section.appendChild(head);
  const body = IBP.el('div');
  body.id = bodyId;
  section.appendChild(body);
  return section;
}

async function refreshStatus() {
  const bar = document.getElementById('tg-status-bar');
  if (!bar) return;
  try {
    const health = await IBP.fetchJson('/api/health/integrations');
    const tg = health.telegram || {};
    const ok = tg.ok === true;
    bar.classList.toggle('error', !ok);
    const detail = tg.detail || {};
    bar.innerHTML = '';
    const dot = IBP.el('span', 'live-dot');
    bar.appendChild(dot);
    bar.appendChild(IBP.el('span', 'meta-item', ok ? 'Bot online' : 'Bot offline'));
    bar.appendChild(IBP.el('span', 'meta-sep', '·'));
    const webhookOk = !!detail.webhookUrl;
    bar.appendChild(IBP.el('span', 'meta-item', `webhook ${webhookOk ? 'set' : 'not set'}`));
    bar.appendChild(IBP.el('span', 'meta-sep', '·'));
    bar.appendChild(IBP.el('span', 'meta-item',
      `${IBP.roundNum(detail.pendingUpdateCount ?? 0)} pending`));
    bar.appendChild(IBP.el('span', 'meta-sep', '·'));
    const last = IBP.el('span', 'meta-item');
    last.textContent = 'updated ' + new Date().toLocaleTimeString();
    bar.appendChild(last);
  } catch (err) {
    bar.innerHTML = `<span class="live-dot"></span><span>Status failed: ${IBP.escHtml(err.message)}</span>`;
    bar.classList.add('error');
  }
}

async function refreshChats() {
  try {
    const [chats, crews] = await Promise.all([
      IBP.fetchJson('/api/telegram/chats'),
      IBP.fetchJson('/api/crews'),
    ]);
    _tgChatsCache = chats;
    _tgCrewsCache = crews;
    renderAvailable(chats, crews);
    renderLinked(chats, crews);
    renderTestPanel(chats);
  } catch (err) {
    IBP.toast(err.message || 'Failed to load chats', 'error');
  }
}

function renderAvailable(chats, crews) {
  const body = document.getElementById('tg-available');
  if (!body) return;
  const available = chats.filter((c) => !c.linkedCrewKey && c.status === 'active');
  document.getElementById('tg-available-count').textContent = IBP.roundNum(available.length);
  body.innerHTML = '';
  if (!available.length) {
    body.innerHTML = `
      <div class="tg-feed-empty">
        No groups waiting to be linked.<br>
        Add <strong>@IBP_DispatchBot</strong> to a Telegram group on your phone — it will appear here automatically within seconds.
      </div>
    `;
    return;
  }
  for (const c of available) body.appendChild(buildChatRow(c, crews, false));
}

function renderLinked(chats, crews) {
  const body = document.getElementById('tg-linked');
  if (!body) return;
  const linked = chats.filter((c) => !!c.linkedCrewKey);
  document.getElementById('tg-linked-count').textContent = IBP.roundNum(linked.length);
  body.innerHTML = '';
  if (!linked.length) {
    body.innerHTML = `<div class="tg-feed-empty">No chats are linked to crews yet.</div>`;
    return;
  }
  for (const c of linked) body.appendChild(buildChatRow(c, crews, true));
}

function buildChatRow(chat, crews, isLinked) {
  const row = IBP.el('div', 'tg-chat-row');

  // Icon
  const icon = IBP.el('div', `tg-chat-icon ${chat.type === 'private' ? 'private' : ''}`);
  icon.innerHTML = chat.type === 'private'
    ? '<i class="ti ti-user"></i>'
    : '<i class="ti ti-users"></i>';
  row.appendChild(icon);

  // Info
  const info = IBP.el('div', 'tg-chat-info');
  const title = IBP.el('div', 'tg-chat-title',
    chat.title || (chat.type === 'private' ? `Private chat` : `Group ${chat.chatId}`));
  info.appendChild(title);
  const meta = IBP.el('div', 'tg-chat-meta');
  meta.innerHTML = `
    <code>${IBP.escHtml(chat.chatId)}</code>
    <span class="dot-sep"></span>
    <span>${chat.type}</span>
    <span class="dot-sep"></span>
    <span>seen ${IBP.relativeTime(chat.lastSeen ?? chat.joinedAt)}</span>
    ${isLinked && chat.linkedCrewName ? `
      <span class="dot-sep"></span>
      <span style="color:var(--success-700);font-weight:500">→ ${IBP.escHtml(chat.linkedCrewName)}</span>
    ` : ''}
    ${chat.status !== 'active' ? `
      <span class="dot-sep"></span>
      <span style="color:var(--danger-700)">bot ${IBP.escHtml(chat.status)}</span>
    ` : ''}
  `;
  info.appendChild(meta);
  row.appendChild(info);

  // Actions
  const actions = IBP.el('div', 'tg-chat-actions');
  if (isLinked) {
    const sendBtn = IBP.el('button', 'btn-icon');
    sendBtn.title = 'Send test message';
    sendBtn.innerHTML = '<i class="ti ti-send"></i>';
    sendBtn.addEventListener('click', () => quickSendPrompt(chat));
    actions.appendChild(sendBtn);
    const unlinkBtn = IBP.el('button', 'btn-icon');
    unlinkBtn.title = 'Unlink from crew';
    unlinkBtn.innerHTML = '<i class="ti ti-unlink"></i>';
    unlinkBtn.addEventListener('click', async () => {
      const ok = await IBP.confirm({
        title: `Unlink "${chat.linkedCrewName || chat.title}"?`,
        message: 'The crew will no longer receive briefs in this chat.',
        confirmLabel: 'Unlink',
        danger: true,
      });
      if (!ok) return;
      try {
        await IBP.fetchJson(`/api/telegram/chats/${encodeURIComponent(chat.chatId)}/unlink`, { method: 'POST' });
        IBP.toast('Unlinked', 'success');
        await refreshChats();
      } catch (err) { IBP.toast(err.message, 'error'); }
    });
    actions.appendChild(unlinkBtn);
  } else {
    // Link dropdown — open a small modal listing crews without telegram
    const linkBtn = IBP.el('button', 'btn btn-primary btn-sm');
    linkBtn.innerHTML = '<i class="ti ti-link"></i><span>Link to crew</span>';
    linkBtn.addEventListener('click', () => openLinkChooser(chat, crews));
    actions.appendChild(linkBtn);
  }
  row.appendChild(actions);
  return row;
}

function openLinkChooser(chat, crews) {
  // Unlinked crews first, but also let user pick a crew already linked to
  // another chat (we'll unlink the previous one server-side).
  const sortedCrews = [...crews].sort((a, b) => {
    const aFree = !a.telegram_group_id;
    const bFree = !b.telegram_group_id;
    if (aFree !== bFree) return aFree ? -1 : 1;
    return a.display_name.localeCompare(b.display_name);
  });

  const body = IBP.el('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:4px;max-height:50vh;overflow-y:auto;';
  for (const crew of sortedCrews) {
    const row = IBP.el('button', 'btn btn-outline');
    row.style.cssText = 'justify-content:flex-start;text-align:left;padding:10px 12px;';
    const taken = !!crew.telegram_group_id;
    row.innerHTML = `
      <span style="display:flex;align-items:center;gap:10px;flex:1;">
        <span style="font-weight:500;color:var(--ink-900);">${IBP.escHtml(crew.display_name)}</span>
        ${taken ? '<span class="badge warning" style="font-size:10px;">already linked elsewhere</span>' : ''}
      </span>
    `;
    row.addEventListener('click', async () => {
      try {
        await IBP.fetchJson(`/api/telegram/chats/${encodeURIComponent(chat.chatId)}/link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ crewKey: crew.key }),
        });
        IBP.toast(`Linked "${chat.title || chat.chatId}" → ${crew.display_name}`, 'success');
        IBP.closeDrawer();
        await refreshChats();
      } catch (err) { IBP.toast(err.message, 'error'); }
    });
    body.appendChild(row);
  }

  IBP.openDrawer({
    title: `Link chat to a crew`,
    subtitle: chat.title || chat.chatId,
    body,
  });
}

async function quickSendPrompt(chat) {
  const body = IBP.el('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
  body.innerHTML = `
    <div class="input-row">
      <label class="input-label">Send to</label>
      <div style="font-size:13px;color:var(--ink-700);">${IBP.escHtml(chat.linkedCrewName || chat.title || chat.chatId)} · <code style="font-family:JetBrains Mono,monospace;color:var(--ink-500);">${IBP.escHtml(chat.chatId)}</code></div>
    </div>
    <div class="input-row">
      <label class="input-label">Message</label>
      <textarea id="qs-text" rows="4" placeholder="Type a test message…"></textarea>
    </div>
  `;
  const footer = IBP.el('div');
  const sendBtn = IBP.el('button', 'btn btn-primary btn-block');
  sendBtn.innerHTML = '<i class="ti ti-send"></i><span>Send to Telegram</span>';
  sendBtn.addEventListener('click', async () => {
    const text = document.getElementById('qs-text').value.trim();
    if (!text) { IBP.toast('Message cannot be empty', 'error'); return; }
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="spinner"></span><span>Sending…</span>';
    try {
      await IBP.fetchJson('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: chat.chatId, text }),
      });
      IBP.toast('Message sent — check your Telegram!', 'success');
      IBP.closeDrawer();
    } catch (err) {
      IBP.toast(err.message, 'error');
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<i class="ti ti-send"></i><span>Send to Telegram</span>';
    }
  });
  footer.appendChild(sendBtn);
  IBP.openDrawer({ title: 'Quick test', subtitle: chat.title || chat.chatId, body, footer });
}

function renderTestPanel(chats) {
  const body = document.getElementById('tg-test-wrap');
  if (!body) return;
  document.getElementById('tg-test-wrap-count').textContent = '';
  const linkedChats = chats.filter((c) => !!c.linkedCrewKey && c.status === 'active');
  body.innerHTML = '';
  if (!linkedChats.length) {
    body.innerHTML = `<div class="tg-feed-empty">Link a chat to a crew first to enable quick-test sends.</div>`;
    return;
  }
  const panel = IBP.el('div', 'tg-test-panel');
  const row = IBP.el('div', 'tg-test-row');
  const select = IBP.el('select');
  select.id = 'tg-test-target';
  for (const c of linkedChats) {
    const opt = IBP.el('option', '', `${c.linkedCrewName || c.title || c.chatId} · ${c.chatId}`);
    opt.value = c.chatId;
    select.appendChild(opt);
  }
  const ta = IBP.el('textarea');
  ta.id = 'tg-test-text';
  ta.rows = 1;
  ta.placeholder = 'Type and send to Telegram…';
  const btn = IBP.el('button', 'btn btn-primary');
  btn.innerHTML = '<i class="ti ti-send"></i><span>Send</span>';
  btn.addEventListener('click', async () => {
    const text = ta.value.trim();
    if (!text) { IBP.toast('Empty message', 'error'); return; }
    const chatId = select.value;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span><span>…</span>';
    try {
      await IBP.fetchJson('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, text }),
      });
      IBP.toast('Sent — check your Telegram', 'success');
      ta.value = '';
    } catch (err) {
      IBP.toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-send"></i><span>Send</span>';
    }
  });
  row.appendChild(select);
  row.appendChild(ta);
  row.appendChild(btn);
  panel.appendChild(row);
  body.appendChild(panel);
}

async function refreshFeed() {
  const body = document.getElementById('tg-feed-wrap');
  if (!body) return;
  try {
    const events = await IBP.fetchJson('/api/telegram/activity?limit=50');
    document.getElementById('tg-feed-wrap-count').textContent = IBP.roundNum(events.length);
    body.innerHTML = '';
    if (!events.length) {
      body.innerHTML = `<div class="tg-feed-empty">No Telegram activity yet today. Send a message in a linked chat to see it appear here within 5 seconds.</div>`;
      return;
    }
    const feed = IBP.el('div', 'tg-feed');
    for (const ev of events) feed.appendChild(buildFeedRow(ev));
    body.appendChild(feed);
  } catch (err) {
    body.innerHTML = `<div class="tg-feed-empty" style="color:var(--danger-700)">Feed failed: ${IBP.escHtml(err.message)}</div>`;
  }
}

function buildFeedRow(ev) {
  const row = IBP.el('div', 'tg-feed-row');
  row.appendChild(IBP.el('div', 'tg-feed-time', ev.at ? IBP.formatTime(ev.at) : ''));
  const dir = IBP.el('div', `tg-feed-dir ${ev.direction}`);
  dir.innerHTML = ev.direction === 'in'
    ? '<i class="ti ti-arrow-down-left"></i>'
    : '<i class="ti ti-arrow-up-right"></i>';
  row.appendChild(dir);
  const body = IBP.el('div', 'tg-feed-body');
  const meta = IBP.el('div', 'tg-feed-meta');
  const crewName = IBP.el('span', 'crew', ev.crewName || ev.crewKey || 'Unknown');
  meta.appendChild(crewName);
  const kindBadge = IBP.el('span', 'kind', ev.kind);
  meta.appendChild(kindBadge);
  if (ev.jobNumber) {
    const job = IBP.el('span');
    job.style.cssText = 'font-family:JetBrains Mono,Menlo,monospace;font-size:11px;color:var(--ink-400);';
    job.textContent = `#${ev.jobNumber}`;
    meta.appendChild(job);
  }
  body.appendChild(meta);
  if (ev.text) {
    const text = IBP.el('div', 'tg-feed-text');
    text.textContent = ev.kind === 'check-in' ? `crew status: ${ev.text}` : ev.text;
    body.appendChild(text);
  }
  row.appendChild(body);
  return row;
}
