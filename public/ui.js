/* IBP Dispatch — shared UI helpers */

window.IBP = window.IBP || {};

IBP.todayISO = () => new Date().toISOString().slice(0, 10);

IBP.el = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
};

IBP.escHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

IBP.formatDate = (iso) => {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
};

IBP.formatTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
};

IBP.formatDateTime = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch { return ''; }
};

IBP.relativeTime = (iso) => {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
};

IBP.roundNum = (n) => {
  if (n == null || isNaN(n)) return '0';
  return new Intl.NumberFormat('en-US').format(Math.round(Number(n)));
};

IBP.safeJson = (val, fallback) => {
  if (val == null) return fallback;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return fallback; }
};

let _toastTimer;
IBP.toast = (message, type = 'success') => {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = message;
  t.className = `toast ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
};

IBP.fetchJson = async (url, opts = {}) => {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
};

IBP.emptyState = ({ icon, title, sub, ctaLabel, ctaAction } = {}) => {
  const box = IBP.el('div', 'empty-state');
  if (icon) {
    const i = document.createElement('i');
    i.className = `ti ti-${icon}`;
    box.appendChild(i);
  }
  if (title) box.appendChild(IBP.el('div', 'empty-state-title', title));
  if (sub)   box.appendChild(IBP.el('div', 'empty-state-sub', sub));
  if (ctaLabel && ctaAction) {
    const btn = IBP.el('button', 'btn btn-primary', ctaLabel);
    btn.addEventListener('click', ctaAction);
    box.appendChild(btn);
  }
  return box;
};

IBP.spinner = (label = 'Loading…') => {
  const row = IBP.el('div', 'loading-row');
  const s = document.createElement('span');
  s.className = 'spinner';
  row.appendChild(s);
  row.appendChild(IBP.el('span', '', label));
  return row;
};
