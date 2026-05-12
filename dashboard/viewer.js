function getTodayDateViewer() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function renderViewerCard(job) {
  const statusMap = { done: '✅ Done', 'in-progress': '🔄 In progress', issue: '⚠️ Issue reported' };
  const statusIcon = statusMap[job.check_in_status] ?? '⏳ Dispatched';

  let tasks = [];
  try { tasks = JSON.parse(job.tasks ?? '[]'); } catch {}
  let riskFlags = [];
  try { riskFlags = JSON.parse(job.risk_flags ?? '[]'); } catch {}

  return `
    <div class="viewer-card" data-job-id="${job.id}">
      <div class="viewer-card-header">
        <strong style="color:#60a5fa;">${(job.crew_key ?? '').toUpperCase()}</strong>
        <span class="viewer-status">${statusIcon}</span>
      </div>
      <div class="viewer-card-summary">${job.job_name ?? ''}</div>
      <div class="viewer-card-detail" style="display:none;">
        <p><strong>Address:</strong> ${job.address ?? 'TBD'}</p>
        ${tasks.length ? `<p><strong>Task:</strong> ${tasks.join(', ')}</p>` : ''}
        ${job.last_check_in ? `<p><strong>Last check-in:</strong> ${new Date(job.last_check_in).toLocaleTimeString()}</p>` : ''}
        ${riskFlags.length ? `<p style="color:#f87171;">${riskFlags.join('<br>')}</p>` : ''}
      </div>
    </div>
  `;
}

async function loadViewerDashboard() {
  const date = new URLSearchParams(window.location.search).get('date') ?? getTodayDateViewer();
  const root = document.getElementById('viewer-root');
  if (!root) return;

  try {
    const res = await fetch(`/api/briefs/${date}`);
    if (!res.ok) {
      root.innerHTML = '<p style="color:#8b949e;padding:16px;">No schedule available for this date.</p>';
      return;
    }

    const brief = await res.json();
    const jobs = brief.jobs ?? [];

    root.innerHTML = `
      <div class="viewer-header">
        <h1>IBP Operations</h1>
        <p style="color:#8b949e;font-size:13px;">${formatDateLabel(date)} · ${jobs.length} crew${jobs.length !== 1 ? 's' : ''} assigned</p>
      </div>
      <div class="viewer-grid">
        ${jobs.map(renderViewerCard).join('')}
      </div>
      <p class="viewer-footer">View only · Last updated ${new Date().toLocaleTimeString()}</p>
    `;

    document.querySelectorAll('.viewer-card').forEach((card) => {
      card.addEventListener('click', () => card.classList.toggle('expanded'));
    });
  } catch {
    root.innerHTML = '<p style="color:#8b949e;padding:16px;">Failed to load schedule.</p>';
  }
}

document.addEventListener('DOMContentLoaded', loadViewerDashboard);
setInterval(loadViewerDashboard, 60_000);
