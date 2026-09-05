(() => {
  "use strict";

  const tg = window.Telegram?.WebApp;

  const el = id => document.getElementById(id);

  const escapeHtml = value => String(value ?? "").replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]),
  );

  const show = (message, type = "error") => {
    if (typeof window.notice === "function") {
      window.notice(message, type);
      return;
    }

    const node = el("notice");
    if (!node) return;

    node.textContent = String(message || "خطای نامشخص");
    node.className = `notice show ${type}`;
    clearTimeout(show.timer);
    show.timer = setTimeout(() => node.classList.remove("show"), 4500);
  };

  const describeError = (status, data) => {
    let message = "";

    if (typeof data?.detail === "string") {
      message = data.detail;
    } else if (Array.isArray(data?.detail)) {
      message = data.detail
        .map(item => {
          if (!item) return "";
          if (typeof item === "string") return item;
          const field = Array.isArray(item.loc)
            ? item.loc.filter(Boolean).join(" → ")
            : "";
          const text = item.msg || item.message || "Invalid value";
          return field ? `${field}: ${text}` : text;
        })
        .filter(Boolean)
        .join("\n");
    } else if (typeof data?.detail?.message === "string") {
      message = data.detail.message;
    } else if (typeof data?.message === "string") {
      message = data.message;
    }

    if (status === 400) return `⚠️ درخواست نامعتبر است.\n${message}`;
    if (status === 401) return "🔐 نشست منقضی شده است؛ در حال ورود مجدد…";
    if (status === 403) return "⛔ دسترسی به این عملیات مجاز نیست.";
    if (status === 404) return "🔎 مورد درخواستی پیدا نشد.";
    if (status === 409) {
      if (/not connected/i.test(message)) {
        return "🔴 ابتدا اکانت Telegram را متصل کنید.";
      }
      return message || "⚠️ این عملیات با وضعیت فعلی قابل انجام نیست.";
    }
    if (status === 413) return "📦 حجم فایل بیشتر از حد مجاز است.";
    if (status === 415) return "📄 فرمت فایل پشتیبانی نمی‌شود.";
    if (status === 422) {
      if (/text is empty/i.test(message)) {
        return "📝 متن پیام نمی‌تواند خالی باشد.";
      }
      if (/text exceeds telegram limit/i.test(message)) {
        return "📝 متن پیام بیشتر از حد مجاز Telegram است.";
      }
      if (/destination not found/i.test(message)) {
        return "🎯 مقصد انتخاب‌شده معتبر نیست.";
      }
      if (/file_path/i.test(message)) {
        return "📎 فایل رسانه برای این عملیات معتبر نیست.";
      }
      return `⚠️ اطلاعات واردشده معتبر نیستند.${message ? `\n${message}` : ""}`;
    }
    if (status >= 500) {
      if (/telegram sync failed/i.test(message)) {
        return "📡 همگام‌سازی Telegram انجام نشد. اتصال اکانت را بررسی کنید.";
      }
      return "⚠️ سرور موقتاً با مشکل مواجه شد. چند لحظه بعد دوباره تلاش کنید.";
    }

    return message || "❌ درخواست انجام نشد.";
  };

  const readJson = async response => {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { detail: text };
    }
  };

  const renew = async () => {
    if (!tg?.initData) {
      throw new Error("Mini App باید از داخل Telegram باز شود.");
    }

    const response = await fetch("/api/webapp/session", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify({ init_data: tg.initData }),
    });

    const data = await readJson(response);

    if (!response.ok || !data.token) {
      throw new Error(
        describeError(response.status, data),
      );
    }

    localStorage.setItem(
      "kronos_self_token",
      data.token,
    );

    return data.token;
  };

  const robustApi = async (
    path,
    options = {},
    canRefresh = true,
  ) => {
    const headers = {
      ...(options.headers || {}),
    };

    const token = localStorage.getItem(
      "kronos_self_token",
    );

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (
      options.body &&
      !(options.body instanceof FormData) &&
      !headers["Content-Type"]
    ) {
      headers["Content-Type"] = "application/json";
    }

    let response;

    try {
      response = await fetch(path, {
        ...options,
        headers,
        cache: "no-store",
      });
    } catch {
      throw new Error(
        "🌐 ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.",
      );
    }

    if (
      response.status === 401 &&
      canRefresh &&
      !path.includes("/api/webapp/session")
    ) {
      await renew();
      return robustApi(path, options, false);
    }

    const data = await readJson(response);

    if (!response.ok) {
      throw new Error(
        describeError(response.status, data),
      );
    }

    return data;
  };

  window.api = robustApi;

  // Fix the historic dashboard crash caused by mismatched DOM ids:
  // HTML contains groups/bots/channels while the old function looked
  // for group/bot/channel.
  window.summary = async () => {
    const data = await robustApi(
      "/api/destinations/summary",
    );

    const counts = data.counts || {};
    const map = {
      pm: ["pm", "kpm"],
      group: ["groups", "kgroup"],
      bot: ["bots", "kbot"],
      channel: ["channels", "kchannel"],
    };

    for (const [kind, ids] of Object.entries(map)) {
      const value = String(Number(counts[kind] || 0));
      ids.forEach(id => {
        const node = el(id);
        if (node) node.textContent = value;
      });
    }

    return data;
  };

  // More defensive destination sync. The backend remains the source
  // of truth; this wrapper refreshes the UI only after a successful sync.
  window.syncDialogs = async () => {
    const button = el("syncBtn");
    const original = button?.innerHTML || "↻ همگام‌سازی";

    if (button) {
      button.disabled = true;
      button.innerHTML =
        '<span class="spinner"></span> در حال همگام‌سازی…';
    }

    try {
      const account = await robustApi(
        "/api/account",
      );

      if (!account.connected) {
        show(
          "🔴 ابتدا اکانت Telegram را متصل کنید.",
          "error",
        );
        return;
      }

      show(
        "📡 در حال دریافت گفتگوهای Telegram…",
        "info",
      );

      const result = await robustApi(
        "/api/dialogs/sync",
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );

      const count = Array.isArray(result.items)
        ? result.items.length
        : 0;

      // Existing loader already knows how to populate the internal S state.
      if (typeof window.loadDestinations === "function") {
        await window.loadDestinations();
      }

      if (typeof window.summary === "function") {
        await window.summary();
      }

      show(
        `✅ ${count} گفتگو با موفقیت همگام شد.`,
        "success",
      );
    } catch (error) {
      console.error(
        "Kronos destination sync failed",
        error,
      );

      show(
        error?.message || "❌ همگام‌سازی انجام نشد.",
        "error",
      );
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = original;
      }
    }
  };

  // Keep the original destination selection logic, but add an unmistakable
  // visual marker to the selected row after it runs.
  const originalChoose = window.choose;
  window.choose = id => {
    if (typeof originalChoose === "function") {
      originalChoose(id);
    }

    document
      .querySelectorAll("#destList .item")
      .forEach(item => item.classList.remove("is-selected"));

    const rows = document.querySelectorAll(
      "#destList .item",
    );

    const selected = [...rows].find(
      row => row.getAttribute("onclick") === `choose(${Number(id)})`,
    );

    if (selected) {
      selected.classList.add("is-selected");
      const stateNode = selected.querySelector(".state");
      if (stateNode) {
        stateNode.textContent = "✓ انتخاب شد";
      }
    }
  };

  const style = document.createElement("style");
  style.textContent = `
    #destList .item.is-selected {
      border-color: rgba(80,212,147,.48) !important;
      background: rgba(80,212,147,.09) !important;
      box-shadow: 0 8px 28px rgba(80,212,147,.08);
    }
    #destList .item.is-selected .state {
      color: #9ff0c7 !important;
    }
  `;
  document.head.appendChild(style);

  // The original boot can execute before this compatibility layer because
  // the project historically embeds all application JS in index.html.
  // Re-run critical reads after the safer functions are installed.
  window.setTimeout(async () => {
    if (!tg?.initData) return;

    try {
      await renew();

      await Promise.allSettled([
        typeof window.loadAccount === "function"
          ? window.loadAccount()
          : Promise.resolve(),
        typeof window.summary === "function"
          ? window.summary()
          : Promise.resolve(),
        typeof window.loadDestinations === "function"
          ? window.loadDestinations()
          : Promise.resolve(),
        typeof window.loadSchedules === "function"
          ? window.loadSchedules()
          : Promise.resolve(),
        typeof window.loadLogs === "function"
          ? window.loadLogs()
          : Promise.resolve(),
        typeof window.health === "function"
          ? window.health()
          : Promise.resolve(),
        typeof window.loadTickets === "function"
          ? window.loadTickets()
          : Promise.resolve(),
      ]);
    } catch (error) {
      console.error(
        "Kronos Mini App recovery bootstrap failed",
        error,
      );
    }
  }, 0);
})();
