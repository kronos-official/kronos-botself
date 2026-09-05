(() => {
  'use strict';

  const originalGetElementById = document.getElementById.bind(document);
  const fallbackElements = new Map();

  document.getElementById = function kronosSafeGetElementById(id) {
    const existing = originalGetElementById(id);
    if (existing) return existing;

    let fallback = fallbackElements.get(id);
    if (fallback) return fallback;

    fallback = document.createElement('span');
    fallback.id = `__kronos_missing_${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    fallback.hidden = true;
    fallback.dataset.kronosMissing = String(id);

    if (document.body) {
      document.body.appendChild(fallback);
    }

    fallbackElements.set(id, fallback);
    return fallback;
  };
})();
