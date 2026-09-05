(() => {
  "use strict";

  window.addEventListener("error", (event) => {
    console.error(
      "[Kronos DOM Guard] Runtime error:",
      event.error || event.message || event,
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error(
      "[Kronos DOM Guard] Unhandled promise rejection:",
      event.reason,
    );
  });

  window.KronosDOMGuard = Object.freeze({
    enabled: true,
    version: "2026.09.05",
  });
})();
