/* IBP Dispatch — minimal hash router */

window.IBP = window.IBP || {};
IBP.routes = {};
IBP.currentRoute = null;

IBP.registerRoute = (name, renderFn) => {
  IBP.routes[name] = renderFn;
};

IBP.navigate = (name) => {
  if (location.hash.slice(2) !== name) {
    location.hash = `#/${name}`;
    return; // hashchange will trigger render
  }
  IBP.render();
};

IBP.render = () => {
  const route = location.hash.slice(2) || 'dispatch';
  const main = document.getElementById('main');
  if (!main) return;
  main.innerHTML = '';

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach((b) => {
    b.classList.toggle('active', b.dataset.route === route);
  });

  IBP.currentRoute = route;
  const fn = IBP.routes[route];
  if (fn) {
    try { fn(main); }
    catch (err) {
      console.error(`[router] render ${route} failed:`, err);
      main.appendChild(IBP.emptyState({
        icon: 'alert-triangle',
        title: 'Something went wrong',
        sub: err.message || String(err),
      }));
    }
  } else {
    main.appendChild(IBP.emptyState({
      icon: 'help-circle',
      title: 'Unknown route',
      sub: `/${route} is not registered.`,
    }));
  }
};

window.addEventListener('hashchange', IBP.render);

// Wire sidebar nav clicks
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const route = btn.dataset.route;
      if (route) IBP.navigate(route);
    });
  });
});
