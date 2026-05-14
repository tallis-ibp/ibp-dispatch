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

// Deterministic hash → 0..11 for avatar color palette
IBP.colorIndex = (name) => {
  if (!name) return 0;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % 12;
};

IBP.initials = (name) => {
  if (!name) return '?';
  const words = String(name).replace(/[()]/g, '').trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
};

IBP.avatar = (name, size = 'md') => {
  const div = IBP.el('div', `avatar avatar-${size} avatar-c${IBP.colorIndex(name)}`);
  div.textContent = IBP.initials(name);
  return div;
};

// Skeleton helpers
IBP.skeleton = (width, height) => {
  const s = IBP.el('div', 'skeleton');
  if (width)  s.style.width  = typeof width  === 'number' ? `${width}px`  : width;
  if (height) s.style.height = typeof height === 'number' ? `${height}px` : height;
  return s;
};

IBP.skeletonCard = () => {
  const card = IBP.el('div', 'skeleton-card');
  const head = IBP.el('div');
  head.style.cssText = 'display:flex;align-items:center;gap:10px;';
  const av = IBP.skeleton(36, 36);
  av.style.borderRadius = '50%';
  head.appendChild(av);
  const lines = IBP.el('div');
  lines.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:6px;';
  lines.appendChild(IBP.skeleton('60%', 12));
  lines.appendChild(IBP.skeleton('40%', 10));
  head.appendChild(lines);
  card.appendChild(head);
  card.appendChild(IBP.skeleton('100%', 22));
  card.appendChild(IBP.skeleton('100%', 14));
  return card;
};

// Promise-based confirm dialog (replaces native window.confirm)
IBP.confirm = ({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) => new Promise((resolve) => {
  const backdrop = IBP.el('div', 'modal-backdrop');
  const dialog = IBP.el('div', 'confirm-dialog');
  const body = IBP.el('div');
  body.style.cssText = 'padding:20px;text-align:center;display:flex;flex-direction:column;align-items:center;';
  if (danger) {
    const icon = IBP.el('div', 'confirm-icon');
    icon.innerHTML = '<i class="ti ti-alert-triangle"></i>';
    body.appendChild(icon);
  }
  body.appendChild(IBP.el('div', '', title))
      .style.cssText = 'font-size:15px;font-weight:500;color:var(--ink-900);margin-bottom:4px;';
  if (message) {
    body.appendChild(IBP.el('div', '', message))
        .style.cssText = 'font-size:13px;color:var(--ink-600);line-height:1.5;margin-bottom:4px;';
  }
  dialog.appendChild(body);

  const footer = IBP.el('div');
  footer.style.cssText = 'display:flex;gap:8px;padding:0 20px 20px;';
  const cancel = IBP.el('button', 'btn btn-outline', cancelLabel);
  cancel.style.flex = '1';
  const confirm = IBP.el('button', `btn ${danger ? 'btn-danger' : 'btn-primary'}`, confirmLabel);
  confirm.style.flex = '1';
  cancel.addEventListener('click', () => { backdrop.remove(); resolve(false); });
  confirm.addEventListener('click', () => { backdrop.remove(); resolve(true); });
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) { backdrop.remove(); resolve(false); }
  });
  footer.appendChild(cancel);
  footer.appendChild(confirm);
  dialog.appendChild(footer);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  confirm.focus();
});
