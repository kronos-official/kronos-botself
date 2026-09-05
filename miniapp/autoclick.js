(() => {
  "use strict";

  const ACTIONS = [
    {
      value: "فروش ماهی",
      icon: "🐟",
      title: "فروش ماهی",
      description: "اجرای خودکار گزینه فروش ماهی",
    },
    {
      value: "بده پیشی بخوره",
      icon: "🐱",
      title: "بده پیشی بخوره",
      description: "اجرای خودکار گزینه غذا دادن به پیشی",
    },
    {
      value: "بندازش توی یخچال",
      icon: "🧊",
      title: "بندازش توی یخچال",
      description: "اجرای خودکار گزینه قرار دادن در یخچال",
    },
  ];

  const state = {
    config: null,
    groups: [],
    selectedAction: ACTIONS[0].value,
    selectedGroupId: null,
    enabled: false,
    running: false,
    loaded: false,
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const pageElement = () => document.getElementById("kronos-autoclick-page");

  const notify = (message, type = "success") => {
    if (typeof window.notice === "function") {
      window.notice(message, type);
      return;
    }

    const node = document.getElementById("acInlineError");
    if (node) {
      node.textContent = String(message || "عملیات انجام نشد.");
      node.className = `ac-inline-message ${type}`;
      return;
    }

    window.alert(String(message || "عملیات انجام نشد."));
  };

  const api = async (path, options = {}) => {
    if (typeof window.api === "function") {
      return window.api(path, options);
    }

    const headers = { ...(options.headers || {}) };
    const token = localStorage.getItem("kronos_self_token");

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

    const response = await fetch(path, {
      ...options,
      headers,
      cache: "no-store",
    });

    const text = await response.text();
    let data = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { detail: text };
    }

    if (!response.ok) {
      const detail =
        typeof data?.detail === "string"
          ? data.detail
          : "عملیات ناموفق بود.";
      throw new Error(detail);
    }

    return data;
  };

  function injectStyles() {
    if (document.getElementById("kronos-autoclick-styles")) return;

    const style = document.createElement("style");
    style.id = "kronos-autoclick-styles";
    style.textContent = `
      #kronos-autoclick-page {
        display: none;
        margin-top: 10px;
      }

      #kronos-autoclick-page.ac-visible {
        display: block !important;
      }

      .ac-shell {
        background: linear-gradient(180deg, rgba(18,26,39,.98), rgba(10,15,23,.98));
        border: 1px solid rgba(149,168,199,.14);
        border-radius: 22px;
        padding: 15px;
        box-shadow: 0 20px 60px rgba(0,0,0,.34);
      }

      .ac-header {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: flex-start;
        margin-bottom: 14px;
      }

      .ac-title {
        font-size: 16px;
        font-weight: 950;
      }

      .ac-subtitle {
        color: #8290a6;
        font-size: 9px;
        line-height: 1.8;
        margin-top: 5px;
      }

      .ac-status {
        padding: 7px 10px;
        border-radius: 999px;
        font-size: 8px;
        font-weight: 900;
        background: rgba(128,138,153,.10);
        color: #aab4c2;
        border: 1px solid rgba(149,168,199,.15);
        white-space: nowrap;
      }

      .ac-status.on {
        background: rgba(80,212,147,.09);
        color: #9ff0c7;
        border-color: rgba(80,212,147,.18);
      }

      .ac-section {
        margin-top: 14px;
      }

      .ac-label {
        font-size: 9px;
        font-weight: 900;
        margin-bottom: 7px;
      }

      .ac-groups,
      .ac-actions {
        display: grid;
        gap: 7px;
      }

      .ac-group,
      .ac-action {
        width: 100%;
        text-align: right;
        color: #f4f7ff;
        background: #0b111a;
        border: 1px solid rgba(149,168,199,.14);
        border-radius: 15px;
        padding: 11px;
        cursor: pointer;
        font: inherit;
      }

      .ac-group.active,
      .ac-action.active {
        border-color: rgba(102,164,255,.5);
        background: rgba(77,125,255,.12);
      }

      .ac-group-title,
      .ac-action-title {
        font-size: 10px;
        font-weight: 900;
      }

      .ac-group-meta,
      .ac-action-description {
        font-size: 8px;
        color: #8290a6;
        margin-top: 4px;
        line-height: 1.6;
      }

      .ac-action {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .ac-icon {
        width: 38px;
        height: 38px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        background: #152031;
        font-size: 18px;
        flex: none;
      }

      .ac-run,
      .ac-save {
        width: 100%;
        margin-top: 9px;
        padding: 13px;
        border-radius: 14px;
        border: 1px solid rgba(96,143,232,.2);
        color: white;
        font: inherit;
        font-size: 10px;
        font-weight: 950;
        cursor: pointer;
      }

      .ac-run {
        background: linear-gradient(135deg,#4d7ef1,#67a1ff);
      }

      .ac-save {
        background: #172231;
        border-color: rgba(149,168,199,.14);
      }

      .ac-run:disabled,
      .ac-save:disabled {
        opacity: .55;
        cursor: wait;
      }

      .ac-toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 11px;
        border-radius: 15px;
        background: #0b111a;
        border: 1px solid rgba(149,168,199,.14);
      }

      .ac-toggle-copy strong {
        font-size: 10px;
      }

      .ac-toggle-copy small {
        display: block;
        color: #8290a6;
        font-size: 8px;
        margin-top: 4px;
      }

      .ac-switch {
        position: relative;
        width: 44px;
        height: 24px;
        flex: none;
      }

      .ac-switch input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }

      .ac-switch span {
        position: absolute;
        inset: 0;
        border-radius: 999px;
        background: #293444;
        border: 1px solid rgba(255,255,255,.08);
        cursor: pointer;
        transition: .2s;
      }

      .ac-switch span:before {
        content: "";
        position: absolute;
        top: 3px;
        left: 3px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #c7d0dc;
        transition: .2s;
      }

      .ac-switch input:checked + span {
        background: rgba(80,212,147,.25);
        border-color: rgba(80,212,147,.35);
      }

      .ac-switch input:checked + span:before {
        transform: translateX(20px);
        background: #9ff0c7;
      }

      .ac-hint {
        margin-top: 9px;
        padding: 10px;
        border-radius: 13px;
        background: #090e16;
        border: 1px solid rgba(149,168,199,.1);
        color: #8290a6;
        font-size: 8px;
        line-height: 1.8;
      }

      .ac-empty {
        padding: 20px 10px;
        text-align: center;
        color: #8290a6;
        font-size: 9px;
        border: 1px dashed rgba(149,168,199,.14);
        border-radius: 14px;
      }

      .ac-result {
        margin-top: 10px;
        padding: 11px;
        border-radius: 14px;
        background: #0b111a;
        border: 1px solid rgba(149,168,199,.14);
        font-size: 8px;
        line-height: 1.8;
        color: #b8c5d7;
      }

      .ac-result strong {
        color: #9ff0c7;
      }

      .ac-inline-message {
        display: none;
        margin-bottom: 10px;
        padding: 10px 12px;
        border-radius: 13px;
        font-size: 9px;
        line-height: 1.7;
        white-space: pre-wrap;
      }

      .ac-inline-message.error,
      .ac-inline-message.info,
      .ac-inline-message.success {
        display: block;
      }

      .ac-inline-message.error {
        color: #ffacb7;
        background: rgba(139,35,55,.14);
        border: 1px solid rgba(255,111,131,.2);
      }

      .ac-inline-message.info {
        color: #a9c9ff;
        background: rgba(66,112,190,.12);
        border: 1px solid rgba(96,143,232,.2);
      }

      .ac-inline-message.success {
        color: #9cebc3;
        background: rgba(47,130,86,.12);
        border: 1px solid rgba(80,212,147,.18);
      }

      #desktopNav button[data-tab="autoclick"],
      .bottom button[data-tab="autoclick"] {
        color: #8e9bb0;
      }

      #desktopNav button[data-tab="autoclick"].active,
      .bottom button[data-tab="autoclick"].active {
        color: #eff6ff;
        background: rgba(78,125,237,.14);
        border: 1px solid rgba(96,143,232,.2);
      }
    `;

    document.head.appendChild(style);
  }

  function createPage() {
    if (pageElement()) return;

    const main = document.querySelector("main");
    if (!main) {
      console.error("Kronos AutoClick: <main> element not found");
      return;
    }

    const page = document.createElement("section");
    page.id = "kronos-autoclick-page";
    page.className = "page";
    page.style.display = "none";
    page.innerHTML = `
      <div class="ac-shell">
        <div class="ac-header">
          <div>
            <div class="eyebrow">TELEGRAM AUTOCLICK</div>
            <div class="ac-title">⚡ اتوکلیک</div>
            <div class="ac-subtitle">ارسال «میو» و «ماهی» و اجرای خودکار گزینه انتخاب‌شده در @MeowieQBot</div>
          </div>
          <div id="acStatus" class="ac-status">غیرفعال</div>
        </div>

        <div id="acInlineError" class="ac-inline-message" aria-live="polite"></div>

        <div class="ac-section">
          <div class="ac-label">گروه مقصد</div>
          <div id="acGroups" class="ac-groups">
            <div class="ac-empty">برای نمایش گروه‌ها چند لحظه صبر کنید…</div>
          </div>
        </div>

        <div class="ac-section">
          <div class="ac-label">عملیات</div>
          <div id="acActions" class="ac-actions"></div>
        </div>

        <div class="ac-section">
          <div class="ac-toggle-row">
            <div class="ac-toggle-copy">
              <strong>فعال‌سازی اتوکلیک</strong>
              <small>برای اجرای تست و استفاده از تنظیم ذخیره‌شده</small>
            </div>
            <label class="ac-switch">
              <input id="acEnabled" type="checkbox">
              <span></span>
            </label>
          </div>
        </div>

        <button id="acSave" type="button" class="ac-save">💾 ذخیره تنظیمات</button>
        <button id="acRun" type="button" class="ac-run">⚡ اجرای تست</button>
        <div id="acResult" class="ac-result">هنوز اجرایی انجام نشده است.</div>
        <div class="ac-hint">Kronos از User Session همان کاربر استفاده می‌کند، پیام‌های «میو» و «ماهی» را در گروه انتخاب‌شده می‌فرستد، پاسخ @MeowieQBot را پیدا می‌کند و دکمه انتخاب‌شده را کلیک می‌کند.</div>
      </div>
    `;

    main.appendChild(page);
    renderActions();
    bindControls();
    renderState();
  }

  function renderActions() {
    const root = document.getElementById("acActions");
    if (!root) return;

    root.innerHTML = ACTIONS.map((action) => `
      <button
        type="button"
        class="ac-action ${state.selectedAction === action.value ? "active" : ""}"
        data-action="${escapeHtml(action.value)}"
      >
        <span class="ac-icon">${action.icon}</span>
        <span>
          <span class="ac-action-title">${escapeHtml(action.title)}</span>
          <span class="ac-action-description">${escapeHtml(action.description)}</span>
        </span>
      </button>
    `).join("");

    root.querySelectorAll(".ac-action").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedAction = button.dataset.action || ACTIONS[0].value;
        renderActions();
      });
    });
  }

  function destinationIdentity(group) {
    return Number(
      group?.id ??
      group?.destination_id ??
      group?.telegram_peer_id ??
      group?.peer_id,
    );
  }

  function configGroupMatchesDestination(group, configuredGroup) {
    if (!group || !configuredGroup) return false;

    const configuredPeer = Number(configuredGroup.peer_id);
    const telegramPeer = Number(group.telegram_peer_id ?? group.peer_id);

    if (
      Number.isFinite(configuredPeer) &&
      Number.isFinite(telegramPeer) &&
      configuredPeer === telegramPeer
    ) {
      return true;
    }

    return (
      String(group.title || "") === String(configuredGroup.title || "") &&
      String(group.username || "") === String(configuredGroup.username || "")
    );
  }

  function renderGroups() {
    const root = document.getElementById("acGroups");
    if (!root) return;

    if (!state.groups.length) {
      root.innerHTML = `
        <div class="ac-empty">
          هیچ گروه فعالی پیدا نشد.<br>
          ابتدا از بخش «مقصدها» گفتگوها را همگام‌سازی کنید.
        </div>
      `;
      return;
    }

    root.innerHTML = state.groups.map((group) => {
      const destinationId = destinationIdentity(group);
      const active = Number(state.selectedGroupId) === destinationId;
      const username = group.username
        ? `@${escapeHtml(group.username)}`
        : "گروه Telegram";

      return `
        <button
          type="button"
          class="ac-group ${active ? "active" : ""}"
          data-id="${escapeHtml(destinationId)}"
        >
          <div class="ac-group-title">${escapeHtml(group.title || "گروه بدون نام")}</div>
          <div class="ac-group-meta">${username}</div>
        </button>
      `;
    }).join("");

    root.querySelectorAll(".ac-group").forEach((button) => {
      button.addEventListener("click", () => {
        const id = Number(button.dataset.id);
        if (!Number.isFinite(id)) return;
        state.selectedGroupId = id;
        renderGroups();
        renderState();
      });
    });
  }

  function renderState() {
    const status = document.getElementById("acStatus");
    const enabled = document.getElementById("acEnabled");
    const run = document.getElementById("acRun");
    const save = document.getElementById("acSave");

    if (status) {
      status.textContent = state.enabled ? "فعال" : "غیرفعال";
      status.classList.toggle("on", state.enabled);
    }

    if (enabled) {
      enabled.checked = state.enabled;
    }

    if (run) {
      run.disabled =
        state.running ||
        !Number.isFinite(Number(state.selectedGroupId)) ||
        !state.enabled;
    }

    if (save) {
      save.disabled = state.running;
    }
  }

  async function load() {
    createPage();

    if (state.loaded) {
      renderGroups();
      renderState();
      return;
    }

    const inline = document.getElementById("acInlineError");
    if (inline) {
      inline.className = "ac-inline-message info";
      inline.textContent = "در حال دریافت تنظیمات و گروه‌ها…";
    }

    try {
      const [config, groupsResponse] = await Promise.all([
        api("/api/autoclick"),
        api("/api/destinations?kind=group"),
      ]);

      const items = Array.isArray(groupsResponse)
        ? groupsResponse
        : Array.isArray(groupsResponse?.items)
          ? groupsResponse.items
          : [];

      state.config = config || {};
      state.groups = items;
      state.selectedAction =
        ACTIONS.some((action) => action.value === config?.selected_action)
          ? config.selected_action
          : ACTIONS[0].value;
      state.selectedGroupId = null;

      if (config?.group) {
        const matched = items.find((group) =>
          configGroupMatchesDestination(group, config.group),
        );

        if (matched) {
          state.selectedGroupId = destinationIdentity(matched);
        }
      }

      state.enabled = Boolean(config?.enabled && config?.configured);
      state.loaded = true;

      renderActions();
      renderGroups();
      renderState();

      if (inline) {
        inline.className = "ac-inline-message";
        inline.textContent = "";
      }
    } catch (error) {
      console.error("AutoClick load failed", error);
      state.loaded = false;
      state.config = null;
      state.groups = [];
      renderGroups();
      renderState();

      if (inline) {
        inline.className = "ac-inline-message error";
        inline.textContent = error?.message || "بارگذاری اتوکلیک انجام نشد.";
      } else {
        notify(error?.message || "بارگذاری اتوکلیک انجام نشد.", "error");
      }
    }
  }

  async function save() {
    if (!Number.isFinite(Number(state.selectedGroupId))) {
      throw new Error("ابتدا یک گروه مقصد انتخاب کنید.");
    }

    const config = await api("/api/autoclick", {
      method: "PUT",
      body: JSON.stringify({
        group_destination_id: Number(state.selectedGroupId),
        enabled: Boolean(state.enabled),
        selected_action: state.selectedAction,
      }),
    });

    state.config = config;
    state.enabled = Boolean(config?.enabled && config?.configured);
    renderState();

    const inline = document.getElementById("acInlineError");
    if (inline) {
      inline.className = "ac-inline-message success";
      inline.textContent = "✅ تنظیمات اتوکلیک با موفقیت ذخیره شد.";
      window.setTimeout(() => {
        if (inline.textContent.includes("تنظیمات اتوکلیک")) {
          inline.className = "ac-inline-message";
          inline.textContent = "";
        }
      }, 3000);
    }
  }

  async function run() {
    if (state.running) return;

    if (!Number.isFinite(Number(state.selectedGroupId))) {
      notify("ابتدا گروه مقصد را انتخاب کنید.", "error");
      return;
    }

    if (!state.enabled) {
      notify("ابتدا اتوکلیک را فعال کنید.", "error");
      return;
    }

    const runButton = document.getElementById("acRun");
    const resultRoot = document.getElementById("acResult");

    state.running = true;
    renderState();

    if (runButton) {
      runButton.textContent = "⏳ در حال اجرا…";
    }

    if (resultRoot) {
      resultRoot.textContent = "در حال ارسال میو و ماهی و انتظار برای منوی @MeowieQBot…";
    }

    try {
      const result = await api("/api/autoclick/execute", {
        method: "POST",
        body: JSON.stringify({
          action: state.selectedAction,
        }),
      });

      if (resultRoot) {
        resultRoot.innerHTML = `
          <strong>✅ اجرا با موفقیت انجام شد.</strong><br>
          عملیات: ${escapeHtml(result?.action || state.selectedAction)}<br>
          دکمه کلیک‌شده: ${escapeHtml(result?.clicked_button || "—")}<br>
          زمان اجرا: ${escapeHtml(result?.elapsed_ms ?? "—")} ms
        `;
      }

      const inline = document.getElementById("acInlineError");
      if (inline) {
        inline.className = "ac-inline-message success";
        inline.textContent = "✅ AutoClick با موفقیت اجرا شد.";
      }
    } catch (error) {
      console.error("AutoClick execution failed", error);

      if (resultRoot) {
        resultRoot.textContent = error?.message || "اجرای اتوکلیک ناموفق بود.";
      }

      const inline = document.getElementById("acInlineError");
      if (inline) {
        inline.className = "ac-inline-message error";
        inline.textContent = error?.message || "اجرای اتوکلیک ناموفق بود.";
      }
    } finally {
      state.running = false;
      renderState();
      if (runButton) {
        runButton.textContent = "⚡ اجرای تست";
      }
    }
  }

  function bindControls() {
    const enabled = document.getElementById("acEnabled");
    const saveButton = document.getElementById("acSave");
    const runButton = document.getElementById("acRun");

    enabled?.addEventListener("change", () => {
      state.enabled = Boolean(enabled.checked);
      renderState();
    });

    saveButton?.addEventListener("click", async () => {
      if (state.running) return;

      try {
        await save();
      } catch (error) {
        console.error("AutoClick save failed", error);
        const inline = document.getElementById("acInlineError");
        if (inline) {
          inline.className = "ac-inline-message error";
          inline.textContent = error?.message || "ذخیره تنظیمات ناموفق بود.";
        } else {
          notify(error?.message || "ذخیره تنظیمات ناموفق بود.", "error");
        }
      }
    });

    runButton?.addEventListener("click", run);
  }

  function ensureNavButton(container) {
    if (!container) return;
    if (container.querySelector('[data-tab="autoclick"]')) return;

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.tab = "autoclick";
    button.innerHTML = "<span>⚡</span>اتوکلیک";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showAutoclickTab();
    });
    container.appendChild(button);
  }

  function showAutoclickTab() {
    createPage();

    const page = pageElement();
    if (!page) return;

    document.querySelectorAll("main > .page").forEach((item) => {
      item.classList.remove("active");
      if (item !== page) {
        item.style.removeProperty("display");
      }
    });

    page.classList.add("active");
    page.classList.add("ac-visible");
    page.style.setProperty("display", "block", "important");

    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === "autoclick");
    });

    load();
  }

  function installShowTabBridge() {
    const current = window.showTab;

    if (current && current.__kronosAutoclickBridge) return;

    const bridge = function (tab) {
      if (tab === "autoclick") {
        showAutoclickTab();
        return;
      }

      const page = pageElement();
      if (page) {
        page.classList.remove("active", "ac-visible");
        page.style.setProperty("display", "none", "important");
      }

      document.querySelectorAll('[data-tab="autoclick"]').forEach((button) => {
        button.classList.remove("active");
      });

      if (typeof current === "function") {
        return current.call(window, tab);
      }
    };

    bridge.__kronosAutoclickBridge = true;
    window.showTab = bridge;
  }

  function boot() {
    try {
      injectStyles();
      createPage();

      ensureNavButton(document.getElementById("desktopNav"));
      ensureNavButton(document.querySelector(".bottom"));
      installShowTabBridge();

      window.setTimeout(installShowTabBridge, 100);
      window.setTimeout(installShowTabBridge, 500);
      window.setTimeout(installShowTabBridge, 1500);

      console.info("Kronos AutoClick UI initialized");
    } catch (error) {
      console.error("Kronos AutoClick bootstrap failed", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
