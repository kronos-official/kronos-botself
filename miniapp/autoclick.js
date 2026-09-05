(() => {
  "use strict";

  const ACTIONS = [
    { value: "فروش ماهی", icon: "🐟", title: "فروش ماهی", description: "اجرای خودکار گزینه فروش ماهی" },
    { value: "بده پیشی بخوره", icon: "🐱", title: "بده پیشی بخوره", description: "اجرای خودکار گزینه غذا دادن به پیشی" },
    { value: "بندازش توی یخچال", icon: "🧊", title: "بندازش توی یخچال", description: "اجرای خودکار گزینه قرار دادن در یخچال" },
  ];

  const state = {
    setting: null,
    groups: [],
    selectedGroupDestinationId: null,
    selectedAction: ACTIONS[0].value,
    enabled: false,
    loading: false,
    running: false,
  };

  const root = () => document.getElementById("kronos-autoclick-root");
  const $ = (id) => document.getElementById(id);

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function message(text, type = "info") {
    const node = $("acMessage");
    if (!node) return;
    node.textContent = String(text || "");
    node.className = `ac-message ${type}`;
  }

  async function api(path, options = {}) {
    if (typeof window.api === "function") return window.api(path, options);

    const headers = { ...(options.headers || {}) };
    const token = localStorage.getItem("kronos_self_token");
    if (token) headers.Authorization = `Bearer ${token}`;

    if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(path, { ...options, headers, cache: "no-store" });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { detail: text }; }

    if (!response.ok) {
      throw new Error(typeof data?.detail === "string" ? data.detail : "درخواست ناموفق بود.");
    }
    return data;
  }

  function injectStyles() {
    if ($("kronos-autoclick-styles")) return;

    const style = document.createElement("style");
    style.id = "kronos-autoclick-styles";
    style.textContent = `
      #kronos-autoclick-root{display:none!important;width:100%;box-sizing:border-box;margin:0 0 95px;padding:0}
      #kronos-autoclick-root.ac-open{display:block!important}
      #kronos-autoclick-root .ac-shell{width:100%;box-sizing:border-box;background:linear-gradient(180deg,rgba(18,26,39,.99),rgba(8,13,21,.99));border:1px solid rgba(149,168,199,.16);border-radius:22px;padding:15px;box-shadow:0 20px 60px rgba(0,0,0,.34)}
      #kronos-autoclick-root .ac-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
      #kronos-autoclick-root .ac-title{font-size:18px;font-weight:950;margin-top:3px}
      #kronos-autoclick-root .ac-subtitle{color:#8290a6;font-size:9px;line-height:1.9;margin-top:6px}
      #kronos-autoclick-root .ac-status{flex:none;padding:7px 10px;border-radius:999px;font-size:8px;font-weight:900;color:#aab4c2;background:rgba(128,138,153,.1);border:1px solid rgba(149,168,199,.15)}
      #kronos-autoclick-root .ac-status.on{color:#9ff0c7;background:rgba(80,212,147,.09);border-color:rgba(80,212,147,.2)}
      #kronos-autoclick-root .ac-message{display:none;margin-bottom:10px;padding:10px 12px;border-radius:14px;font-size:9px;line-height:1.8;white-space:pre-wrap}
      #kronos-autoclick-root .ac-message.info,#kronos-autoclick-root .ac-message.success,#kronos-autoclick-root .ac-message.error{display:block}
      #kronos-autoclick-root .ac-message.info{color:#add0ff;background:rgba(77,125,255,.1);border:1px solid rgba(102,164,255,.18)}
      #kronos-autoclick-root .ac-message.success{color:#9cebc3;background:rgba(80,212,147,.08);border:1px solid rgba(80,212,147,.18)}
      #kronos-autoclick-root .ac-message.error{color:#ffabb8;background:rgba(139,35,55,.13);border:1px solid rgba(255,111,131,.2)}
      #kronos-autoclick-root .ac-section{margin-top:14px}
      #kronos-autoclick-root .ac-label{font-size:9px;font-weight:950;margin-bottom:7px}
      #kronos-autoclick-root .ac-groups,#kronos-autoclick-root .ac-actions{display:grid;gap:7px}
      #kronos-autoclick-root .ac-group,#kronos-autoclick-root .ac-action{width:100%;box-sizing:border-box;color:#f4f7ff;border:1px solid rgba(149,168,199,.14);border-radius:15px;background:#0b111a;font:inherit;text-align:right;cursor:pointer}
      #kronos-autoclick-root .ac-group{padding:11px}
      #kronos-autoclick-root .ac-group.active,#kronos-autoclick-root .ac-action.active{border-color:rgba(102,164,255,.5);background:rgba(77,125,255,.12)}
      #kronos-autoclick-root .ac-group-title,#kronos-autoclick-root .ac-action-title{font-size:10px;font-weight:900}
      #kronos-autoclick-root .ac-group-meta,#kronos-autoclick-root .ac-action-description{display:block;color:#8290a6;font-size:8px;line-height:1.6;margin-top:4px}
      #kronos-autoclick-root .ac-action{display:flex;align-items:center;gap:10px;padding:10px}
      #kronos-autoclick-root .ac-icon{width:38px;height:38px;flex:none;display:grid;place-items:center;border-radius:12px;background:#152031;font-size:18px}
      #kronos-autoclick-root .ac-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px;border-radius:15px;background:#0b111a;border:1px solid rgba(149,168,199,.14)}
      #kronos-autoclick-root .ac-toggle strong{font-size:10px}
      #kronos-autoclick-root .ac-toggle small{display:block;color:#8290a6;font-size:8px;margin-top:4px}
      #kronos-autoclick-root .ac-switch{position:relative;width:46px;height:25px;flex:none}
      #kronos-autoclick-root .ac-switch input{position:absolute;opacity:0;pointer-events:none}
      #kronos-autoclick-root .ac-switch span{position:absolute;inset:0;border-radius:999px;background:#293444;border:1px solid rgba(255,255,255,.08);cursor:pointer;transition:.2s}
      #kronos-autoclick-root .ac-switch span:before{content:"";position:absolute;top:3px;left:3px;width:17px;height:17px;border-radius:50%;background:#c7d0dc;transition:.2s}
      #kronos-autoclick-root .ac-switch input:checked+span{background:rgba(80,212,147,.25);border-color:rgba(80,212,147,.35)}
      #kronos-autoclick-root .ac-switch input:checked+span:before{transform:translateX(20px);background:#9ff0c7}
      #kronos-autoclick-root .ac-buttons{display:grid;gap:8px;margin-top:10px}
      #kronos-autoclick-root .ac-button{width:100%;border:1px solid rgba(96,143,232,.2);border-radius:14px;padding:13px;color:white;font:inherit;font-size:10px;font-weight:950;cursor:pointer}
      #kronos-autoclick-root .ac-button.primary{background:linear-gradient(135deg,#4d7ef1,#67a1ff)}
      #kronos-autoclick-root .ac-button.secondary{background:#172231;border-color:rgba(149,168,199,.14)}
      #kronos-autoclick-root .ac-button:disabled{opacity:.55;cursor:wait}
      #kronos-autoclick-root .ac-result,#kronos-autoclick-root .ac-empty{padding:11px;border-radius:14px;background:#0b111a;border:1px solid rgba(149,168,199,.12);color:#b8c5d7;font-size:8px;line-height:1.8}
      #kronos-autoclick-root .ac-empty{text-align:center;color:#8290a6}
      #kronos-autoclick-root .ac-result strong{color:#9cebc3}
      #kronos-autoclick-root .ac-note{margin-top:10px;padding:10px;border-radius:13px;background:#090e16;border:1px solid rgba(149,168,199,.1);color:#8290a6;font-size:8px;line-height:1.8}
      #desktopNav button[data-tab="autoclick"],.bottom button[data-tab="autoclick"]{color:#8e9bb0}
      #desktopNav button[data-tab="autoclick"].active,.bottom button[data-tab="autoclick"].active{color:#eff6ff;background:rgba(78,125,237,.14);border:1px solid rgba(96,143,232,.2)}
    `;
    document.head.appendChild(style);
  }

  function createRoot() {
    if (root()) return;

    const app = document.querySelector(".app");
    if (!app) {
      console.error("Kronos AutoClick: .app not found");
      return;
    }

    const node = document.createElement("section");
    node.id = "kronos-autoclick-root";
    node.innerHTML = `
      <div class="ac-shell">
        <div class="ac-header">
          <div>
            <div class="eyebrow">TELEGRAM AUTOCLICK</div>
            <div class="ac-title">⚡ اتوکلیک</div>
            <div class="ac-subtitle">ارسال «میو» و «ماهی» و اجرای خودکار گزینه انتخاب‌شده در @MeowieQBot</div>
          </div>
          <div id="acStatus" class="ac-status">غیرفعال</div>
        </div>
        <div id="acMessage" class="ac-message" aria-live="polite"></div>
        <div class="ac-section">
          <div class="ac-label">گروه مقصد</div>
          <div id="acGroups" class="ac-groups"><div class="ac-empty">در حال دریافت گروه‌ها…</div></div>
        </div>
        <div class="ac-section">
          <div class="ac-label">عملیات</div>
          <div id="acActions" class="ac-actions"></div>
        </div>
        <div class="ac-section">
          <div class="ac-toggle">
            <div><strong>فعال‌سازی اتوکلیک</strong><small>تنظیمات را ذخیره کنید و سپس اجرای تست را انجام دهید.</small></div>
            <label class="ac-switch"><input id="acEnabled" type="checkbox"><span></span></label>
          </div>
        </div>
        <div class="ac-buttons">
          <button id="acSave" type="button" class="ac-button secondary">💾 ذخیره تنظیمات</button>
          <button id="acRun" type="button" class="ac-button primary">⚡ اجرای تست</button>
        </div>
        <div id="acResult" class="ac-result">هنوز اجرایی انجام نشده است.</div>
        <div class="ac-note">Kronos از User Session همان کاربر استفاده می‌کند، پیام‌های «میو» و «ماهی» را در گروه انتخاب‌شده می‌فرستد، پاسخ @MeowieQBot را پیدا می‌کند و دکمه انتخاب‌شده را کلیک می‌کند.</div>
      </div>
    `;

    const main = app.querySelector("main");
    if (main) app.insertBefore(node, main);
    else app.appendChild(node);

    renderActions();
    bindControls();
    renderState();
  }

  function renderActions() {
    const node = $("acActions");
    if (!node) return;
    node.innerHTML = ACTIONS.map((action) => `
      <button type="button" class="ac-action ${state.selectedAction === action.value ? "active" : ""}" data-ac-action="${esc(action.value)}">
        <span class="ac-icon">${action.icon}</span>
        <span><span class="ac-action-title">${esc(action.title)}</span><span class="ac-action-description">${esc(action.description)}</span></span>
      </button>
    `).join("");

    node.querySelectorAll("[data-ac-action]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedAction = button.dataset.acAction || ACTIONS[0].value;
        renderActions();
      });
    });
  }

  function renderGroups() {
    const node = $("acGroups");
    if (!node) return;

    if (!state.groups.length) {
      node.innerHTML = `<div class="ac-empty">هیچ گروه فعالی پیدا نشد. ابتدا از بخش مقصدها همگام‌سازی کنید.</div>`;
      return;
    }

    node.innerHTML = state.groups.map((group) => {
      const id = Number(group.id);
      const active = id === Number(state.selectedGroupDestinationId);
      return `
        <button type="button" class="ac-group ${active ? "active" : ""}" data-ac-group-id="${esc(id)}">
          <div class="ac-group-title">${esc(group.title || "گروه بدون نام")}</div>
          <div class="ac-group-meta">${group.username ? `@${esc(group.username)}` : "گروه Telegram"}</div>
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
    const status = $("acStatus");
    const enabled = $("acEnabled");
    const save = $("acSave");
    const run = $("acRun");
    if (status) {
      status.textContent = state.enabled ? "فعال" : "غیرفعال";
      status.classList.toggle("on", state.enabled);
    }
    if (enabled) enabled.checked = Boolean(state.enabled);
    if (save) save.disabled = state.loading || state.running;
    if (run) run.disabled = state.loading || state.running || !state.enabled || !state.selectedGroupDestinationId;
  }

  function matchSavedGroup() {
    const peerId = Number(state.setting?.group?.peer_id);
    if (!Number.isFinite(peerId)) return;
    const match = state.groups.find((group) => Number(group.telegram_peer_id) === peerId);
    if (match) state.selectedGroupDestinationId = Number(match.id);
  }

  async function load() {
    createRoot();
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
      state.selectedAction = setting?.selected_action || ACTIONS[0].value;
      state.selectedGroupDestinationId = null;
      state.enabled = Boolean(setting?.enabled && setting?.configured);
      matchSavedGroup();
      renderActions();
      renderGroups();
      renderState();
      message("", "info");
    } catch (error) {
      console.error("Kronos AutoClick load failed", error);
      message(error?.message || "بارگذاری اتوکلیک انجام نشد.", "error");
    } finally {
      state.loading = false;
      renderState();
    }
  }

  async function save() {
    if (!state.selectedGroupDestinationId) throw new Error("ابتدا یک گروه مقصد انتخاب کنید.");
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
    state.selectedAction = result?.selected_action || state.selectedAction;
    renderActions();
    renderGroups();
    renderState();
    message("✅ تنظیمات اتوکلیک ذخیره شد.", "success");
  }

  async function execute() {
    if (state.running) return;
    if (!state.selectedGroupDestinationId) return message("ابتدا یک گروه مقصد انتخاب کنید.", "error");
    if (!state.enabled) return message("ابتدا اتوکلیک را فعال کنید و تنظیمات را ذخیره کنید.", "error");

    state.running = true;
    renderState();
    message("در حال اجرای اتوکلیک…", "info");
    const resultNode = $("acResult");
    if (resultNode) resultNode.textContent = "در حال اجرای عملیات…";

    try {
      const result = await api("/api/autoclick/execute", {
        method: "POST",
        body: JSON.stringify({ action: state.selectedAction }),
      });
      if (resultNode) {
        resultNode.innerHTML = `<strong>✅ اجرا موفق بود</strong><br>عملیات: ${esc(result.action || state.selectedAction)}<br>گروه: ${esc(result.group?.title || "-")}<br>دکمه کلیک‌شده: ${esc(result.clicked_button || "-")}<br>زمان اجرا: ${esc(result.elapsed_ms ?? "-")} ms`;
      }
      message("✅ اتوکلیک با موفقیت اجرا شد.", "success");
    } catch (error) {
      console.error("Kronos AutoClick execute failed", error);
      if (resultNode) resultNode.textContent = "اجرای اتوکلیک ناموفق بود.";
      message(error?.message || "اجرای اتوکلیک ناموفق بود.", "error");
    } finally {
      state.running = false;
      renderState();
    }
  }

  function bindControls() {
    $("acEnabled")?.addEventListener("change", (event) => {
      state.enabled = Boolean(event.target.checked);
      renderState();
    });
    $("acSave")?.addEventListener("click", async () => {
      if (state.loading || state.running) return;
      try { await save(); }
      catch (error) {
        console.error("Kronos AutoClick save failed", error);
        message(error?.message || "ذخیره تنظیمات ناموفق بود.", "error");
      }
    });
    $("acRun")?.addEventListener("click", execute);
  }

  function hideNormalPages() {
    document.querySelectorAll("main > .page").forEach((page) => page.classList.remove("active"));
  }

  function setNavActive(active) {
    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === active);
    });
  }

  function openAutoClick() {
    createRoot();
    const node = root();
    if (!node) return;
    hideNormalPages();
    node.classList.add("ac-open");
    setNavActive("autoclick");
    window.scrollTo({ top: 0, behavior: "smooth" });
    load();
  }

  function closeAutoClick() {
    const node = root();
    if (node) node.classList.remove("ac-open");
    document.querySelectorAll('[data-tab="autoclick"]').forEach((button) => button.classList.remove("active"));
  }

  function installNavButtons() {
    const add = (container) => {
      if (!container || container.querySelector('[data-tab="autoclick"]')) return;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.tab = "autoclick";
      button.innerHTML = "<span>⚡</span>اتوکلیک";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openAutoClick();
      });
      container.appendChild(button);
    };
    add($("desktopNav"));
    add(document.querySelector(".bottom"));
  }

  function installShowTabBridge() {
    const current = window.showTab;
    if (current?.__kronosAutoClickBridge) return;
    const bridge = function (tab) {
      if (tab === "autoclick") {
        openAutoClick();
        return;
      }
      closeAutoClick();
      if (typeof current === "function") return current.call(window, tab);
    };
    bridge.__kronosAutoClickBridge = true;
    window.showTab = bridge;
  }

  function boot() {
    try {
      injectStyles();
      createRoot();
      installNavButtons();
      installShowTabBridge();
      window.setTimeout(installNavButtons, 100);
      window.setTimeout(installShowTabBridge, 100);
      window.setTimeout(installNavButtons, 500);
      window.setTimeout(installShowTabBridge, 500);
      window.setTimeout(installNavButtons, 1500);
      window.setTimeout(installShowTabBridge, 1500);
      console.info("Kronos AutoClick isolated UI initialized");
    } catch (error) {
      console.error("Kronos AutoClick bootstrap failed", error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
