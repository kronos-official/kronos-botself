(() => {
  "use strict";

  const tg = window.Telegram?.WebApp;
  const S = window.S;

  function el(id) {
    return document.getElementById(id);
  }

  function safeNotice(message, type = "error") {
    if (typeof window.notice === "function") {
      window.notice(message, type);
      return;
    }

    const node = el("notice");
    if (!node) return;

    node.textContent = String(message || "خطای نامشخص");
    node.className = `notice show ${type}`;
    window.setTimeout(() => node.classList.remove("show"), 4500);
  }

  function parseErrorBody(data, status) {
    if (!data) return `HTTP ${status}`;

    if (typeof data.detail === "string") {
      return data.detail;
    }

    if (Array.isArray(data.detail)) {
      const messages = data.detail
        .map(item => {
          if (!item) return "";
          if (typeof item === "string") return item;

          const field = Array.isArray(item.loc)
            ? item.loc.filter(Boolean).join(" → ")
            : "";
          const msg = item.msg || item.message || "Invalid value";

          if (field) {
            return `${field}: ${msg}`;
          }

          return msg;
        })
        .filter(Boolean);

      if (messages.length) {
        return messages.join("\n");
      }
    }

    if (data.detail && typeof data.detail === "object") {
      if (typeof data.detail.message === "string") {
        return data.detail.message;
      }

      if (typeof data.detail.error === "string") {
        return data.detail.error;
      }
    }

    if (typeof data.message === "string") {
      return data.message;
    }

    return `HTTP ${status}`;
  }

  function friendlyError(status, message) {
    const text = String(message || "");

    if (status === 401) {
      return "🔐 نشست شما منقضی شده است. در حال احراز هویت مجدد…";
    }

    if (status === 403) {
      return "⛔ دسترسی به این عملیات مجاز نیست.";
    }

    if (status === 404) {
      return "🔎 مورد درخواستی پیدا نشد یا دیگر در دسترس نیست.";
    }

    if (status === 409) {
      if (/not connected/i.test(text)) {
        return "🔴 ابتدا اکانت Telegram را متصل کنید.";
      }
      return text || "⚠️ این عملیات با وضعیت فعلی قابل انجام نیست.";
    }

    if (status === 413) {
      return "📦 حجم فایل بیشتر از حد مجاز است.";
    }

    if (status === 415) {
      return "📄 فرمت این فایل پشتیبانی نمی‌شود.";
    }

    if (status === 422) {
      if (/text is empty/i.test(text)) {
        return "📝 متن پیام نمی‌تواند خالی باشد.";
      }

      if (/text exceeds telegram limit/i.test(text)) {
        return "📝 متن پیام بیشتر از حد مجاز Telegram است.";
      }

      if (/destination not found/i.test(text)) {
        return "🎯 مقصد انتخاب‌شده معتبر نیست. دوباره مقصد را انتخاب کنید.";
      }

      if (/media schedule requires file_path/i.test(text)) {
        return "📎 فایل رسانه برای این زمان‌بندی انتخاب نشده است.";
      }

      return `⚠️ اطلاعات واردشده معتبر نیستند.\n${text}`;
    }

    if (status >= 500) {
      if (/telegram sync failed/i.test(text)) {
        return "📡 همگام‌سازی Telegram انجام نشد. اتصال اکانت را بررسی کنید و دوباره تلاش کنید.";
      }

      return "⚠️ سرویس موقتاً با مشکل مواجه شد. چند لحظه بعد دوباره تلاش کنید.";
    }

    return text || "❌ درخواست انجام نشد.";
  }

  async function parseResponse(response) {
    const text = await response.text();

    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      return { detail: text };
    }
  }

  async function renewSession() {
    if (!tg?.initData) {
      throw new Error("Mini App باید از داخل Telegram باز شود.");
    }

    const response = await fetch("/api/webapp/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      cache: "no-store",
      body: JSON.stringify({
        init_data: tg.initData,
      }),
    });

    const data = await parseResponse(response);

    if (!response.ok || !data.token) {
      throw new Error(
        friendlyError(
          response.status,
          parseErrorBody(data, response.status),
        ),
      );
    }

    if (window.S) {
      window.S.token = data.token;
      window.S.user = data.user || window.S.user || null;
    }

    localStorage.setItem(
      "kronos_self_token",
      data.token,
    );

    if (typeof window.paintUser === "function") {
      window.paintUser();
    }

    return data.token;
  }

  async function robustApi(path, options = {}, allowRefresh = true) {
    const request = {
      ...options,
      headers: {
        ...(options.headers || {}),
      },
      cache: "no-store",
    };

    if (window.S?.token) {
      request.headers.Authorization = `Bearer ${window.S.token}`;
    }

    if (
      request.body &&
      !(request.body instanceof FormData) &&
      !request.headers["Content-Type"]
    ) {
      request.headers["Content-Type"] = "application/json";
    }

    let response;

    try {
      response = await fetch(path, request);
    } catch {
      throw new Error("🌐 ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.");
    }

    if (response.status === 401 && allowRefresh && !path.includes("/api/webapp/session")) {
      try {
        await renewSession();
      } catch (error) {
        throw error instanceof Error
          ? error
          : new Error("🔐 نشست شما منقضی شده است.");
      }

      return robustApi(path, options, false);
    }

    const data = await parseResponse(response);

    if (!response.ok) {
      throw new Error(
        friendlyError(
          response.status,
          parseErrorBody(data, response.status),
        ),
      );
    }

    return data;
  }

  window.api = robustApi;

  window.summary = async function summary() {
    const data = await robustApi(
      "/api/destinations/summary",
    );

    const counts = data.counts || {};

    const mapping = {
      pm: ["pm", "kpm"],
      group: ["groups", "kgroup"],
      bot: ["bots", "kbot"],
      channel: ["channels", "kchannel"],
    };

    for (const [kind, ids] of Object.entries(mapping)) {
      const value = Number(counts[kind] || 0);

      for (const id of ids) {
        const node = el(id);
        if (node) {
          node.textContent = String(value);
        }
      }
    }

    return data;
  };

  window.syncDialogs = async function syncDialogs() {
    const button = el("syncBtn");
    const original = button?.innerHTML || "↻ همگام‌سازی";

    if (button) {
      button.disabled = true;
      button.innerHTML = '<span class="spinner"></span> در حال همگام‌سازی…';
    }

    try {
      const account = await robustApi("/api/account");

      if (!account.connected) {
        safeNotice(
          "🔴 ابتدا اکانت Telegram را از طریق Bot متصل کنید.",
          "error",
        );
        return;
      }

      safeNotice(
        "در حال دریافت گفتگوهای Telegram…",
        "info",
      );

      const data = await robustApi(
        "/api/dialogs/sync",
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );

      const items = Array.isArray(data.items)
        ? data.items
        : [];

      if (window.S) {
        window.S.dests = items.map(item => ({
          ...item,
          id: Number(item.id),
        }));
        window.S.selected = null;
      }

      await Promise.allSettled([
        typeof window.summary === "function"
          ? window.summary()
          : Promise.resolve(),
        typeof window.loadDestinations === "function"
          ? window.loadDestinations()
          : Promise.resolve(),
      ]);

      safeNotice(
        `✅ ${items.length} گفتگو با موفقیت همگام شد.`,
        "success",
      );

      if (typeof window.kind === "function") {
        window.kind(window.S?.kind || "pm");
      }

      return data;
    } catch (error) {
      console.error("Kronos sync failed:", error);
      safeNotice(
        `❌ همگام‌سازی ناموفق بود.\n${error?.message || "خطای ناشناخته"}`,
        "error",
      );
      throw error;
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = original;
      }
    }
  };

  window.choose = function choose(id) {
    const destinations = window.S?.dests || [];
    const selected = destinations.find(
      item => Number(item.id) === Number(id),
    );

    if (!selected) {
      safeNotice(
        "🔎 مقصد پیدا نشد. دوباره همگام‌سازی کنید.",
        "error",
      );
      return;
    }

    if (window.S) {
      window.S.selected = selected;
    }

    const selectedBox = el("selected");

    if (selectedBox) {
      selectedBox.innerHTML = `
        <div class="selected-destination-card">
          <div class="selected-check">✓</div>
          <div class="icon">${selected.kind === "bot" ? "🤖" : selected.kind === "group" ? "👥" : selected.kind === "channel" ? "📢" : "💬"}</div>
          <div class="main">
            <div class="title">${escapeHtml(selected.title || "بدون عنوان")}</div>
            <div class="meta">${escapeHtml(selected.username ? "@" + selected.username : selected.peer_id || "—")}</div>
            <div class="selected-label">✓ این مقصد برای Scheduler انتخاب شده است</div>
          </div>
        </div>
      `;
    }

    if (typeof window.populateDestSelect === "function") {
      window.populateDestSelect();
    }

    const destination = el("scheduleDestination");
    if (destination) {
      destination.value = String(selected.id);
    }

    if (typeof window.preview === "function") {
      window.preview();
    }

    safeNotice(
      `✅ «${selected.title || "مقصد"}» انتخاب شد.`,
      "success",
    );
  };

  window.createSchedule = async function createSchedule() {
    const button = el("createBtn");
    const status = el("createStatus");

    if (button) {
      button.disabled = true;
    }

    if (status) {
      status.textContent = "Creating";
    }

    try {
      const destinationNode = el("scheduleDestination");
      const destinationId = Number(
        destinationNode?.value || 0,
      );

      if (!destinationId) {
        throw new Error("🎯 ابتدا یک مقصد انتخاب کنید.");
      }

      if (!window.S?.account?.connected) {
        const account = await robustApi("/api/account");
        window.S.account = account;

        if (!account.connected) {
          throw new Error(
            "🔴 ابتدا اکانت Telegram را متصل کنید.",
          );
        }
      }

      const contentType = el("contentType")?.value || "text";
      const scheduleType = el("scheduleType")?.value || "once";
      const firstRunRaw = el("firstRun")?.value || "";

      const payload = {
        type: contentType,
      };

      if (contentType === "text") {
        const text = (el("textInput")?.value || "").trim();

        if (!text) {
          throw new Error("📝 متن پیام خالی است.");
        }

        if (text.length > 4096) {
          throw new Error("📝 متن پیام بیشتر از 4096 کاراکتر است.");
        }

        payload.text = text;
      } else {
        const file = el("mediaInput")?.files?.[0];

        if (!file) {
          throw new Error("📎 ابتدا فایل رسانه را انتخاب کنید.");
        }

        const formData = new FormData();
        formData.append("file", file);

        const uploaded = await robustApi(
          "/api/media",
          {
            method: "POST",
            body: formData,
          },
        );

        if (!uploaded.path) {
          throw new Error("آپلود فایل مسیر معتبر برنگرداند.");
        }

        payload.file_path = uploaded.path;
        payload.caption = (
          el("captionInput")?.value || ""
        ).trim();
      }

      const body = {
        destination_id: destinationId,
        content_type: contentType,
        payload,
        schedule_type: scheduleType,
        first_run_at: firstRunRaw
          ? new Date(firstRunRaw).toISOString()
          : null,
      };

      if (scheduleType === "interval") {
        const seconds = Number(
          el("interval")?.value || 0,
        );

        if (!Number.isInteger(seconds) || seconds < 60) {
          throw new Error("⏱ فاصله باید حداقل 60 ثانیه باشد.");
        }

        body.interval_seconds = seconds;
      } else {
        body.interval_seconds = null;
      }

      if (scheduleType === "weekly") {
        body.weekday = Number(
          el("weekday")?.value || 0,
        );
      } else {
        body.weekday = null;
      }

      if (
        scheduleType === "daily" ||
        scheduleType === "weekly"
      ) {
        const runTime = el("runTime")?.value || "";

        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(runTime)) {
          throw new Error("🕒 ساعت اجرا معتبر نیست.");
        }

        body.run_time = runTime;
      } else {
        body.run_time = null;
      }

      const created = await robustApi(
        "/api/schedules",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );

      if (status) {
        status.textContent = "Saved";
      }

      safeNotice(
        `✅ زمان‌بندی #${created.id} با موفقیت ساخته شد.`,
        "success",
      );

      if (typeof window.loadSchedules === "function") {
        await window.loadSchedules();
      }

      return created;
    } catch (error) {
      if (status) {
        status.textContent = "Error";
      }

      console.error("Kronos schedule creation failed:", error);

      safeNotice(
        `❌ ساخت زمان‌بندی انجام نشد.\n${error?.message || "خطای ناشناخته"}`,
        "error",
      );

      throw error;
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  };

  window.toggleAuto = function toggleAuto() {
    if (!window.S) return;

    window.S.auto = !window.S.auto;

    const node = el("auto");
    if (node) {
      node.textContent = window.S.auto
        ? "فعال"
        : "خاموش";
    }

    clearInterval(window.S.timer);

    if (window.S.auto) {
      window.S.timer = window.setInterval(() => {
        Promise.allSettled([
          typeof window.loadAccount === "function"
            ? window.loadAccount()
            : Promise.resolve(),
          typeof window.loadSchedules === "function"
            ? window.loadSchedules()
            : Promise.resolve(),
          typeof window.loadLogs === "function"
            ? window.loadLogs()
            : Promise.resolve(),
        ]);
      }, 45000);
    }
  };

  const style = document.createElement("style");
  style.textContent = `
    .selected-destination-card {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px;
      border-radius: 16px;
      background: rgba(80, 212, 147, 0.08);
      border: 1px solid rgba(80, 212, 147, 0.35);
      box-shadow: 0 12px 35px rgba(0,0,0,.18);
    }
    .selected-check {
      position: absolute;
      inset-inline-start: 10px;
      top: 10px;
      width: 24px;
      height: 24px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: rgba(80, 212, 147, 0.18);
      color: #9aefc3;
      font-weight: 900;
    }
    .selected-label {
      margin-top: 5px;
      color: #9aefc3;
      font-size: 8px;
      font-weight: 800;
    }
    .item.is-selected {
      border-color: rgba(80, 212, 147, 0.42) !important;
      background: rgba(80, 212, 147, 0.08) !important;
      box-shadow: 0 10px 28px rgba(80,212,147,.08);
    }
    .item.is-selected .state::after {
      content: " ✓";
    }
  `;
  document.head.appendChild(style);

  window.addEventListener("error", event => {
    if (String(event.message || "").includes("Cannot set properties of null")) {
      console.error("[Kronos] DOM null assignment:", event.error || event);
      safeNotice(
        "⚠️ رابط رابطۀ داخلی صفحه با یک عنصر UI از دست رفته بود؛ صفحه را تازه‌سازی کنید.",
        "error",
      );
    }
  });
})();
