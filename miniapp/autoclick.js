(() => {
  "use strict";

  const ACTIONS = Object.freeze([
    {
      value: "فروش ماهی",
      icon: "🐟",
      title: "فروش ماهی",
      description: "اجرای گزینه فروش ماهی",
    },
    {
      value: "بده پیشی بخوره",
      icon: "🐱",
      title: "بده پیشی بخوره",
      description: "اجرای گزینه غذا دادن به پیشی",
    },
    {
      value: "بندازش توی یخچال",
      icon: "🧊",
      title: "بندازش توی یخچال",
      description: "اجرای گزینه قرار دادن در یخچال",
    },
  ]);

  const state = {
    setting: null,
    groups: [],
    selectedGroupDestinationId: null,
    selectedAction: ACTIONS[0].value,
    enabled: false,
    loading: false,
    running: false,
    initialized: false,
  };

  const byId = (id) => document.getElementById(id);
  const root = () => byId("kronos-autoclick-root");

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function notify(text, type = "info") {
    const local = byId("acMessage");

    if (local) {
      local.textContent = String(text || "");
      local.className = `ac-message ${type}`;
    }

    if (typeof window.notice === "function" && text) {
      try {
        window.notice(String(text), type);
      } catch (error) {
        console.debug("Kronos AutoClick notice fallback failed", error);
      }
    }
  }

  async function api(path, options = {}) {
    if (typeof window.api === "function") {
      return window.api(path, options);
    }

    const headers = {
      ...(options.headers || {}),
    };

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

    let response;
    try {
      response = await fetch(path, {
        ...options,
        headers,
        cache: "no-store",
      });
    } catch (error) {
      throw new Error("ارتباط با سرور برقرار نشد.");
    }

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
          : typeof data?.message === "string"
            ? data.message
            : "درخواست ناموفق بود.";
      throw new Error(detail);
    }

    return data;
  }

  function injectStyles() {
    if (byId("kronos-autoclick-styles")) return;

    const style = document.createElement("style");
    style.id = "kronos-autoclick-styles";
    style.textContent = `
      /* AutoClick is intentionally isolated from the dashboard .page system. */
      #kronos-autoclick-root {
        display: none !important;
        position: relative !important;
        width: 100% !important;
        max-width: 1120px !important;
        margin: 0 auto 110px !important;
        padding: 0 !important;
        box-sizing: border-box !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        z-index: 60 !important;
      }

      #kronos-autoclick-root.ac-open {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        pointer-events: auto !important;
      }

      #kronos-autoclick-root,
      #kronos-autoclick-root * {
        box-sizing: border-box;
      }

      #kronos-autoclick-root .ac-shell {
        width: 100%;
        min-height: 280px;
        padding: 16px;
        border-radius: 24px;
        border: 1px solid rgba(149,168,199,.16);
        background:
          radial-gradient(600px 220px at 100% 0%, rgba(77,126,241,.12), transparent 65%),
          linear-gradient(180deg, rgba(18,26,39,.985), rgba(8,13,21,.99));
        box-shadow: 0 24px 70px rgba(0,0,0,.38);
        overflow: hidden;
      }

      #kronos-autoclick-root .ac-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }

      #kronos-autoclick-root .ac-title {
        margin-top: 3px;
        font-size: 20px;
        line-height: 1.3;
        font-weight: 950;
      }

      #kronos-autoclick-root .ac-subtitle {
        margin-top: 6px;
        color: #8290a6;
        font-size: 9px;
        line-height: 1.9;
      }

      #kronos-autoclick-root .ac-status {
        flex: none;
        padding: 7px 10px;
        border-radius: 999px;
        color: #aab4c2;
        background: rgba(128,138,153,.10);
        border: 1px solid rgba(149,168,199,.15);
        font-size: 8px;
        font-weight: 900;
      }

      #kronos-autoclick-root .ac-status.on {
        color: #9ff0c7;
        background: rgba(80,212,147,.09);
        border-color: rgba(80,212,147,.22);
      }

      #kronos-autoclick-root .ac-message {
        display: none;
        margin-bottom: 10px;
        padding: 10px 12px;
        border-radius: 14px;
        font-size: 9px;
        line-height: 1.8;
        white-space: pre-wrap;
      }

      #kronos-autoclick-root .ac-message.info,
      #kronos-autoclick-root .ac-message.success,
      #kronos-autoclick-root .ac-message.error {
        display: block;
      }

      #kronos-autoclick-root .ac-message.info {
        color: #add0ff;
        background: rgba(77,125,255,.10);
        border: 1px solid rgba(102,164,255,.18);
      }

      #kronos-autoclick-root .ac-message.success {
        color: #9cebc3;
        background: rgba(80,212,147,.08);
        border: 1px solid rgba(80,212,147,.18);
      }

      #kronos-autoclick-root .ac-message.error {
        color: #ffabb8;
        background: rgba(139,35,55,.13);
        border: 1px solid rgba(255,111,131,.20);
      }

      #kronos-autoclick-root .ac-section {
        margin-top: 15px;
      }

      #kronos-autoclick-root .ac-label {
        margin-bottom: 7px;
        font-size: 9px;
        font-weight: 950;
      }

      #kronos-autoclick-root .ac-groups,
      #kronos-autoclick-root .ac-actions {
        display: grid;
        gap: 8px;
      }

      #kronos-autoclick-root .ac-group,
      #kronos-autoclick-root .ac-action,
      #kronos-autoclick-root .ac-button {
        appearance: none;
        -webkit-appearance: none;
        font: inherit;
      }

      #kronos-autoclick-root .ac-group,
      #kronos-autoclick-root .ac-action {
        width: 100%;
        color: #f4f7ff;
        text-align: right;
        background: #0b111a;
        border: 1px solid rgba(149,168,199,.14);
        border-radius: 16px;
        cursor: pointer;
      }

      #kronos-autoclick-root .ac-group {
        padding: 12px;
      }

      #kronos-autoclick-root .ac-group.active,
      #kronos-autoclick-root .ac-action.active {
        border-color: rgba(102,164,255,.5);
        background: rgba(77,125,255,.12);
        box-shadow: 0 10px 28px rgba(45,91,175,.10);
      }

      #kronos-autoclick-root .ac-group-title,
      #kronos-autoclick-root .ac-action-title {
        font-size: 10px;
        font-weight: 900;
      }

      #kronos-autoclick-root .ac-group-meta,
      #kronos-autoclick-root .ac-action-description {
        display: block;
        margin-top: 4px;
        color: #8290a6;
        font-size: 8px;
        line-height: 1.65;
      }

      #kronos-autoclick-root .ac-action {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px;
      }

      #kronos-autoclick-root .ac-icon {
        width: 40px;
        height: 40px;
        flex: none;
        display: grid;
        place-items: center;
        border-radius: 13px;
        background: #152031;
        font-size: 19px;
      }

      #kronos-autoclick-root .ac-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px;
        border-radius: 16px;
        background: #0b111a;
        border: 1px solid rgba(149,168,199,.14);
      }

      #kronos-autoclick-root .ac-toggle strong {
        font-size: 10px;
      }

      #kronos-autoclick-root .ac-toggle small {
        display: block;
        margin-top: 4px;
        color: #8290a6;
        font-size: 8px;
        line-height: 1.6;
      }

      #kronos-autoclick-root .ac-switch {
        position: relative;
        width: 48px;
        height: 26px;
        flex: none;
      }

      #kronos-autoclick-root .ac-switch input {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      }

      #kronos-autoclick-root .ac-switch span {
        position: absolute;
        inset: 0;
        border-radius: 999px;
        background: #293444;
        border: 1px solid rgba(255,255,255,.08);
        cursor: pointer;
      }

      #kronos-autoclick-root .ac-switch span::before {
        content: "";
        position: absolute;
        top: 3px;
        left: 3px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #c7d0dc;
        transition: transform .18s ease, background .18s ease;
      }

      #kronos-autoclick-root .ac-switch input:checked + span {
        background: rgba(80,212,147,.25);
        border-color: rgba(80,212,147,.35);
      }

      #kronos-autoclick-root .ac-switch input:checked + span::before {
        transform: translateX(21px);
        background: #9ff0c7;
      }

      #kronos-autoclick-root .ac-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-top: 10px;
      }

      #kronos-autoclick-root .ac-button {
        width: 100%;
        padding: 13px;
        border-radius: 14px;
        border: 1px solid rgba(96,143,232,.20);
        color: white;
        cursor: pointer;
        font-size: 10px;
        font-weight: 950;
      }

      #kronos-autoclick-root .ac-button.primary {
        background: linear-gradient(135deg,#4d7ef1,#67a1ff);
      }

      #kronos-autoclick-root .ac-button.secondary {
        background: #172231;
        border-color: rgba(149,168,199,.14);
      }

      #kronos-autoclick-root .ac-button:disabled {
        opacity: .55;
        cursor: wait;
      }

      #kronos-autoclick-root .ac-result,
      #kronos-autoclick-root .ac-empty {
        padding: 12px;
        border-radius: 14px;
        background: #0b111a;
        border: 1px solid rgba(149,168,199,.12);
        color: #b8c5d7;
        font-size: 8px;
        line-height: 1.8;
      }

      #kronos-autoclick-root .ac-empty {
        text-align: center;
        color: #8290a6;
      }

      #kronos-autoclick-root .ac-result strong {
        color: #9cebc3;
      }

      #kronos-autoclick-root .ac-note {
        margin-top: 10px;
        padding: 10px;
        border-radius: 13px;
        background: #090e16;
        border: 1px solid rgba(149,168,199,.10);
        color: #8290a6;
        font-size: 8px;
        line-height: 1.8;
      }

      #desktopNav {
        grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
      }

      #desktopNav button[data-tab="autoclick"],
      .bottom button[data-tab="autoclick"] {
        color: #8e9bb0;
      }

      #desktopNav button[data-tab="autoclick"].active,
      .bottom button[data-tab="autoclick"].active {
        color: #eff6ff;
        background: rgba(78,125,237,.14);
        border: 1px solid rgba(96,143,232,.20);
      }

      .bottom {
        grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
      }

      @media (max-width: 640px) {
        #kronos-autoclick-root .ac-buttons {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureRoot() {
    let node = root();
    if (node) return node;

    node = document.createElement("section");
    node.id = "kronos-autoclick-root";
    node.setAttribute("aria-label", "AutoClick");
    node.innerHTML = `
      <div class="ac-shell">
        <div class="ac-header">
          <div>
            <div class="eyebrow">TELEGRAM AUTOCLICK</div>
            <div class="ac-title">⚡ اتوکلیک</div>
            <div class="ac-subtitle">ارسال «میو» و «ماهی» و سپس اجرای خودکار گزینه انتخاب‌شده در @MeowieQBot.</div>
          </div>
          <div id="acStatus" class="ac-status">غیرفعال</div>
        </div>

        <div id="acMessage" class="ac-message" aria-live="polite"></div>

        <div class="ac-section">
          <div class="ac-label">گروه مقصد</div>
          <div id="acGroups" class="ac-groups">
            <div class="ac-empty">در حال دریافت گروه‌ها…</div>
          </div>
        </div>

        <div class="ac-section">
          <div class="ac-label">عملیات</div>
          <div id="acActions" class="ac-actions"></div>
        </div>

        <div class="ac-section">
          <div class="ac-toggle">
            <div>
              <strong>فعال‌سازی اتوکلیک</strong>
              <small>پس از انتخاب گروه و عملیات، تنظیمات را ذخیره کنید.</small>
            </div>
            <label class="ac-switch">
              <input id="acEnabled" type="checkbox" aria-label="فعال‌سازی اتوکلیک">
              <span></span>
            </label>
          </div>
        </div>

        <div class="ac-buttons">
          <button id="acSave" type="button" class="ac-button secondary">💾 ذخیره تنظیمات</button>
          <button id="acRun" type="button" class="ac-button primary">⚡ اجرای تست</button>
        </div>

        <div id="acResult" class="ac-result">هنوز اجرایی انجام نشده است.</div>
        <div class="ac-note">Kronos از User Session کاربر استفاده می‌کند، پیام‌های موردنیاز را در گروه انتخاب‌شده می‌فرستد، پاسخ @MeowieQBot را پیدا می‌کند و دکمه انتخاب‌شده را کلیک می‌کند.</div>
      </div>
    `;

    // Put the standalone panel directly under the app so the normal page/tab
    // CSS can never accidentally hide it through main > .page selectors.
    const app = document.querySelector(".app");
    if (app) {
      app.insertAdjacentElement("afterend", node);
    } else {
      document.body.appendChild(node);
    }

    renderActions();
    bindControls();
    renderState();
    return node;
  }

  function renderActions() {
    const node = byId("acActions");
    if (!node) return;

    node.innerHTML = ACTIONS.map((action) => `
      <button
        type="button"
        class="ac-action ${state.selectedAction === action.value ? "active" : ""}"
        data-ac-action="${escapeHtml(action.value)}"
      >
        <span class="ac-icon" aria-hidden="true">${action.icon}</span>
        <span>
          <span class="ac-action-title">${escapeHtml(action.title)}</span>
          <span class="ac-action-description">${escapeHtml(action.description)}</span>
        </span>
      </button>
    `).join("");

    node.querySelectorAll("[data-ac-action]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedAction = button.dataset.acAction || ACTIONS[0].value;
        renderActions();
        renderState();
      });
    });
  }

  function renderGroups() {
    const node = byId("acGroups");
    if (!node) return;

    if (!state.groups.length) {
      node.innerHTML = `
        <div class="ac-empty">
          هیچ گروه فعالی پیدا نشد.<br>
          ابتدا از بخش «مقصدها» همگام‌سازی Telegram را انجام دهید.
        </div>
      `;
      return;
    }

    node.innerHTML = state.groups.map((group) => {
      const id = Number(group.id);
      const active = id === Number(state.selectedGroupDestinationId);
      return `
        <button
          type="button"
          class="ac-group ${active ? "active" : ""}"
          data-ac-group-id="${escapeHtml(id)}"
        >
          <div class="ac-group-title">${escapeHtml(group.title || "گروه بدون نام")}</div>
          <span class="ac-group-meta">${group.username ? `@${escapeHtml(group.username)}` : "گروه Telegram"}</span>
        </button>
      `;
    }).join("");

    node.querySelectorAll("[data-ac-group-id]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedGroupDestinationId = Number(button.dataset.acGroupId);
        renderGroups();
        renderState();
      });
    });
  }

  function renderState() {
    const status = byId("acStatus");
    const enabled = byId("acEnabled");
    const save = byId("acSave");
    const run = byId("acRun");

    if (status) {
      status.textContent = state.enabled ? "فعال" : "غیرفعال";
      status.classList.toggle("on", Boolean(state.enabled));
    }

    if (enabled) {
      enabled.checked = Boolean(state.enabled);
    }

    if (save) {
      save.disabled = state.loading || state.running;
    }

    if (run) {
      run.disabled =
        state.loading ||
        state.running ||
        !state.enabled ||
        !state.selectedGroupDestinationId;
    }
  }

  function matchSavedGroup() {
    const peerId = Number(state.setting?.group?.peer_id);
    if (!Number.isFinite(peerId)) return;

    const match = state.groups.find(
      (group) => Number(group.telegram_peer_id) === peerId,
    );

    if (match) {
      state.selectedGroupDestinationId = Number(match.id);
    }
  }

  async function loadData() {
    ensureRoot();

    if (state.loading) return;

    state.loading = true;
    renderState();
    notify("در حال بارگذاری تنظیمات اتوکلیک…", "info");

    try {
      const [setting, groups] = await Promise.all([
        api("/api/autoclick"),
        api("/api/destinations?kind=group"),
      ]);

      state.setting = setting || null;
      state.groups = Array.isArray(groups?.items) ? groups.items : [];
      state.selectedAction =
        setting?.selected_action || ACTIONS[0].value;
      state.selectedGroupDestinationId = null;
      state.enabled = Boolean(setting?.enabled && setting?.configured);

      matchSavedGroup();
      renderActions();
      renderGroups();
      renderState();
      notify("", "info");
    } catch (error) {
      console.error("Kronos AutoClick load failed:", error);
      notify(
        error?.message || "بارگذاری تنظیمات اتوکلیک ناموفق بود.",
        "error",
      );
    } finally {
      state.loading = false;
      renderState();
    }
  }

  async function saveSettings() {
    if (!state.selectedGroupDestinationId) {
      throw new Error("ابتدا یک گروه مقصد انتخاب کنید.");
    }

    const result = await api("/api/autoclick", {
      method: "PUT",
      body: JSON.stringify({
        group_destination_id: Number(state.selectedGroupDestinationId),
        enabled: Boolean(state.enabled),
        selected_action: state.selectedAction,
      }),
    });

    state.setting = result;
    state.enabled = Boolean(result?.enabled && result?.configured);
    state.selectedAction =
      result?.selected_action || state.selectedAction;

    renderActions();
    renderGroups();
    renderState();
    notify("✅ تنظیمات اتوکلیک ذخیره شد.", "success");
  }

  async function execute() {
    if (state.running) return;

    if (!state.selectedGroupDestinationId) {
      notify("ابتدا یک گروه مقصد انتخاب کنید.", "error");
      return;
    }

    if (!state.enabled) {
      notify(
        "ابتدا اتوکلیک را فعال کنید و تنظیمات را ذخیره کنید.",
        "error",
      );
      return;
    }

    state.running = true;
    renderState();
    notify("در حال اجرای اتوکلیک…", "info");

    const resultNode = byId("acResult");
    if (resultNode) {
      resultNode.textContent = "در حال اجرای عملیات…";
    }

    try {
      const result = await api("/api/autoclick/execute", {
        method: "POST",
        body: JSON.stringify({
          action: state.selectedAction,
        }),
      });

      if (resultNode) {
        resultNode.innerHTML = `
          <strong>✅ اجرا موفق بود</strong><br>
          عملیات: ${escapeHtml(result.action || state.selectedAction)}<br>
          گروه: ${escapeHtml(result.group?.title || "-")}<br>
          دکمه کلیک‌شده: ${escapeHtml(result.clicked_button || "-")}<br>
          زمان اجرا: ${escapeHtml(result.elapsed_ms ?? "-")} ms
        `;
      }

      notify("✅ اتوکلیک با موفقیت اجرا شد.", "success");
    } catch (error) {
      console.error("Kronos AutoClick execution failed:", error);

      if (resultNode) {
        resultNode.textContent = "اجرای اتوکلیک ناموفق بود.";
      }

      notify(
        error?.message || "اجرای اتوکلیک ناموفق بود.",
        "error",
      );
    } finally {
      state.running = false;
      renderState();
    }
  }

  function bindControls() {
    byId("acEnabled")?.addEventListener("change", (event) => {
      state.enabled = Boolean(event.target.checked);
      renderState();
    });

    byId("acSave")?.addEventListener("click", async () => {
      if (state.loading || state.running) return;

      try {
        await saveSettings();
      } catch (error) {
        console.error("Kronos AutoClick save failed:", error);
        notify(
          error?.message || "ذخیره تنظیمات ناموفق بود.",
          "error",
        );
      }
    });

    byId("acRun")?.addEventListener("click", execute);
  }

  function setNormalTabsHidden(hidden) {
    document.querySelectorAll("main > .page").forEach((page) => {
      page.classList.toggle("ac-normal-hidden", hidden);
    });
  }

  function openAutoClick() {
    const node = ensureRoot();
    if (!node) {
      console.error("Kronos AutoClick: root creation failed");
      return;
    }

    setNormalTabsHidden(true);
    node.classList.add("ac-open");

    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === "autoclick");
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
    loadData();
  }

  function closeAutoClick() {
    const node = root();
    if (node) {
      node.classList.remove("ac-open");
    }

    setNormalTabsHidden(false);
  }

  function installTabButtons() {
    const buttonMarkup = (compact = false) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.tab = "autoclick";
      button.innerHTML = compact
        ? "<span>⚡</span>اتوکلیک"
        : "<span>⚡</span>اتوکلیک";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openAutoClick();
      });
      return button;
    };

    const desktop = byId("desktopNav");
    if (desktop && !desktop.querySelector('[data-tab="autoclick"]')) {
      desktop.appendChild(buttonMarkup(false));
    }

    const bottom = document.querySelector(".bottom");
    if (bottom && !bottom.querySelector('[data-tab="autoclick"]')) {
      bottom.appendChild(buttonMarkup(true));
    }
  }

  function installShowTabBridge() {
    const original = window.showTab;
    if (typeof original !== "function") return;
    if (original.__kronosAutoClickBridge) return;

    const bridge = function (tab) {
      if (tab === "autoclick") {
        openAutoClick();
        return;
      }

      closeAutoClick();
      return original.call(window, tab);
    };

    bridge.__kronosAutoClickBridge = true;
    window.showTab = bridge;
  }

  function exposeDebugApi() {
    window.KronosAutoClick = Object.freeze({
      open: openAutoClick,
      close: closeAutoClick,
      reload: loadData,
      state,
    });
  }

  function boot() {
    if (state.initialized) return;
    state.initialized = true;

    try {
      injectStyles();
      ensureRoot();
      installTabButtons();
      installShowTabBridge();
      exposeDebugApi();

      // The dashboard HTML is inline and can be re-rendered by future
      // versions. Reinstall the two navigation buttons defensively.
      window.setTimeout(installTabButtons, 100);
      window.setTimeout(installTabButtons, 500);
      window.setTimeout(installShowTabBridge, 100);
      window.setTimeout(installShowTabBridge, 500);

      console.info("Kronos AutoClick standalone UI ready");
    } catch (error) {
      console.error("Kronos AutoClick bootstrap failed:", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
