(() => {
  "use strict";

  const nativeGetElementById =
    Document.prototype.getElementById;

  const fallbackElements = new Map();

  function createFallback(id) {
    const element = document.createElement("span");

    element.id =
      `__kronos_missing_${String(id).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    element.hidden = true;
    element.dataset.kronosMissing = String(id);

    return element;
  }

  Document.prototype.getElementById = function kronosGetElementById(id) {
    const existing = nativeGetElementById.call(this, id);

    if (existing) {
      return existing;
    }

    if (fallbackElements.has(id)) {
      return fallbackElements.get(id);
    }

    const fallback = createFallback(id);
    fallbackElements.set(id, fallback);

    if (document.body) {
      document.body.appendChild(fallback);
    }

    return fallback;
  };

  window.addEventListener("error", (event) => {
    const message = String(event.message || "");

    if (message.includes("Cannot set properties of null")) {
      console.error(
        "[Kronos DOM Guard] Detected null property assignment.",
        event.error || event,
      );
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error(
      "[Kronos DOM Guard] Unhandled promise rejection:",
      event.reason,
    );
  });
})();
