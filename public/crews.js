/* IBP Dispatch — crews.js: crew Telegram group management */

let allCrews = [];
let editingCrewKey = null;
let isCreatingCrew = false;
let botUsername = null;

async function loadBotUsername() {
  if (botUsername) return botUsername;
  try {
    const res = await fetch('/api/debug');
    const data = await res.json();
    if (data.ok && data.bot) botUsername = data.bot;
  } catch { /* ignore */ }
  return botUsername;
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

async function loadCrews() {
  const loading = document.getElementById('crews-loading');
  const content = document.getElementById('crews-content');
  if (!loading || !content) return;

  loading.classList.remove('hidden');
  content.classList.add('hidden');

  try {
    const res = await fetch('/api/crews');
    allCrews = await res.json();
    renderCrews(allCrews);
  } catch (err) {
    loading.innerHTML = '<div class="empty-state"><span class="material-symbols-outlined">error</span>Failed to load crews.</div>';
    console.error(err);
  }
}

function renderCrews(crews) {
  const loading = document.getElementById('crews-loading');
  const content = document.getElementById('crews-content');
  if (!loading || !content) return;

  loading.classList.add('hidden');
  content.classList.remove('hidden');

  if (!crews.length) {
    content.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-outlined">group_off</span>
        No crews yet. Click <strong>Add Crew</strong> to create the first one.
      </div>`;
    return;
  }

  content.innerHTML = crews.map(crew => {
    const initials = crew.display_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const strengths = safeJson(crew.strengths, []);
    const cautions = safeJson(crew.cautions, []);
    const isConnected = !!crew.telegram_group_id;
    const reliabilityBadge = crew.reliability === 'high'
      ? '<span class="badge badge-high">High reliability</span>'
      : crew.reliability === 'low'
        ? '<span class="badge badge-low">Low reliability</span>'
        : crew.reliability
          ? `<span class="badge badge-normal">${crew.reliability}</span>`
          : '';

    return `
      <div class="crew-mgmt-card ${isConnected ? 'connected' : ''}" id="crew-card-${crew.key}">
        <div class="crew-mgmt-header">
          <div class="crew-avatar">${initials}</div>
          <div class="crew-mgmt-info">
            <div class="crew-mgmt-name">${crew.display_name}</div>
            <div class="crew-mgmt-key">${crew.key}</div>
          </div>
          <div class="crew-connection-status ${isConnected ? 'connected' : 'disconnected'}">
            <span class="material-symbols-outlined">${isConnected ? 'check_circle' : 'radio_button_unchecked'}</span>
            ${isConnected ? 'Connected' : 'Not set'}
          </div>
        </div>
        <div class="crew-mgmt-body">
          <div class="crew-detail-row">
            <span class="crew-detail-label">Language</span>
            <span class="lang-badge">${crew.language || 'EN'}</span>
          </div>
          ${isConnected ? `
          <div class="crew-detail-row">
            <span class="crew-detail-label">Chat ID</span>
            <span class="crew-group-id">${crew.telegram_group_id}</span>
          </div>` : ''}
          ${reliabilityBadge ? `<div class="crew-detail-row"><span class="crew-detail-label">Reliability</span>${reliabilityBadge}</div>` : ''}
          ${strengths.length ? `
          <div>
            <div class="crew-detail-label" style="margin-bottom:6px">Skills</div>
            <div class="crew-skills-list">${strengths.map(s => `<span class="crew-skill-chip">${s}</span>`).join('')}</div>
          </div>` : ''}
          ${cautions.length ? `
          <div style="font-size:12px;color:var(--md-warning);background:var(--md-warning-container);padding:8px 10px;border-radius:8px;display:flex;align-items:center;gap:6px">
            <span class="material-symbols-outlined" style="font-size:16px">warning</span>
            ${cautions.join(' · ')}
          </div>` : ''}
          <div class="crew-mgmt-actions">
            <button class="btn-connect-crew ${isConnected ? 'connected' : ''}" onclick="openCrewSetupFromCrews('${crew.key}', '${crew.display_name}', '${crew.telegram_group_id || ''}', '${crew.language || 'en'}')">
              <span class="material-symbols-outlined" style="font-size:18px">${isConnected ? 'edit' : 'link'}</span>
              ${isConnected ? 'Update Group' : 'Connect Group'}
            </button>
            ${isConnected ? `
            <button class="btn btn-secondary" style="padding:8px 12px" onclick="testCrewMessage('${crew.key}', '${crew.telegram_group_id}')" title="Send test message">
              <span class="material-symbols-outlined" style="font-size:18px">send</span>
            </button>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function safeJson(val, fallback) {
  try { return JSON.parse(val || '[]'); }
  catch { return fallback; }
}

function openAddCrewModal() {
  isCreatingCrew = true;
  editingCrewKey = null;
  document.getElementById('modal-crew-name').textContent = 'Add New Crew';
  document.getElementById('modal-create-fields').classList.remove('hidden');
  document.getElementById('modal-display-name').value = '';
  document.getElementById('modal-crew-key').value = '';
  document.getElementById('modal-group-id').value = '';
  document.getElementById('modal-lang').value = 'en';
  loadBotUsername().then(setBotLink);

  // Auto-generate key from name only while key hasn't been manually edited
  const keyField = document.getElementById('modal-crew-key');
  let keyManuallyEdited = false;
  keyField.oninput = () => { keyManuallyEdited = true; };
  document.getElementById('modal-display-name').oninput = function() {
    if (!keyManuallyEdited) {
      keyField.value = this.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    }
  };

  document.getElementById('crew-setup-modal').classList.remove('hidden');
}

function openCrewSetupFromCrews(key, name, groupId, lang) {
  isCreatingCrew = false;
  editingCrewKey = key;
  document.getElementById('modal-crew-name').textContent = `Connect ${name}`;
  document.getElementById('modal-create-fields').classList.add('hidden');
  document.getElementById('modal-group-id').value = groupId || '';
  document.getElementById('modal-lang').value = lang || 'en';
  loadBotUsername().then(setBotLink);
  document.getElementById('crew-setup-modal').classList.remove('hidden');
}

async function testCrewMessage(key, chatId) {
  try {
    const res = await fetch(`/api/crews/${key}/test`, { method: 'POST' });
    if (res.ok) {
      toast(`Test message sent`, 'success');
    } else {
      const body = await res.json().catch(() => ({}));
      toast(body.error || 'Test failed — check server logs', 'error');
    }
  } catch {
    toast('Test failed', 'error');
  }
}

// Override the saveCrewSetup from app.js to handle both create and edit
const _origSaveCrewSetup = window.saveCrewSetup;
window.saveCrewSetup = async function() {
  const groupId = document.getElementById('modal-group-id').value.trim();
  const lang = document.getElementById('modal-lang').value;
  const btn = document.getElementById('modal-save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    if (isCreatingCrew) {
      const displayName = document.getElementById('modal-display-name').value.trim();
      const key = document.getElementById('modal-crew-key').value.trim();
      if (!displayName || !key) {
        toast('Name and key are required', 'error');
        return;
      }
      const res = await fetch('/api/crews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, displayName, telegramGroupId: groupId || undefined, language: lang }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed');
      }
      document.getElementById('crew-setup-modal').classList.add('hidden');
      toast(`Crew "${displayName}" created`, 'success');
    } else if (editingCrewKey) {
      const res = await fetch(`/api/crews/${editingCrewKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramGroupId: groupId, language: lang }),
      });
      if (!res.ok) throw new Error('Failed');
      document.getElementById('crew-setup-modal').classList.add('hidden');
      toast('Crew updated', 'success');
    } else {
      // Opened from Dispatch tab brief card — delegate to original
      if (_origSaveCrewSetup) return _origSaveCrewSetup();
      return;
    }
    isCreatingCrew = false;
    editingCrewKey = null;
    await loadCrews();
  } catch (err) {
    toast(err.message || 'Save failed', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
};

// Hook into tab switching to load crews when tab opens
document.addEventListener('DOMContentLoaded', () => {
  const tabBtns = document.querySelectorAll('.tab-nav .tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      document.querySelectorAll('.tab-actions').forEach(a => a.classList.add('hidden'));
      tabBtns.forEach(b => b.classList.remove('active'));

      const panel = document.getElementById(`tab-${tab}`);
      if (panel) panel.classList.remove('hidden');

      const actions = document.getElementById(`${tab}-actions`);
      if (actions) actions.classList.remove('hidden');

      btn.classList.add('active');

      if (tab === 'crews') loadCrews();
    });
  });
});
