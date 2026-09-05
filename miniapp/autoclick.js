(() => {
  "use strict";

  const ACTIONS = [
    { value: "فروش ماهی", icon: "🐟", title: "فروش ماهی", description: "اجرای گزینه فروش ماهی" },
    { value: "بده پیشی بخوره", icon: "🐱", title: "بده پیشی بخوره", description: "اجرای گزینه غذا دادن به پیشی" },
    { value: "بندازش توی یخچال", icon: "🧊", title: "بندازش توی یخچال", description: "اجرای گزینه قرار دادن در یخچال" },
  ];

  const state = {
    setting: null,
    groups: [],
    groupId: null,
    action: ACTIONS[0].value,
    enabled: false,
    loading: false,
    running: false,
  };

  const el = (id) => document.getElementById(id);
  const root = () => el("kronos-autoclick-root");

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function message(text, type = "info") {
    const node = el("acMessage");
    if (!node) return;
    node.textContent = String(text || "");
    node.className = `ac-message ${type}`;
  }

  async function api(path, options = {}) {
    if (typeof window.api === "function") {
      return window.api(path, options);
    }

    const headers = { ...(options.headers || {}) };
    const token = localStorage.getItem("kronos_self_token");
    if (token) headers.Authorization = `Bearer ${token}`;

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
      throw new Error(
        typeof data?.detail === "string"
          ? data.detail
          : "درخواست ناموفق بود.",
      );
    }

    return data;
  }

  function injectStyles() {
    if (el("kronos-autoclick-styles")) return;

    const style = document.createElement("style");
    style.id = "kronos-autoclick-styles";
    style.textContent = `
      #kronos-autoclick-root {
        display: none !important;
        position: relative !important;
        width: min(1120px, 100%) !important;
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

      main.ac-main-hidden {
        display: none !important;
      }

      #desktopNav {
        grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
      }

      .bottom {
        grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
      }

      #kronos-autoclick-root .ac-shell {
        width: 100%;
        padding: 16px;
        border-radius: 24px;
        border: 1px solid rgba(149,168,199,.16);
        background:
          radial-gradient(650px 240px at 100% 0%, rgba(77,126,241,.14), transparent 65%),
          linear-gradient(180deg, rgba(18,26,39,.99), rgba(8,13,21,.99));
        box-shadow: 0 24px 70px rgba(0,0,0,.38);
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

      #kronos-autoclick-root .ac-message.info { color: #add0ff; background: rgba(77,125,255,.10); border: 1px solid rgba(102,164,255,.18); }
      #kronos-autoclick-root .ac-message.success { color: #9cebc3; background: rgba(80,212,147,.08); border: 1px solid rgba(80,212,147,.18); }
      #kronos-autoclick-root .ac-message.error { color: #ffabb8; background: rgba(139,35,55,.13); border: 1px solid rgba(255,111,131,.20); }

      #kronos-autoclick-root .ac-section { margin-top: 15px; }
      #kronos-autoclick-root .ac-label { margin-bottom: 7px; font-size: 9px; font-weight: 950; }
      #kronos-autoclick-root .ac-groups,
      #kronos-autoclick-root .ac-actions { display: grid; gap: 8px; }

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

      #kronos-autoclick-root .ac-group { padding: 12px; }
      #kronos-autoclick-root .ac-group.active,
      #kronos-autoclick-root .ac-action.active {
        border-color: rgba(102,164,255,.50);
        background: rgba(77,125,255,.12);
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

      #kronos-autoclick-root .ac-toggle strong { font-size: 10px; }
      #kronos-autoclick-root .ac-toggle small { display: block; margin-top: 4px; color: #8290a6; font-size: 8px; }

      #kronos-autoclick-root .ac-switch { position: relative; width: 48px; height: 26px; flex: none; }
      #kronos-autoclick-root .ac-switch input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
      #kronos-autoclick-root .ac-switch span { position: absolute; inset: 0; border-radius: 999px; background: #293444; border: 1px solid rgba(255,255,255,.08); cursor: pointer; }
      #kronos-autoclick-root .ac-switch span::before { content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #c7d0dc; transition: transform .18s ease, background .18s ease; }
      #kronos-autoclick-root .ac-switch input:checked + span { background: rgba(80,212,147,.25); border-color: rgba(80,212,147,.35); }
      #kronos-autoclick-root .ac-switch input:checked + span::before { transform: translateX(21px); background: #9ff0c7; }

      #kronos-autoclick-root .ac-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
      #kronos-autoclick-root .ac-button { width: 100%; padding: 13px; border-radius: 14px; border: 1px solid rgba(96,143,232,.20); color: white; cursor: pointer; font-size: 10px; font-weight: 950; }
      #kronos-autoclick-root .ac-button.primary { background: linear-gradient(135deg,#4d7ef1,#67a1ff); }
      #kronos-autoclick-root .ac-button.secondary { background: #172231; border-color: rgba(149,168,199,.14); }
      #kronos-autoclick-root .ac-button:disabled { opacity: .55; cursor: wait; }

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

      #kronos-autoclick-root .ac-empty { text-align: center; color: #8290a6; }
      #kronos-autoclick-root .ac-result strong { color: #9cebc3; }
      #kronos-autoclick-root .ac-note { margin-top: 10px; padding: 10px; border-radius: 13px; background: #090e16; border: 1px solid rgba(149,168,199,.10); color: #8290a6; font-size: 8px; line-height: 1.8; }

      @media (max-width: 640px) {
        #kronos-autoclick-root .ac-buttons { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function buildRoot() {
    const existing = root();
    if (existing) return existing;

    const node = document.createElement("section");
    node.id = "kronos-autoclick-root";
    node.innerHTML = `
      <div class="ac-shell">
        <div class="ac-header">
          <div>
            <div class="eyebrow">TELEGRAM AUTOCLICK</div>
            <div class="ac-title">⚡ اتوکلیک</div>
            <div class="ac-subtitle">گروه را انتخاب کنید، عملیات را مشخص کنید و اجرای خودکار را فعال نمایید.</div>
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
        <div class="ac-note">Kronos از User Session کاربر استفاده می‌کند و پس از ارسال پیام‌های موردنیاز، پاسخ @MeowieQBot را پیدا کرده و دکمه انتخاب‌شده را کلیک می‌کند.</div>
      </div>
    `;

    const app = document.querySelector(".app");
    if (app) {
      app.insertAdjacentElement("afterend", node);
    } else {
      document.body.appendChild(node);
    }

    bindControls();
    renderActions();
    renderState();
    return node;
  }

  function renderActions() {
    const node = el("acActions");
    if (!node) return;

    node.innerHTML = ACTIONS.map((action) => `
      <button type="button" class="ac-action ${state.action === action.value ? "active" : ""}" data-ac-action="${esc(action.value)}">
        <span class="ac-icon" aria-hidden="true">${action.icon}</span>
        <span>
          <span class="ac-action-title">${esc(action.title)}</span>
          <span class="ac-action-description">${esc(action.description)}</span>
        </span>
      </button>
    `).join("");

    node.querySelectorAll("[data-ac-action]").forEach((button) => {
      button.addEventListener("click", () => {
        state.action = button.dataset.acAction || ACTIONS[0].value;
        renderActions();
        renderState();
      });
    });
  }

  function renderGroups() {
    const node = el("acGroups");
    if (!node) return;

    if (!state.groups.length) {
      node.innerHTML = '<div class="ac-empty">هیچ گروه فعالی پیدا نشد. ابتدا از بخش «مقصدها» همگام‌سازی کنید.</div>';
      return;
    }

    node.innerHTML = state.groups.map((group) => {
      const id = Number(group.id);
      const active = id === Number(state.groupId);
      return `
        <button type="button" class="ac-group ${active ? "active" : ""}" data-ac-group-id="${esc(id)}">
          <div class="ac-group-title">${esc(group.title || "گروه بدون نام")}</div>
          <span class="ac-group-meta">${group.username ? `@${esc(group.username)}` : "گروه Telegram"}</span>
        </button>
      `;
    }).join("");

    node.querySelectorAll("[data-ac-group-id]").forEach((button) => {
      button.addEventListener("click", () => {
        state.groupId = Number(button.dataset.acGroupId);
        renderGroups();
        renderState();
      });
    });
  }

  function renderState() {
    const status = el("acStatus");
    const enabled = el("acEnabled");
    const save = el("acSave");
    const run = el("acRun");

    if (status) {
      status.textContent = state.enabled ? "فعال" : "غیرفعال";
      status.classList.toggle("on", Boolean(state.enabled));
    }

    if (enabled) enabled.checked = Boolean(state.enabled);
    if (save) save.disabled = state.loading || state.running;
    if (run) run.disabled = state.loading || state.running || !state.enabled || !state.groupId;
  }

  function matchSavedGroup() {
    const peerId = Number(state.setting?.group?.peer_id);
    if (!Number.isFinite(peerId)) return;
    const match = state.groups.find((group) => Number(group.telegram_peer_id) === peerId);
    if (match) state.groupId = Number(match.id);
  }

  async function loadData() {
    buildRoot();
    if (state.loading) return;

    state.loading = true;
    renderState();
    message("در حال بارگذاری تنظیمات اتوکلیک…", "info");

    try {
      const [setting, groups] = await Promise.all([
        api("/api/autoclick"),
        api("/api/destinations?kind=group"),
      ]);

      state.setting = setting || null;
      state.groups = Array.isArray(groups?.items) ? groups.items : [];
      state.action = setting?.selected_action || ACTIONS[0].value;
      state.groupId = null;
      state.enabled = Boolean(setting?.enabled && setting?.configured);

      matchSavedGroup();
      renderActions();
      renderGroups();
      renderState();
      message("", "info");
    } catch (error) {
      console.error("Kronos AutoClick load failed:", error);
      message(error?.message || "بارگذاری اتوکلیک ناموفق بود.", "error");
    } finally {
      state.loading = false;
      renderState();
    }
  }

  async function saveSettings() {
    if (!state.groupId) throw new Error("ابتدا یک گروه مقصد انتخاب کنید.");

    const result = await api("/api/autoclick", {
      method: "PUT",
      body: JSON.stringify({
        group_destination_id: Number(state.groupId),
        enabled: Boolean(state.enabled),
        selected_action: state.action,
      }),
    });

    state.setting = result;
    state.enabled = Boolean(result?.enabled && result?.configured);
    state.action = result?.selected_action || state.action;
    renderActions();
    renderGroups();
    renderState();
    message("✅ تنظیمات اتوکلیک ذخیره شد.", "success");
  }

  async function execute() {
    if (state.running) return;
    if (!state.groupId) return message("ابتدا یک گروه مقصد انتخاب کنید.", "error");
    if (!state.enabled) return message("ابتدا اتوکلیک را فعال کنید و تنظیمات را ذخیره کنید.", "error");

    state.running = true;
    renderState();
    message("در حال اجرای اتوکلیک…", "info");

    const result = el("acResult");
    if (result) result.textContent = "در حال اجرای عملیات…";

    try {
      const data = await api("/api/autoclick/execute", {
        method: "POST",
        body: JSON.stringify({ action: state.action }),
      });

      if (result) {
        result.innerHTML = `<strong>✅ اجرا موفق بود</strong><br>عملیات: ${esc(data.action || state.action)}<br>گروه: ${esc(data.group?.title || "-")}<br>دکمه: ${esc(data.clicked_button || "-")}<br>زمان: ${esc(data.elapsed_ms ?? "-")} ms`;
      }

      message("✅ اتوکلیک با موفقیت اجرا شد.", "success");
    } catch (error) {
      console.error("Kronos AutoClick execution failed:", error);
      if (result) result.textContent = "اجرای اتوکلیک ناموفق بود.";
      message(error?.message || "اجرای اتوکلیک ناموفق بود.", "error");
    } finally {
      state.running = false;
      renderState();
    }
  }

  function bindControls() {
    el("acEnabled")?.addEventListener("change", (event) => {
      state.enabled = Boolean(event.target.checked);
      renderState();
    });

    el("acSave")?.addEventListener("click", async () => {
      if (state.loading || state.running) return;
      try {
        await saveSettings();
      } catch (error) {
        console.error("Kronos AutoClick save failed:", error);
        message(error?.message || "ذخیره تنظیمات ناموفق بود.", "error");
      }
    });

    el("acRun")?.addEventListener("click", execute);
  }

  function open() {
    const node = buildRoot();
    if (!node) return;

    const main = document.querySelector("main");
    if (main) main.classList.add("ac-main-hidden");
    node.classList.add("ac-open");

    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === "autoclick");
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
    void loadData();
  }

  function close() {
    const node = root();
    if (node) node.classList.remove("ac-open");
    const main = document.querySelector("main");
    if (main) main.classList.remove("ac-main-hidden");
  }

  function installNavigation() {
    const createButton = () => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.tab = "autoclick";
      button.innerHTML = "<span>⚡</span>اتوکلیک";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        open();
      });
      return button;
    };

    const desktop = el("desktopNav");
    if (desktop && !desktop.querySelector('[data-tab="autoclick"]')) desktop.appendChild(createButton());

    const bottom = document.querySelector(".bottom");
    if (bottom && !bottom.querySelector('[data-tab="autoclick"]')) bottom.appendChild(createButton());
  }

  function bridgeShowTab() {
    const original = window.showTab;
    if (typeof original !== "function" || original.__kronosAutoClickBridge) return;

    const bridge = function (tab) {
      if (tab === "autoclick") {
        open();
        return;
      }
      close();
      return original.call(window, tab);
    };

    bridge.__kronosAutoClickBridge = true;
    window.showTab = bridge;
  }

  function boot() {
    try {
      injectStyles();
      buildRoot();
      installNavigation();
      bridgeShowTab();
      window.setTimeout(installNavigation, 100);
      window.setTimeout(installNavigation, 500);
      window.setTimeout(bridgeShowTab, 100);
      window.setTimeout(bridgeShowTab, 500);
      console.info("Kronos AutoClick UI ready");
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
