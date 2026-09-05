(() => {
  "use strict";

  window.addEventListener("error", (event) => {
    const message = String(event.message || "");
    if (!message) return;

    console.error(
      "[Kronos DOM Guard] Runtime error:",
      message,
      event.error || "",
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
