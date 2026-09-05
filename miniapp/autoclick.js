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

  const notify = (message, type = "success") => {
    if (typeof window.notice === "function") {
      window.notice(message, type);
      return;
    }
    window.alert(message);
  };

  const api = async (path, options = {}) => {
    if (typeof window.api === "function") {
      return window.api(path, options);
    }

    const token = localStorage.getItem("kronos_self_token");
    const headers = { ...(options.headers || {}) };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (options.body && !(options.body instanceof FormData)) {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
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
      throw new Error(data?.detail || "عملیات ناموفق بود.");
    }
    return data;
  };

  function injectStyles() {
    if (document.getElementById("kronos-autoclick-styles")) return;

    const style = document.createElement("style");
    style.id = "kronos-autoclick-styles";
    style.textContent = `
      #kronos-autoclick-page{margin-top:10px}
      .ac-shell{background:linear-gradient(180deg,rgba(18,26,39,.98),rgba(10,15,23,.98));border:1px solid rgba(149,168,199,.14);border-radius:22px;padding:15px;box-shadow:0 20px 60px rgba(0,0,0,.34)}
      .ac-header{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:14px}
      .ac-title{font-size:16px;font-weight:950}
      .ac-subtitle{color:#8290a6;font-size:9px;line-height:1.8;margin-top:5px}
      .ac-status{padding:7px 10px;border-radius:999px;font-size:8px;font-weight:900;background:rgba(128,138,153,.10);color:#aab4c2;border:1px solid rgba(149,168,199,.15);white-space:nowrap}
      .ac-status.on{background:rgba(80,212,147,.09);color:#9ff0c7;border-color:rgba(80,212,147,.18)}
      .ac-section{margin-top:14px}
      .ac-label{font-size:9px;font-weight:900;margin-bottom:7px}
      .ac-groups,.ac-actions{display:grid;gap:7px}
      .ac-group,.ac-action{width:100%;text-align:right;color:#f4f7ff;background:#0b111a;border:1px solid rgba(149,168,199,.14);border-radius:15px;padding:11px;cursor:pointer}
      .ac-group.active,.ac-action.active{border-color:rgba(102,164,255,.5);background:rgba(77,125,255,.12)}
      .ac-group-title,.ac-action-title{font-size:10px;font-weight:900}
      .ac-group-meta,.ac-action-description{font-size:8px;color:#8290a6;margin-top:4px;line-height:1.6}
      .ac-action{display:flex;align-items:center;gap:10px}
      .ac-icon{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:#152031;font-size:18px;flex:none}
      .ac-run,.ac-save{width:100%;margin-top:9px;padding:13px;border-radius:14px;border:1px solid rgba(96,143,232,.2);color:white;font-size:10px;font-weight:950;cursor:pointer}
      .ac-run{background:linear-gradient(135deg,#4d7ef1,#67a1ff)}
      .ac-save{background:#172231;border-color:rgba(149,168,199,.14)}
      .ac-run:disabled,.ac-save:disabled{opacity:.55;cursor:wait}
      .ac-toggle-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px;border-radius:15px;background:#0b111a;border:1px solid rgba(149,168,199,.14)}
      .ac-toggle-copy strong{font-size:10px}.ac-toggle-copy small{display:block;color:#8290a6;font-size:8px;margin-top:4px}
      .ac-switch{position:relative;width:44px;height:24px;flex:none}.ac-switch input{display:none}.ac-switch span{position:absolute;inset:0;border-radius:999px;background:#293444;border:1px solid rgba(255,255,255,.08);cursor:pointer;transition:.2s}.ac-switch span:before{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#c7d0dc;transition:.2s}.ac-switch input:checked+span{background:rgba(80,212,147,.25);border-color:rgba(80,212,147,.35)}.ac-switch input:checked+span:before{transform:translateX(20px);background:#9ff0c7}
      .ac-hint{margin-top:9px;padding:10px;border-radius:13px;background:#090e16;border:1px solid rgba(149,168,199,.1);color:#8290a6;font-size:8px;line-height:1.8}
      .ac-empty{padding:20px 10px;text-align:center;color:#8290a6;font-size:9px;border:1px dashed rgba(149,168,199,.14);border-radius:14px}
      .ac-result{margin-top:10px;padding:11px;border-radius:14px;background:#0b111a;border:1px solid rgba(149,168,199,.14);font-size:8px;line-height:1.8;color:#b8c5d7}
      .ac-result strong{color:#9ff0c7}
      .ac-disabled{opacity:.55;pointer-events:none}
      #desktopNav button[data-tab="autoclick"],.bottom button[data-tab="autoclick"]{color:#8e9bb0}
      #desktopNav button[data-tab="autoclick"].active,.bottom button[data-tab="autoclick"].active{color:#eff6ff;background:rgba(78,125,237,.14);border:1px solid rgba(96,143,232,.2)}
    `;
    document.head.appendChild(style);
  }

  function createPage() {
    if (document.getElementById("kronos-autoclick-page")) return;

    const main = document.querySelector("main");
    if (!main) return;

    const page = document.createElement("section");
    page.id = "kronos-autoclick-page";
    page.className = "page";
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

        <div class="ac-section">
          <div class="ac-label">گروه مقصد</div>
          <div id="acGroups" class="ac-groups"><div class="ac-empty">در حال دریافت گروه‌ها…</div></div>
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

        <button id="acSave" class="ac-save">💾 ذخیره تنظیمات</button>
        <button id="acRun" class="ac-run">⚡ اجرای تست</button>
        <div id="acResult" class="ac-result">هنوز اجرایی انجام نشده است.</div>
        <div class="ac-hint">Kronos از User Session همان کاربر استفاده می‌کند، پیام‌های «میو» و «ماهی» را در گروه انتخاب‌شده می‌فرستد، پاسخ @MeowieQBot را پیدا می‌کند و دقیقاً همان دکمه‌ای را که انتخاب کرده‌اید کلیک می‌کند.</div>
      </div>
    `;

    main.appendChild(page);
    renderActions();
    bindControls();
  }

  function renderActions() {
    const root = document.getElementById("acActions");
    if (!root) return;

    root.innerHTML = ACTIONS.map((action) => `
      <button class="ac-action ${state.selectedAction === action.value ? "active" : ""}" data-action="${escapeHtml(action.value)}">
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

  function renderGroups() {
    const root = document.getElementById("acGroups");
    if (!root) return;

    if (!state.groups.length) {
      root.innerHTML = `<div class="ac-empty">هیچ گروهی پیدا نشد. ابتدا مقصدها را همگام‌سازی کنید.</div>`;
      return;
    }

    root.innerHTML = state.groups.map((group) => `
      <button class="ac-group ${Number(state.selectedGroupId) === Number(group.id) ? "active" : ""}" data-id="${escapeHtml(group.id)}">
        <div class="ac-group-title">${escapeHtml(group.title || "گروه بدون نام")}</div>
        <div class="ac-group-meta">${group.username ? `@${escapeHtml(group.username)}` : "گروه Telegram"}</div>
      </button>
    `).join("");

    root.querySelectorAll(".ac-group").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedGroupId = Number(button.dataset.id);
        renderGroups();
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
    if (enabled) enabled.checked = state.enabled;
    if (run) run.disabled = state.running || !state.selectedGroupId || !state.enabled;
    if (save) save.disabled = state.running;
  }

  async function load() {
    createPage();
    if (state.loaded) {
      renderState();
      return;
    }

    try {
      const [config, groups] = await Promise.all([
        api("/api/autoclick"),
        api("/api/destinations?kind=group"),
      ]);

      state.config = config;
      state.groups = Array.isArray(groups.items) ? groups.items : [];
      state.selectedAction = config.selected_action || ACTIONS[0].value;
      state.selectedGroupId = config.group?.peer_id ?? null;
      state.enabled = Boolean(config.enabled && config.configured);
      state.loaded = true;

      renderActions();
      renderGroups();
      renderState();
    } catch (error) {
      console.error("AutoClick load failed", error);
      notify(error?.message || "بارگذاری اتوکلیک انجام نشد.", "error");
    }
  }

  async function save() {
    if (!state.selectedGroupId) {
      throw new Error("ابتدا یک گروه انتخاب کنید.");
    }

    const config = await api("/api/autoclick", {
      method: "PUT",
      body: JSON.stringify({
        group_destination_id: state.selectedGroupId,
        enabled: Boolean(state.enabled),
        selected_action: state.selectedAction,
      }),
    });

    state.config = config;
    state.enabled = Boolean(config.enabled && config.configured);
    notify("✅ تنظیمات اتوکلیک ذخیره شد.", "success");
    renderState();
    return config;
  }

  async function run() {
    if (state.running) return;
    if (!state.selectedGroupId) {
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

    if (runButton) runButton.textContent = "⏳ در حال اجرا…";
    if (resultRoot) resultRoot.textContent = "در حال ارسال فرمان‌ها و انتظار برای منوی ربات…";

    try {
      await save();
      const result = await api("/api/autoclick/execute", {
        method: "POST",
        body: JSON.stringify({ action: state.selectedAction }),
      });

      if (resultRoot) {
        resultRoot.innerHTML = `✅ <strong>موفق</strong> — «${escapeHtml(result.clicked_button || result.action)}» کلیک شد. زمان اجرا: ${escapeHtml(result.elapsed_ms)}ms`;
      }
      notify(`✅ «${result.clicked_button || result.action}» با موفقیت اجرا شد.`, "success");
    } catch (error) {
      console.error("AutoClick execution failed", error);
      if (resultRoot) {
        resultRoot.textContent = `❌ ${error?.message || "اجرای اتوکلیک ناموفق بود."}`;
      }
      notify(error?.message || "اجرای اتوکلیک ناموفق بود.", "error");
    } finally {
      state.running = false;
      if (runButton) runButton.textContent = "⚡ اجرای تست";
      renderState();
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
        notify(error?.message || "ذخیره تنظیمات انجام نشد.", "error");
      }
    });
    runButton?.addEventListener("click", run);
  }

  function ensureNavButton(container, cloneFrom = null) {
    if (!container || container.querySelector('[data-tab="autoclick"]')) return;

    const button = cloneFrom ? cloneFrom.cloneNode(true) : document.createElement("button");
    button.dataset.tab = "autoclick";
    button.className = "";
    button.innerHTML = "<span>⚡</span>اتوکلیک";
    button.onclick = () => {
      showAutoclickTab();
    };
    container.appendChild(button);
  }

  function showAutoclickTab() {
    document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
    const page = document.getElementById("kronos-autoclick-page");
    if (page) page.classList.add("active");

    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === "autoclick");
    });

    load();
  }

  function patchShowTab() {
    if (typeof window.showTab !== "function") return;
    if (window.showTab.__kronosAutoclickPatched) return;

    const original = window.showTab;
    const wrapped = function (tab) {
      if (tab === "autoclick") {
        showAutoclickTab();
        return;
      }
      original(tab);
    };

    wrapped.__kronosAutoclickPatched = true;
    window.showTab = wrapped;
  }

  function boot() {
    injectStyles();
    createPage();

    const nav = document.getElementById("desktopNav");
    const bottom = document.querySelector(".bottom");
    ensureNavButton(nav);
    ensureNavButton(bottom);
    patchShowTab();

    window.setTimeout(patchShowTab, 100);
    window.setTimeout(patchShowTab, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
