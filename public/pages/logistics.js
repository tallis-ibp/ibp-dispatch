/* IBP Dispatch — Logistics placeholder */

IBP.registerRoute('logistics', (main) => {
  const header = IBP.el('div', 'page-header');
  const left = IBP.el('div');
  left.appendChild(IBP.el('h1', 'page-title', 'Logistics'));
  left.appendChild(IBP.el('div', 'page-meta', 'Driver runs and trailer planning.'));
  header.appendChild(left);
  main.appendChild(header);

  main.appendChild(IBP.emptyState({
    icon: 'truck',
    title: 'Driver runs coming soon',
    sub: 'Pre-sequenced day plans for Noel and the logistics fleet — pick-up stops, dump runs, and crew deliveries — will land here once the route builder is wired up.',
  }));
});
