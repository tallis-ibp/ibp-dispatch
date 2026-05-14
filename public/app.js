/* IBP Dispatch — boot + crew setup modal */

async function checkAuth() {
  try {
    const res = await fetch('/api/briefs/' + new Date().toISOString().slice(0, 10));
    if (res.status === 401) {
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('app').classList.add('hidden');
      document.getElementById('login-telegram-btn').addEventListener('click', async () => {
        const r = await fetch('/api/auth/init', { method: 'POST' });
        const data = await r.json();
        window.open(data.telegramUrl, '_blank');
      });
      return false;
    }
    return true;
  } catch { return true; }
}

// ─── Crew setup modal (shared by Dispatch and Crews pages) ──────
let _crewSetupState = { mode: 'create', editingKey: null };
let _botUsername = null;

async function loadBotUsername() {
  if (_botUsername) return _botUsername;
  try {
    const r = await fetch('/api/debug');
    const d = await r.json();
    if (d.ok && d.bot) _botUsername = d.bot;
  } catch { /* ignore */ }
  return _botUsername;
}

async function loadRecentChats() {
  try {
    const chats = await IBP.fetchJson('/api/chats/recent');
    const wrap = document.getElementById('modal-recent-chats-wrap');
    const list = document.getElementById('modal-recent-chats');
    if (!wrap || !list) return;
    if (!chats.length) { wrap.classList.add('hidden'); return; }
    list.innerHTML = '';
    for (const c of chats) {
      const row = IBP.el('div', `recent-chat-item ${c.linkedTo ? 'linked' : ''}`);
      const lhs = IBP.el('div');
      lhs.style.cssText = 'display:flex;align-items:center;gap:8px;';
      lhs.innerHTML = `
        <span class="chat-id">${IBP.escHtml(c.chatId)}</span>
        <span class="chat-sender">${c.sender ? '· ' + IBP.escHtml(c.sender) : ''}</span>
      `;
      const rhs = IBP.el('div');
      rhs.style.cssText = 'font-size:11px;color:var(--ink-400);';
      rhs.textContent = c.linkedTo ? `linked to ${c.linkedTo}` : IBP.relativeTime(c.lastSeen);
      row.appendChild(lhs);
      row.appendChild(rhs);
      if (!c.linkedTo) {
        row.addEventListener('click', () => {
          document.getElementById('modal-group-id').value = c.chatId;
        });
      }
      list.appendChild(row);
    }
    wrap.classList.remove('hidden');
  } catch { /* ignore */ }
}

function setBotLink(username) {
  const link = document.getElementById('modal-bot-link');
  if (!link) return;
  if (username) {
    link.href = `https://t.me/${username}?startgroup=1`;
    link.textContent = `Add @${username} to that group`;
  } else {
    link.removeAttribute('href');
    link.textContent = 'Add the bot to that group';
  }
}

function openCrewSetupModal(opts = {}) {
  const isCreate = opts.mode === 'create';
  _crewSetupState = { mode: opts.mode, editingKey: opts.crewKey ?? null };
  document.getElementById('modal-crew-name').textContent =
    isCreate ? 'Add new crew' : `Connect ${opts.displayName ?? 'crew'}`;
  document.getElementById('modal-create-fields').classList.toggle('hidden', !isCreate);
  document.getElementById('modal-display-name').value = '';
  document.getElementById('modal-crew-key').value = '';
  document.getElementById('modal-group-id').value = opts.groupId ?? '';
  document.getElementById('modal-lang').value = opts.language ?? 'en';

  // Auto-derive key from name (only while user hasn't typed in key field manually)
  if (isCreate) {
    const keyField = document.getElementById('modal-crew-key');
    let manual = false;
    keyField.oninput = () => { manual = true; };
    document.getElementById('modal-display-name').oninput = function () {
      if (!manual) {
        keyField.value = this.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      }
    };
  }

  loadBotUsername().then(setBotLink);
  loadRecentChats();
  document.getElementById('crew-setup-modal').classList.remove('hidden');
}

IBP.openAddCrewModal = () => openCrewSetupModal({ mode: 'create' });
IBP.openCrewSetupForEdit = (crew) => openCrewSetupModal({
  mode: 'edit',
  crewKey: crew.key,
  displayName: crew.display_name ?? crew.displayName,
  groupId: crew.telegram_group_id ?? crew.telegramGroupId,
  language: crew.language,
});
// Back-compat from dispatch page (uses camelCase crew object)
function openCrewSetupFromDispatch(crew) {
  openCrewSetupModal({
    mode: 'edit',
    crewKey: crew.key,
    displayName: crew.displayName,
    groupId: crew.telegramGroupId,
    language: crew.language,
  });
}
window.openCrewSetupFromDispatch = openCrewSetupFromDispatch;

window.closeCrewSetup = () => {
  document.getElementById('crew-setup-modal').classList.add('hidden');
  _crewSetupState = { mode: 'create', editingKey: null };
};

window.saveCrewSetup = async () => {
  const groupId = document.getElementById('modal-group-id').value.trim();
  const lang = document.getElementById('modal-lang').value;
  const btn = document.getElementById('modal-save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    if (_crewSetupState.mode === 'create') {
      const displayName = document.getElementById('modal-display-name').value.trim();
      const key = document.getElementById('modal-crew-key').value.trim();
      if (!displayName || !key) {
        IBP.toast('Name and key are required', 'error');
        return;
      }
      await IBP.fetchJson('/api/crews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, displayName, telegramGroupId: groupId || undefined, language: lang }),
      });
      IBP.toast(`Crew "${displayName}" created`, 'success');
    } else if (_crewSetupState.editingKey) {
      await IBP.fetchJson(`/api/crews/${_crewSetupState.editingKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramGroupId: groupId, language: lang }),
      });
      IBP.toast('Crew updated', 'success');
    }
    window.closeCrewSetup();
    IBP.render();
  } catch (err) {
    IBP.toast(err.message || 'Save failed', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
};

// ─── Boot ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const authed = await checkAuth();
  if (!authed) return;
  document.getElementById('app').classList.remove('hidden');

  // Initial render based on hash (or default to dispatch)
  if (!location.hash) location.hash = '#/dispatch';
  else IBP.render();

  // Poll flag count every 30 seconds when not on Flags page
  setInterval(async () => {
    if (IBP.currentRoute === 'flags') return;
    try {
      const flags = await IBP.fetchJson(`/api/flags?date=${IBP.todayISO()}`);
      const open = flags.filter((f) => !f.resolved).length;
      IBP.updateFlagBadge(open);
    } catch { /* ignore */ }
  }, 30_000);
});
