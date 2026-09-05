(() => {
  "use strict";

  const ACTIONS = [
    { value: "فروش ماهی", icon: "🐟", title: "فروش ماهی", description: "گزینه فروش ماهی را از منوی ربات اجرا می‌کند." },
    { value: "بده پیشی بخوره", icon: "🐱", title: "بده پیشی بخوره", description: "گزینه غذا دادن به پیشی را اجرا می‌کند." },
    { value: "بندازش توی یخچال", icon: "🧊", title: "بندازش توی یخچال", description: "گزینه قرار دادن در یخچال را اجرا می‌کند." },
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

  function notify(text, type = "info") {
    const rootMessage = el("acMessage");
    if (rootMessage) {
      rootMessage.textContent = String(text || "");
      rootMessage.className = `ac-message ${type}${text ? " visible" : ""}`;
    }

    if (typeof window.notice === "function" && text) {
      window.notice(text, type);
    }
  }

  async function api(path, options = {}) {
    if (typeof window.api === "function") return window.api(path, options);

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

    const response = await fetch(path, { ...options, headers, cache: "no-store" });
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
        width: min(1120px, 100%) !important;
        margin: 0 auto 110px !important;
        box-sizing: border-box !important;
        opacity: 0;
        transform: translateY(10px);
        transition: opacity .2s ease, transform .2s ease;
      }
      #kronos-autoclick-root.ac-open { display:block !important; opacity:1; transform:none; }
      #kronos-autoclick-root, #kronos-autoclick-root * { box-sizing:border-box; }
      main.ac-main-hidden { display:none !important; }
      #desktopNav { grid-template-columns:repeat(7,minmax(0,1fr)) !important; }
      .bottom { grid-template-columns:repeat(7,minmax(0,1fr)) !important; }

      #kronos-autoclick-root .ac-shell {
        overflow:hidden;
        border:1px solid rgba(149,168,199,.14);
        border-radius:26px;
        background:
          radial-gradient(900px 320px at 100% -10%, rgba(77,126,241,.20), transparent 62%),
          radial-gradient(600px 260px at 0% 100%, rgba(82,221,255,.07), transparent 64%),
          linear-gradient(180deg, rgba(17,25,38,.99), rgba(7,12,19,.99));
        box-shadow:0 28px 90px rgba(0,0,0,.38);
      }

      #kronos-autoclick-root .ac-hero { padding:22px 20px 18px; border-bottom:1px solid rgba(149,168,199,.10); }
      #kronos-autoclick-root .ac-hero-top { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
      #kronos-autoclick-root .ac-kicker { color:#75a3de; font-size:8px; font-weight:950; letter-spacing:.16em; }
      #kronos-autoclick-root .ac-title { margin-top:5px; font-size:clamp(22px,5vw,30px); line-height:1.15; font-weight:950; }
      #kronos-autoclick-root .ac-description { max-width:720px; margin-top:8px; color:#8290a6; font-size:9px; line-height:1.9; }
      #kronos-autoclick-root .ac-status { min-width:90px; padding:9px 11px; border-radius:999px; text-align:center; color:#9da9ba; background:rgba(128,138,153,.09); border:1px solid rgba(149,168,199,.14); font-size:8px; font-weight:950; }
      #kronos-autoclick-root .ac-status.on { color:#9ff0c7; background:rgba(80,212,147,.09); border-color:rgba(80,212,147,.25); }
      #kronos-autoclick-root .ac-status.busy { color:#aed0ff; background:rgba(77,126,241,.12); border-color:rgba(102,164,255,.24); }
      #kronos-autoclick-root .ac-message { display:none; margin:14px 20px 0; padding:11px 13px; border-radius:14px; font-size:9px; line-height:1.8; white-space:pre-wrap; }
      #kronos-autoclick-root .ac-message.visible { display:block; }
      #kronos-autoclick-root .ac-message.info { color:#b4d2ff; background:rgba(77,125,255,.10); border:1px solid rgba(102,164,255,.18); }
      #kronos-autoclick-root .ac-message.success { color:#a0edc6; background:rgba(80,212,147,.08); border:1px solid rgba(80,212,147,.18); }
      #kronos-autoclick-root .ac-message.error { color:#ffb0bc; background:rgba(139,35,55,.14); border:1px solid rgba(255,111,131,.20); }

      #kronos-autoclick-root .ac-body { padding:16px 20px 20px; }
      #kronos-autoclick-root .ac-grid { display:grid; grid-template-columns:1.05fr .95fr; gap:12px; }
      #kronos-autoclick-root .ac-card { padding:15px; border:1px solid rgba(149,168,199,.11); border-radius:19px; background:rgba(7,12,19,.58); }
      #kronos-autoclick-root .ac-card-title { font-size:11px; font-weight:950; }
      #kronos-autoclick-root .ac-card-subtitle { margin-top:4px; color:#8290a6; font-size:8px; line-height:1.7; }

      #kronos-autoclick-root .ac-groups { display:grid; gap:7px; margin-top:12px; max-height:320px; overflow:auto; }
      #kronos-autoclick-root .ac-group { width:100%; display:flex; align-items:center; gap:10px; padding:11px; text-align:right; color:#f4f7ff; background:#0b111a; border:1px solid rgba(149,168,199,.12); border-radius:15px; cursor:pointer; transition:border-color .16s ease, background .16s ease, transform .16s ease; }
      #kronos-autoclick-root .ac-group:hover, #kronos-autoclick-root .ac-action:hover { transform:translateY(-1px); }
      #kronos-autoclick-root .ac-group.active, #kronos-autoclick-root .ac-action.active { border-color:rgba(102,164,255,.52); background:linear-gradient(135deg,rgba(77,125,255,.15),rgba(77,125,255,.06)); }
      #kronos-autoclick-root .ac-group-icon { width:38px; height:38px; display:grid; place-items:center; border-radius:12px; background:#152031; font-size:18px; flex:none; }
      #kronos-autoclick-root .ac-group-name { display:block; font-size:9px; font-weight:900; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      #kronos-autoclick-root .ac-group-meta { display:block; margin-top:3px; color:#8290a6; font-size:7px; }
      #kronos-autoclick-root .ac-check { margin-inline-start:auto; color:#7f8da1; font-size:12px; }
      #kronos-autoclick-root .ac-group.active .ac-check { color:#9ff0c7; }

      #kronos-autoclick-root .ac-actions { display:grid; gap:7px; margin-top:12px; }
      #kronos-autoclick-root .ac-action { width:100%; display:flex; align-items:center; gap:10px; padding:10px; text-align:right; color:#f4f7ff; background:#0b111a; border:1px solid rgba(149,168,199,.12); border-radius:15px; cursor:pointer; transition:border-color .16s ease, background .16s ease, transform .16s ease; }
      #kronos-autoclick-root .ac-action-icon { width:42px; height:42px; display:grid; place-items:center; border-radius:13px; background:linear-gradient(145deg,#17283e,#0d1727); font-size:20px; flex:none; }
      #kronos-autoclick-root .ac-action-title { display:block; font-size:9px; font-weight:950; }
      #kronos-autoclick-root .ac-action-description { display:block; margin-top:3px; color:#8290a6; font-size:7px; line-height:1.65; }

      #kronos-autoclick-root .ac-settings { display:grid; gap:10px; margin-top:12px; }
      #kronos-autoclick-root .ac-setting { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px; border-radius:15px; background:#0b111a; border:1px solid rgba(149,168,199,.12); }
      #kronos-autoclick-root .ac-setting strong { display:block; font-size:9px; }
      #kronos-autoclick-root .ac-setting small { display:block; margin-top:3px; color:#8290a6; font-size:7px; }
      #kronos-autoclick-root .ac-switch { position:relative; width:48px; height:27px; flex:none; }
      #kronos-autoclick-root .ac-switch input { position:absolute; width:1px; height:1px; opacity:0; }
      #kronos-autoclick-root .ac-switch span { position:absolute; inset:0; border-radius:999px; background:#293444; border:1px solid rgba(255,255,255,.08); cursor:pointer; }
      #kronos-autoclick-root .ac-switch span::before { content:""; position:absolute; top:3px; left:3px; width:19px; height:19px; border-radius:50%; background:#c7d0dc; transition:transform .18s ease,background .18s ease; }
      #kronos-autoclick-root .ac-switch input:checked + span { background:rgba(80,212,147,.25); border-color:rgba(80,212,147,.35); }
      #kronos-autoclick-root .ac-switch input:checked + span::before { transform:translateX(21px); background:#9ff0c7; }

      #kronos-autoclick-root .ac-bottom { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; }
      #kronos-autoclick-root .ac-button { border:0; border-radius:14px; padding:12px; color:#f4f7ff; font-size:9px; font-weight:950; cursor:pointer; }
      #kronos-autoclick-root .ac-button.primary { background:linear-gradient(135deg,#4d7ef1,#67a1ff); box-shadow:0 10px 28px rgba(77,126,241,.17); }
      #kronos-autoclick-root .ac-button.secondary { background:#172231; border:1px solid rgba(149,168,199,.12); }
      #kronos-autoclick-root .ac-button:disabled { opacity:.55; cursor:wait; }

      #kronos-autoclick-root .ac-result { margin-top:12px; padding:12px; border-radius:15px; border:1px solid rgba(149,168,199,.11); background:rgba(7,12,19,.72); }
      #kronos-autoclick-root .ac-result-head { display:flex; align-items:center; gap:7px; font-size:8px; color:#8290a6; }
      #kronos-autoclick-root .ac-result-body { margin-top:7px; font-size:9px; line-height:1.85; }
      #kronos-autoclick-root .ac-result-body strong { color:#9ff0c7; }
      #kronos-autoclick-root .ac-empty { padding:18px 10px; text-align:center; color:#8290a6; border:1px dashed rgba(149,168,199,.14); border-radius:14px; font-size:8px; line-height:1.8; }
      #kronos-autoclick-root .ac-spinner { width:15px; height:15px; display:inline-block; border:2px solid #2a3547; border-top-color:#66a4ff; border-radius:50%; animation:ac-spin .75s linear infinite; vertical-align:middle; }
      @keyframes ac-spin { to { transform:rotate(360deg); } }

      @media (max-width:860px) { #kronos-autoclick-root .ac-grid { grid-template-columns:1fr; } }
      @media (max-width:600px) {
        #kronos-autoclick-root .ac-body { padding:12px; }
        #kronos-autoclick-root .ac-hero { padding:17px 14px 14px; }
        #kronos-autoclick-root .ac-message { margin-inline:14px; }
        #kronos-autoclick-root .ac-bottom { grid-template-columns:1fr; }
        #kronos-autoclick-root .ac-groups { max-height:260px; }
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
        <div class="ac-hero">
          <div class="ac-hero-top">
            <div>
              <div class="ac-kicker">KRONOS AUTOMATION ENGINE</div>
              <div class="ac-title">⚡ AutoClick</div>
              <div class="ac-description">اجرای خودکار @MeowieQBot با کنترل کامل روی گروه مقصد، عملیات و وضعیت فعال بودن سرویس.</div>
            </div>
            <div id="acStatus" class="ac-status">غیرفعال</div>
          </div>
        </div>

        <div id="acMessage" class="ac-message" aria-live="polite"></div>

        <div class="ac-body">
          <div class="ac-grid">
            <div class="ac-card">
              <div class="ac-card-title">🎯 گروه مقصد</div>
              <div class="ac-card-subtitle">گروه موردنظر برای دریافت فرمان‌های AutoClick را انتخاب کنید.</div>
              <div id="acGroups" class="ac-groups"><div class="ac-empty"><span class="ac-spinner"></span> در حال دریافت گروه‌ها…</div></div>
            </div>

            <div class="ac-card">
              <div class="ac-card-title">🧩 عملیات</div>
              <div class="ac-card-subtitle">یکی از گزینه‌های منوی @MeowieQBot را مشخص کنید.</div>
              <div id="acActions" class="ac-actions"></div>

              <div class="ac-settings">
                <div class="ac-setting">
                  <div><strong>فعال‌سازی AutoClick</strong><small>برای اجرای تست باید سرویس فعال و پیکربندی شده باشد.</small></div>
                  <label class="ac-switch"><input id="acEnabled" type="checkbox"><span></span></label>
                </div>
              </div>

              <div class="ac-bottom">
                <button id="acSave" type="button" class="ac-button secondary">💾 ذخیره تنظیمات</button>
                <button id="acRun" type="button" class="ac-button primary">▶ اجرای تست</button>
              </div>

              <div id="acResult" class="ac-result">
                <div class="ac-result-head">◉ آخرین وضعیت اجرا</div>
                <div class="ac-result-body">هنوز اجرایی انجام نشده است.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const app = document.querySelector(".app");
    if (app) {
      const main = app.querySelector("main");
      if (main) main.insertAdjacentElement("beforebegin", node);
      else app.appendChild(node);
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
        <span class="ac-action-icon">${action.icon}</span>
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
        setMessage(null);
      });
    });
  }

  function renderGroups() {
    const node = el("acGroups");
    if (!node) return;

    if (!state.groups.length) {
      node.innerHTML = '<div class="ac-empty">هیچ گروه فعالی پیدا نشد.<br>ابتدا گفتگوها را از بخش «مقصدها» همگام‌سازی کنید.</div>';
      return;
    }

    node.innerHTML = state.groups.map((group) => {
      const id = Number(group.id);
      const active = id === Number(state.groupId);
      const meta = group.username ? `@${esc(group.username)}` : "Telegram Group";
      return `
        <button type="button" class="ac-group ${active ? "active" : ""}" data-ac-group-id="${esc(id)}">
          <span class="ac-group-icon">👥</span>
          <span>
            <span class="ac-group-name">${esc(group.title || "گروه بدون نام")}</span>
            <span class="ac-group-meta">${meta}</span>
          </span>
          <span class="ac-check">${active ? "✓" : "○"}</span>
        </button>
      `;
    }).join("");

    node.querySelectorAll("[data-ac-group-id]").forEach((button) => {
      button.addEventListener("click", () => {
        state.groupId = Number(button.dataset.acGroupId);
        renderGroups();
        renderState();
        setMessage(null);
      });
    });
  }

  function renderState() {
    const status = el("acStatus");
    const enabled = el("acEnabled");
    const save = el("acSave");
    const run = el("acRun");

    if (status) {
      status.textContent = state.running ? "در حال اجرا…" : state.enabled ? "فعال" : "غیرفعال";
      status.className = `ac-status${state.running ? " busy" : state.enabled ? " on" : ""}`;
    }

    if (enabled) enabled.checked = Boolean(state.enabled);
    if (save) save.disabled = state.loading || state.running;
    if (run) run.disabled = state.loading || state.running || !state.enabled || !state.groupId;
  }

  function renderResult(text, success = false, data = null) {
    const node = el("acResult");
    if (!node) return;

    if (!text) {
      node.innerHTML = '<div class="ac-result-head">◉ آخرین وضعیت اجرا</div><div class="ac-result-body">هنوز اجرایی انجام نشده است.</div>';
      return;
    }

    if (success && data) {
      node.innerHTML = `<div class="ac-result-head">✅ اجرای آخر موفق</div><div class="ac-result-body"><strong>${esc(data.action || state.action)}</strong><br>گروه: ${esc(data.group?.title || "-")}<br>دکمه: ${esc(data.clicked_button || "-")}<br>زمان اجرا: ${esc(data.elapsed_ms ?? "-")} ms</div>`;
      return;
    }

    node.innerHTML = `<div class="ac-result-head">⚠️ وضعیت اجرا</div><div class="ac-result-body">${esc(text)}</div>`;
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
    setMessage("در حال بارگذاری تنظیمات…", "info");

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
      renderResult(null);
      setMessage(null);
    } catch (error) {
      console.error("Kronos AutoClick load failed:", error);
      renderResult(error?.message || "بارگذاری AutoClick ناموفق بود.");
      setMessage(error?.message || "بارگذاری AutoClick ناموفق بود.", "error");
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
    setMessage("تنظیمات AutoClick ذخیره شد.", "success");
  }

  async function execute() {
    if (state.running) return;
    if (!state.groupId) return setMessage("ابتدا یک گروه مقصد انتخاب کنید.", "error");
    if (!state.enabled) return setMessage("ابتدا AutoClick را فعال کنید و تنظیمات را ذخیره کنید.", "error");

    state.running = true;
    renderState();
    renderResult("در حال ارسال فرمان به Telegram و پیدا کردن منوی ربات…");
    setMessage("در حال اجرای تست AutoClick…", "info");

    try {
      const data = await api("/api/autoclick/execute", {
        method: "POST",
        body: JSON.stringify({ action: state.action }),
      });

      renderResult(null, true, data);
      setMessage("AutoClick با موفقیت اجرا شد.", "success");
    } catch (error) {
      console.error("Kronos AutoClick execution failed:", error);
      const text = error?.message || "اجرای اتوکلیک ناموفق بود.";
      renderResult(text);
      setMessage(text, "error");
    } finally {
      state.running = false;
      renderState();
    }
  }

  function bindControls() {
    el("acEnabled")?.addEventListener("change", (event) => {
      state.enabled = Boolean(event.target.checked);
      renderState();
      setMessage(null);
    });

    el("acSave")?.addEventListener("click", async () => {
      if (state.loading || state.running) return;
      try {
        await saveSettings();
      } catch (error) {
        console.error("Kronos AutoClick save failed:", error);
        setMessage(error?.message || "ذخیره تنظیمات ناموفق بود.", "error");
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

  function setMessage(text, type = "info") {
    const node = el("acMessage");
    if (!node) return;
    if (!text) {
      node.textContent = "";
      node.className = "ac-message";
      return;
    }
    node.textContent = String(text);
    node.className = `ac-message ${type} visible`;
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
