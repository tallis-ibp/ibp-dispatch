/* IBP Dispatch — Photos page */

IBP.registerRoute('photos', async (main) => {
  const today = IBP.todayISO();

  const header = IBP.el('div', 'page-header');
  const left = IBP.el('div');
  left.appendChild(IBP.el('h1', 'page-title', 'Photos'));
  left.appendChild(IBP.el('div', 'page-meta', 'Job-site photos sent by crews. Click any photo for details.'));
  header.appendChild(left);
  main.appendChild(header);

  // Filter row
  const filters = IBP.el('div', 'filter-row');
  const dateInput = IBP.el('input');
  dateInput.type = 'date';
  dateInput.value = today;
  const crewSelect = IBP.el('select');
  crewSelect.innerHTML = '<option value="">All crews</option>';
  const statusSelect = IBP.el('select');
  statusSelect.innerHTML = `
    <option value="">All statuses</option>
    <option value="done">Done</option>
    <option value="in-progress">In progress</option>
    <option value="unknown">Unknown</option>
  `;
  filters.appendChild(dateInput);
  filters.appendChild(crewSelect);
  filters.appendChild(statusSelect);
  main.appendChild(filters);

  const stats = IBP.el('div', 'stat-strip');
  stats.style.gridTemplateColumns = 'repeat(4, 1fr)';
  stats.innerHTML = `
    <div class="stat-card"><div class="stat-num" id="ph-total">—</div><div class="stat-label">Photos today</div></div>
    <div class="stat-card"><div class="stat-num" id="ph-done" style="color:var(--success-700)">—</div><div class="stat-label">Job done</div></div>
    <div class="stat-card"><div class="stat-num" id="ph-progress" style="color:var(--info-700)">—</div><div class="stat-label">In progress</div></div>
    <div class="stat-card"><div class="stat-num" id="ph-unknown" style="color:var(--ink-400)">—</div><div class="stat-label">Unknown</div></div>
  `;
  main.appendChild(stats);

  const wrap = IBP.el('div');
  wrap.appendChild(IBP.spinner('Loading photos…'));
  main.appendChild(wrap);

  // Populate crew filter from existing photos response
  const load = async () => {
    wrap.innerHTML = '';
    wrap.appendChild(IBP.spinner('Loading photos…'));
    const params = new URLSearchParams({ date: dateInput.value });
    if (crewSelect.value)   params.set('crewKey', crewSelect.value);
    if (statusSelect.value) params.set('status',  statusSelect.value);
    try {
      const photos = await IBP.fetchJson(`/api/photos?${params}`);
      // Update stats
      const counts = { done: 0, 'in-progress': 0, unknown: 0 };
      for (const p of photos) {
        const k = p.completionStatus || 'unknown';
        counts[k] = (counts[k] || 0) + 1;
      }
      document.getElementById('ph-total').textContent = IBP.roundNum(photos.length);
      document.getElementById('ph-done').textContent  = IBP.roundNum(counts.done);
      document.getElementById('ph-progress').textContent = IBP.roundNum(counts['in-progress']);
      document.getElementById('ph-unknown').textContent  = IBP.roundNum(counts.unknown);

      wrap.innerHTML = '';
      if (!photos.length) {
        wrap.appendChild(IBP.emptyState({
          icon: 'photo-off',
          title: 'No photos for these filters',
          sub: 'Try a different date or remove a filter.',
        }));
        return;
      }
      const grid = IBP.el('div', 'card-grid-3');
      for (const p of photos) grid.appendChild(buildPhotoCard(p));
      wrap.appendChild(grid);

      // Populate crew filter options
      const seen = new Set();
      for (const p of photos) {
        if (p.crewDisplay && p.crewKey && !seen.has(p.crewKey)) {
          const o = IBP.el('option', '', p.crewDisplay);
          o.value = p.crewKey;
          if (crewSelect.value === p.crewKey) o.selected = true;
          crewSelect.appendChild(o);
          seen.add(p.crewKey);
        }
      }
    } catch (err) {
      wrap.innerHTML = '';
      wrap.appendChild(IBP.emptyState({
        icon: 'alert-triangle', title: 'Failed to load photos', sub: err.message,
      }));
    }
  };
  dateInput.addEventListener('change', load);
  crewSelect.addEventListener('change', load);
  statusSelect.addEventListener('change', load);
  load();
});

function buildPhotoCard(p) {
  const card = IBP.el('div', 'photo-card');
  card.addEventListener('click', () => openPhotoDrawer(p));

  // Image - streamed from /api/photos/{id}/image
  const img = IBP.el('img', 'photo-thumb');
  img.src = `/api/photos/${p.id}/image`;
  img.alt = p.aiSummary || 'Crew photo';
  img.loading = 'lazy';
  img.onerror = () => {
    const ph = IBP.el('div', 'photo-thumb-placeholder');
    ph.innerHTML = '<i class="ti ti-photo-off"></i>';
    img.replaceWith(ph);
  };
  card.appendChild(img);

  const body = IBP.el('div', 'photo-body');
  const meta = IBP.el('div', 'photo-meta');
  meta.appendChild(IBP.el('span', '', p.crewDisplay ?? p.crewKey ?? 'Unknown'));
  meta.appendChild(IBP.el('span', 'photo-time', IBP.formatTime(p.receivedAt)));
  body.appendChild(meta);

  if (p.aiSummary) body.appendChild(IBP.el('div', 'photo-summary', p.aiSummary));

  if (p.completionStatus) {
    const c = p.completionStatus;
    const badge = IBP.el('span',
      `badge ${c === 'done' ? 'success' : c === 'in-progress' ? 'warning' : 'neutral'}`,
      c === 'done' ? 'Done' : c === 'in-progress' ? 'In progress' : 'Unknown');
    body.appendChild(badge);
  }
  card.appendChild(body);
  return card;
}

function openPhotoDrawer(p) {
  const body = IBP.el('div');

  const img = IBP.el('img');
  img.src = `/api/photos/${p.id}/image`;
  img.alt = p.aiSummary || 'Crew photo';
  img.style.cssText = 'width:100%;border-radius:8px;background:var(--cream-200);';
  body.appendChild(img);

  const detailsBlock = IBP.el('div');
  detailsBlock.style.marginTop = '14px';
  detailsBlock.appendChild(IBP.drawerRow('Crew', p.crewDisplay ?? p.crewKey ?? 'Unknown'));
  detailsBlock.appendChild(IBP.drawerRow('Sender', p.sender || '—'));
  detailsBlock.appendChild(IBP.drawerRow('Received', IBP.formatDateTime(p.receivedAt)));
  if (p.jobNumber) detailsBlock.appendChild(IBP.drawerRow('Job', `#${p.jobNumber}`));
  if (p.caption)   detailsBlock.appendChild(IBP.drawerRow('Caption', `"${p.caption}"`, { column: true }));
  if (p.completionStatus) {
    const c = p.completionStatus;
    detailsBlock.appendChild(IBP.drawerRow('Status',
      IBP.el('span', `badge ${c === 'done' ? 'success' : c === 'in-progress' ? 'warning' : 'neutral'}`, c)));
  }
  if (p.aiSummary) detailsBlock.appendChild(IBP.drawerRow('AI summary', p.aiSummary, { column: true }));
  if (p.mondayUpdated === 1 || p.mondayUpdated === true) {
    detailsBlock.appendChild(IBP.drawerRow('Monday.com',
      IBP.el('span', 'badge success', 'Logged')));
  }
  body.appendChild(detailsBlock);

  IBP.openDrawer({
    title: 'Photo',
    subtitle: p.id,
    body,
  });
}
