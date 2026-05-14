/* IBP Dispatch — reusable drawer */

window.IBP = window.IBP || {};

IBP.openDrawer = ({ title, subtitle, body, footer } = {}) => {
  IBP.closeDrawer(); // close any open drawer first

  const root = document.getElementById('drawer-root');
  const backdrop = IBP.el('div', 'drawer-backdrop');

  const drawer = IBP.el('div', 'drawer');

  // If no title/subtitle, render only a floating close button (caller is using its own header)
  if (!title && !subtitle) {
    const floatingClose = IBP.el('button', 'drawer-close-floating');
    floatingClose.innerHTML = '<i class="ti ti-x"></i>';
    floatingClose.addEventListener('click', IBP.closeDrawer);
    drawer.appendChild(floatingClose);
  } else {
    const header = IBP.el('div', 'drawer-header');
    const titleWrap = IBP.el('div');
    if (title) titleWrap.appendChild(IBP.el('div', 'drawer-title', title));
    if (subtitle) titleWrap.appendChild(IBP.el('div', 'drawer-subtitle', subtitle));
    const closeBtn = IBP.el('button', 'modal-close');
    closeBtn.innerHTML = '<i class="ti ti-x"></i>';
    closeBtn.addEventListener('click', IBP.closeDrawer);
    header.appendChild(titleWrap);
    header.appendChild(closeBtn);
    drawer.appendChild(header);
  }

  const bodyEl = IBP.el('div', title || subtitle ? 'drawer-body' : 'drawer-body profile');
  if (body instanceof HTMLElement) {
    bodyEl.appendChild(body);
  } else if (typeof body === 'string') {
    bodyEl.innerHTML = body;
  }

  drawer.appendChild(bodyEl);

  if (footer instanceof HTMLElement) {
    const footEl = IBP.el('div', 'drawer-footer sticky-save');
    footEl.appendChild(footer);
    drawer.appendChild(footEl);
  }

  backdrop.appendChild(drawer);
  // Click backdrop (outside drawer) closes
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) IBP.closeDrawer();
  });
  root.appendChild(backdrop);

  // ESC closes
  document.addEventListener('keydown', IBP._drawerEsc);
};

IBP._drawerEsc = (e) => {
  if (e.key === 'Escape') IBP.closeDrawer();
};

IBP.closeDrawer = () => {
  const root = document.getElementById('drawer-root');
  if (root) root.innerHTML = '';
  document.removeEventListener('keydown', IBP._drawerEsc);
};

// Helper to build a drawer row label/value
IBP.drawerRow = (label, value, opts = {}) => {
  const row = IBP.el('div', opts.column ? 'drawer-row column' : 'drawer-row');
  row.appendChild(IBP.el('div', 'drawer-row-label', label));
  if (value instanceof HTMLElement) {
    const wrap = IBP.el('div', opts.column ? 'drawer-row-value full' : 'drawer-row-value');
    wrap.appendChild(value);
    row.appendChild(wrap);
  } else {
    row.appendChild(IBP.el('div', opts.column ? 'drawer-row-value full' : 'drawer-row-value', value ?? '—'));
  }
  return row;
};
