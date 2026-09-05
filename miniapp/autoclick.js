(() => {
  "use strict";

  const ACTIONS = [
    { value: "فروش ماهی", icon: "🐟", title: "فروش ماهی", description: "بعد از هر ارسال ماهی، دکمه فروش ماهی را می‌زند." },
    { value: "بده پیشی بخوره", icon: "🐱", title: "بده پیشی بخوره", description: "بعد از هر ارسال ماهی، گزینه غذا دادن را اجرا می‌کند." },
    { value: "بندازش توی یخچال", icon: "🧊", title: "بندازش توی یخچال", description: "بعد از هر ارسال ماهی، گزینه یخچال را اجرا می‌کند." },
  ];

  const DEFAULT_INTERVAL = 10;
  const MIN_INTERVAL = 1;
  const MAX_INTERVAL = 86400;

  const state = {
    setting: null,
    groups: [],
    groupId: null,
    action: ACTIONS[0].value,
    interval: DEFAULT_INTERVAL,
    enabled: false,
    loading: false,
    saving: false,
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
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { detail: text };
    }

    if (!response.ok) {
      throw new Error(typeof data?.detail === "string" ? data.detail : "درخواست ناموفق بود.");
    }

    return data;
  }

  function notice(text, type = "info") {
    const node = el("acMessage");
    if (!node) return;
    node.textContent = String(text || "");
    node.className = `ac-message ${type}${text ? " visible" : ""}`;
  }

  function injectStyles() {
    if (el("kronos-autoclick-styles")) return;

    const style = document.createElement("style");
    style.id = "kronos-autoclick-styles";
    style.textContent = `
      #kronos-autoclick-root{display:none!important;width:min(1120px,100%)!important;margin:0 auto 110px!important;box-sizing:border-box;}
      #kronos-autoclick-root.ac-open{display:block!important;animation:ac-in .22s ease both;}
      #kronos-autoclick-root,#kronos-autoclick-root *{box-sizing:border-box}
      main.ac-main-hidden{display:none!important}
      #desktopNav{grid-template-columns:repeat(7,minmax(0,1fr))!important}
      .bottom{grid-template-columns:repeat(7,minmax(0,1fr))!important}
      #kronos-autoclick-root .ac-shell{overflow:hidden;border:1px solid rgba(149,168,199,.14);border-radius:28px;background:radial-gradient(900px 330px at 100% -5%,rgba(77,126,241,.20),transparent 62%),radial-gradient(620px 260px at 0% 100%,rgba(82,221,255,.07),transparent 65%),linear-gradient(180deg,#111a28,#071019);box-shadow:0 30px 100px rgba(0,0,0,.42)}
      #kronos-autoclick-root .ac-hero{padding:22px 22px 18px;border-bottom:1px solid rgba(149,168,199,.10)}
      #kronos-autoclick-root .ac-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}
      #kronos-autoclick-root .ac-kicker{color:#79a8ee;font-size:8px;font-weight:950;letter-spacing:.18em}
      #kronos-autoclick-root .ac-title{margin-top:5px;font-size:clamp(22px,5vw,31px);font-weight:950;line-height:1.15}
      #kronos-autoclick-root .ac-description{max-width:780px;margin-top:8px;color:#8492a8;font-size:9px;line-height:1.9}
      #kronos-autoclick-root .ac-status{min-width:112px;padding:10px 12px;border-radius:999px;text-align:center;font-size:8px;font-weight:950;border:1px solid rgba(149,168,199,.14);color:#9da8b8;background:rgba(128,138,153,.09)}
      #kronos-autoclick-root .ac-status.on{color:#9ff0c7;background:rgba(80,212,147,.09);border-color:rgba(80,212,147,.24)}
      #kronos-autoclick-root .ac-message{display:none;margin:14px 22px 0;padding:11px 13px;border-radius:14px;font-size:9px;line-height:1.8;white-space:pre-wrap}
      #kronos-autoclick-root .ac-message.visible{display:block}.ac-message.info{color:#b6d3ff;background:rgba(77,125,255,.10);border:1px solid rgba(102,164,255,.18)}
      #kronos-autoclick-root .ac-message.success{color:#a0edc6;background:rgba(80,212,147,.08);border:1px solid rgba(80,212,147,.18)}
      #kronos-autoclick-root .ac-message.error{color:#ffb2bf;background:rgba(139,35,55,.14);border:1px solid rgba(255,111,131,.20)}
      #kronos-autoclick-root .ac-body{padding:18px 22px 22px}
      #kronos-autoclick-root .ac-layout{display:grid;grid-template-columns:1.05fr .95fr;gap:14px}
      #kronos-autoclick-root .ac-card{padding:15px;border:1px solid rgba(149,168,199,.11);border-radius:20px;background:rgba(7,12,19,.58)}
      #kronos-autoclick-root .ac-card-title{font-size:11px;font-weight:950}.ac-card-subtitle{margin-top:4px;color:#8290a6;font-size:8px;line-height:1.7}
      #kronos-autoclick-root .ac-groups{display:grid;gap:8px;margin-top:12px;max-height:300px;overflow:auto}
      #kronos-autoclick-root .ac-group{width:100%;display:flex;align-items:center;gap:10px;padding:11px;text-align:right;color:#f4f7ff;background:#0b111a;border:1px solid rgba(149,168,199,.12);border-radius:15px;cursor:pointer;transition:.16s ease}
      #kronos-autoclick-root .ac-group:hover,#kronos-autoclick-root .ac-action:hover{transform:translateY(-1px)}
      #kronos-autoclick-root .ac-group.active,#kronos-autoclick-root .ac-action.active{border-color:rgba(102,164,255,.52);background:linear-gradient(135deg,rgba(77,125,255,.15),rgba(77,125,255,.05))}
      #kronos-autoclick-root .ac-group-icon,#kronos-autoclick-root .ac-action-icon{display:grid;place-items:center;flex:none;border-radius:12px;background:linear-gradient(145deg,#17283e,#0d1727)}
      #kronos-autoclick-root .ac-group-icon{width:38px;height:38px;font-size:18px}.ac-group-name{display:block;font-size:9px;font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ac-group-meta{display:block;margin-top:3px;color:#8290a6;font-size:7px}.ac-check{margin-inline-start:auto;color:#7f8da1}.ac-group.active .ac-check{color:#9ff0c7}
      #kronos-autoclick-root .ac-actions{display:grid;gap:8px;margin-top:12px}.ac-action{width:100%;display:flex;align-items:center;gap:10px;padding:10px;text-align:right;color:#f4f7ff;background:#0b111a;border:1px solid rgba(149,168,199,.12);border-radius:15px;cursor:pointer;transition:.16s ease}.ac-action-icon{width:42px;height:42px;font-size:20px}.ac-action-title{display:block;font-size:9px;font-weight:950}.ac-action-description{display:block;margin-top:3px;color:#8290a6;font-size:7px;line-height:1.65}
      #kronos-autoclick-root .ac-control{display:grid;gap:10px;margin-top:12px}.ac-row{padding:12px;border-radius:15px;background:#0b111a;border:1px solid rgba(149,168,199,.12)}.ac-row-top{display:flex;justify-content:space-between;align-items:center;gap:10px}.ac-row strong{font-size:9px}.ac-row small{display:block;margin-top:4px;color:#8290a6;font-size:7px;line-height:1.7}
      #kronos-autoclick-root .ac-input-wrap{display:flex;align-items:center;gap:8px;margin-top:9px}.ac-input{width:120px;padding:10px 11px;border-radius:12px;border:1px solid rgba(149,168,199,.16);background:#101a27;color:#f3f6ff;outline:0;font:inherit;font-size:9px;font-weight:900}.ac-input:focus{border-color:rgba(102,164,255,.55)}.ac-unit{color:#8290a6;font-size:8px}
      #kronos-autoclick-root .ac-switch{position:relative;width:48px;height:27px;flex:none}.ac-switch input{position:absolute;width:1px;height:1px;opacity:0}.ac-switch span{position:absolute;inset:0;border-radius:999px;background:#293444;border:1px solid rgba(255,255,255,.08);cursor:pointer}.ac-switch span::before{content:"";position:absolute;top:3px;left:3px;width:19px;height:19px;border-radius:50%;background:#c7d0dc;transition:.18s ease}.ac-switch input:checked+span{background:rgba(80,212,147,.25);border-color:rgba(80,212,147,.35)}.ac-switch input:checked+span::before{transform:translateX(21px);background:#9ff0c7}
      #kronos-autoclick-root .ac-summary{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-top:12px}.ac-stat{padding:10px;border-radius:14px;background:rgba(255,255,255,.025);border:1px solid rgba(149,168,199,.08)}.ac-stat b{display:block;font-size:12px}.ac-stat span{display:block;margin-top:3px;color:#8290a6;font-size:7px}
      #kronos-autoclick-root .ac-note{margin-top:12px;padding:11px 12px;border-radius:14px;background:rgba(77,125,255,.07);border:1px solid rgba(102,164,255,.12);color:#9db1ce;font-size:8px;line-height:1.8}
      #kronos-autoclick-root .ac-button{width:100%;border:0;border-radius:14px;padding:12px;color:#f4f7ff;font-size:9px;font-weight:950;cursor:pointer;margin-top:12px;background:linear-gradient(135deg,#4d7ef1,#67a1ff);box-shadow:0 12px 30px rgba(77,126,241,.16)}.ac-button:disabled{opacity:.55;cursor:wait}
      #kronos-autoclick-root .ac-empty{padding:18px 10px;text-align:center;color:#8290a6;border:1px dashed rgba(149,168,199,.14);border-radius:14px;font-size:8px;line-height:1.8}
      @keyframes ac-in{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:none}}
      @media(max-width:860px){#kronos-autoclick-root .ac-layout{grid-template-columns:1fr}}
      @media(max-width:600px){#kronos-autoclick-root .ac-body{padding:12px}.ac-hero{padding:17px 14px 14px!important}.ac-message{margin-inline:14px!important}.ac-head{gap:8px}.ac-status{min-width:94px}.ac-summary{grid-template-columns:1fr 1fr!important}.ac-groups{max-height:250px!important}}
    `;
    document.head.appendChild(style);
  }

  function buildRoot() {
    if (root()) return root();

    const node = document.createElement("section");
    node.id = "kronos-autoclick-root";
    node.innerHTML = `
      <div class="ac-shell">
        <div class="ac-hero">
          <div class="ac-head">
            <div>
              <div class="ac-kicker">KRONOS • PERSISTENT AUTOMATION</div>
              <div class="ac-title">AutoClick</div>
              <div class="ac-description">پس از فعال‌سازی، Kronos بلافاصله «ماهی» را در گروه انتخاب‌شده می‌فرستد، فقط همان‌وقت منوی مربوط را پیدا می‌کند، اکشن انتخابی را می‌زند و سپس تا زمان چرخه بعدی صبر می‌کند. این روند تا خاموش‌کردن دستی ادامه دارد.</div>
            </div>
            <div id="acStatus" class="ac-status">خاموش</div>
          </div>
        </div>
        <div id="acMessage" class="ac-message"></div>
        <div class="ac-body">
          <div class="ac-layout">
            <div class="ac-card">
              <div class="ac-card-title">گروه هدف</div>
              <div class="ac-card-subtitle">پیام «ماهی» فقط داخل این گروه ارسال می‌شود.</div>
              <div id="acGroups" class="ac-groups"></div>
            </div>
            <div class="ac-card">
              <div class="ac-card-title">اکشن منو</div>
              <div class="ac-card-subtitle">هر بار بعد از ارسال موفق «ماهی»، همین گزینه اجرا می‌شود.</div>
              <div id="acActions" class="ac-actions"></div>

              <div class="ac-control">
                <div class="ac-row">
                  <div class="ac-row-top">
                    <div>
                      <strong>فاصله بین ارسال‌ها</strong>
                      <small>زمان انتظار بین پایان یک چرخه و ارسال «ماهی» بعدی.</small>
                    </div>
                  </div>
                  <div class="ac-input-wrap">
                    <input id="acInterval" class="ac-input" type="number" min="1" max="86400" step="1" inputmode="numeric" />
                    <span class="ac-unit">ثانیه</span>
                  </div>
                </div>

                <div class="ac-row">
                  <div class="ac-row-top">
                    <div>
                      <strong>فعال‌سازی دائمی</strong>
                      <small>با روشن‌شدن، چرخه بدون نیاز به دکمه تست یا شروع دستی اجرا می‌شود.</small>
                    </div>
                    <label class="ac-switch" aria-label="فعال‌سازی AutoClick">
                      <input id="acEnabled" type="checkbox" />
                      <span></span>
                    </label>
                  </div>
                </div>
              </div>

              <div class="ac-summary">
                <div class="ac-stat"><b id="acGroupStat">—</b><span>گروه</span></div>
                <div class="ac-stat"><b id="acIntervalStat">—</b><span>فاصله</span></div>
                <div class="ac-stat"><b id="acActionStat">—</b><span>اکشن</span></div>
              </div>

              <div class="ac-note">هیچ «تعیین زمان استارت» یا اسکن دستی وجود ندارد. با روشن‌کردن قابلیت، اولین «ماهی» باید بلافاصله ارسال شود و هر اسکن منو فقط در واکنش به همان پیام تازه انجام شود.</div>
              <button id="acSave" class="ac-button">ذخیره تنظیمات</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const app = document.querySelector(".app") || document.body;
    const main = document.querySelector("main");
    if (main && main.parentElement === app) app.insertBefore(node, main);
    else app.appendChild(node);

    return node;
  }

  function renderGroups() {
    const wrap = el("acGroups");
    if (!wrap) return;

    if (!state.groups.length) {
      wrap.innerHTML = `<div class="ac-empty">گروه فعالی پیدا نشد. ابتدا یک گروه را در بخش مقاصد همگام‌سازی کنید.</div>`;
      return;
    }

    wrap.innerHTML = state.groups.map((group) => {
      const active = String(group.id) === String(state.groupId);
      const title = group.title || group.username || `گروه ${group.id}`;
      const meta = group.username ? `@${String(group.username).replace(/^@/, "")}` : "گروه Telegram";
      return `
        <button type="button" class="ac-group ${active ? "active" : ""}" data-ac-group="${esc(group.id)}">
          <span class="ac-group-icon">◉</span>
          <span><span class="ac-group-name">${esc(title)}</span><span class="ac-group-meta">${esc(meta)}</span></span>
          <span class="ac-check">${active ? "✓" : "○"}</span>
        </button>
      `;
    }).join("");
  }

  function renderActions() {
    const wrap = el("acActions");
    if (!wrap) return;

    wrap.innerHTML = ACTIONS.map((item) => {
      const active = item.value === state.action;
      return `
        <button type="button" class="ac-action ${active ? "active" : ""}" data-ac-action="${esc(item.value)}">
          <span class="ac-action-icon">${item.icon}</span>
          <span><span class="ac-action-title">${esc(item.title)}</span><span class="ac-action-description">${esc(item.description)}</span></span>
        </button>
      `;
    }).join("");
  }

  function renderState() {
    const status = el("acStatus");
    if (status) {
      status.textContent = state.enabled ? "● فعال" : "خاموش";
      status.className = `ac-status${state.enabled ? " on" : ""}`;
    }

    const interval = Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, Number(state.interval) || DEFAULT_INTERVAL));
    if (el("acInterval")) el("acInterval").value = interval;
    if (el("acEnabled")) el("acEnabled").checked = Boolean(state.enabled);

    const selectedGroup = state.groups.find((item) => String(item.id) === String(state.groupId));
    const action = ACTIONS.find((item) => item.value === state.action);
    if (el("acGroupStat")) el("acGroupStat").textContent = selectedGroup?.title || "—";
    if (el("acIntervalStat")) el("acIntervalStat").textContent = `${interval}s`;
    if (el("acActionStat")) el("acActionStat").textContent = action?.title || "—";
  }

  async function loadData() {
    state.loading = true;
    try {
      const [setting, destinationResponse] = await Promise.all([
        api("/api/autoclick"),
        api("/api/destinations?kind=group"),
      ]);

      state.setting = setting || null;
      state.groups = Array.isArray(destinationResponse) ? destinationResponse : (destinationResponse?.items || destinationResponse?.destinations || []);
      state.groupId = setting?.group?.peer_id ?? null;
      state.action = setting?.selected_action || ACTIONS[0].value;
      state.interval = Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, Number(setting?.interval_seconds || DEFAULT_INTERVAL)));
      state.enabled = Boolean(setting?.enabled);

      renderGroups();
      renderActions();
      renderState();
    } catch (error) {
      notice(error?.message || "بارگذاری AutoClick ناموفق بود.", "error");
    } finally {
      state.loading = false;
    }
  }

  async function saveSettings({ fromToggle = false } = {}) {
    if (state.saving) return;
    if (!state.groupId) {
      if (state.enabled) {
        state.enabled = false;
        renderState();
      }
      notice("ابتدا یک گروه را انتخاب کنید.", "error");
      return;
    }

    const input = el("acInterval");
    const interval = Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, Number(input?.value || DEFAULT_INTERVAL)));
    state.interval = interval;
    state.saving = true;
    const button = el("acSave");
    if (button) {
      button.disabled = true;
      button.textContent = "در حال ذخیره…";
    }

    try {
      const data = await api("/api/autoclick", {
        method: "PUT",
        body: JSON.stringify({
          group_destination_id: Number(state.groupId),
          enabled: Boolean(state.enabled),
          selected_action: state.action,
          interval_seconds: interval,
        }),
      });

      state.setting = data;
      state.enabled = Boolean(data?.enabled);
      state.interval = Number(data?.interval_seconds || interval);
      renderState();
      notice(
        state.enabled
          ? "AutoClick فعال شد؛ اولین «ماهی» بلافاصله ارسال می‌شود."
          : "AutoClick خاموش شد و چرخه دائمی متوقف می‌شود.",
        "success",
      );
    } catch (error) {
      if (fromToggle) {
        state.enabled = !state.enabled;
        renderState();
      }
      notice(error?.message || "ذخیره تنظیمات ناموفق بود.", "error");
    } finally {
      state.saving = false;
      if (button) {
        button.disabled = false;
        button.textContent = "ذخیره تنظیمات";
      }
    }
  }

  function installEvents() {
    document.addEventListener("click", (event) => {
      const group = event.target.closest?.("[data-ac-group]");
      if (group) {
        state.groupId = group.dataset.acGroup;
        renderGroups();
        renderState();
        if (state.enabled) saveSettings();
        return;
      }

      const action = event.target.closest?.("[data-ac-action]");
      if (action) {
        state.action = action.dataset.acAction;
        renderActions();
        renderState();
        if (state.enabled) saveSettings();
      }
    });

    el("acEnabled")?.addEventListener("change", () => {
      const checkbox = el("acEnabled");
      if (!state.groupId && checkbox.checked) {
        checkbox.checked = false;
        notice("ابتدا گروه هدف را انتخاب کنید.", "error");
        return;
      }
      state.enabled = checkbox.checked;
      renderState();
      saveSettings({ fromToggle: true });
    });

    el("acInterval")?.addEventListener("change", () => {
      state.interval = Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, Number(el("acInterval").value || DEFAULT_INTERVAL)));
      renderState();
      if (state.enabled) saveSettings();
    });

    el("acSave")?.addEventListener("click", () => saveSettings());
  }

  function bridgeShowTab() {
    if (window.__kronosAutoClickBridge) return;
    window.__kronosAutoClickBridge = true;

    const original = typeof window.showTab === "function" ? window.showTab.bind(window) : null;
    window.showTab = function patchedShowTab(id) {
      if (id === "autoclick") {
        open();
        return;
      }
      if (root()) root().classList.remove("ac-open");
      const main = document.querySelector("main");
      if (main) main.classList.remove("ac-main-hidden");
      return original ? original(id) : undefined;
    };
  }

  function installNavigation() {
    const navTargets = [
      document.querySelector("#desktopNav"),
      document.querySelector(".bottom"),
    ].filter(Boolean);

    for (const nav of navTargets) {
      if (nav.querySelector?.('[data-tab="autoclick"]')) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.tab = "autoclick";
      button.innerHTML = `<span style="font-size:16px">⚡</span><span>AutoClick</span>`;
      button.addEventListener("click", () => open());
      nav.appendChild(button);
    }
  }

  async function open() {
    injectStyles();
    const node = buildRoot();
    node.classList.add("ac-open");
    const main = document.querySelector("main");
    if (main) main.classList.add("ac-main-hidden");
    installNavigation();
    await loadData();
  }

  function boot() {
    injectStyles();
    buildRoot();
    installEvents();
    bridgeShowTab();
    installNavigation();
  }

  boot();
  window.KronosAutoClick = Object.freeze({ open, reload: loadData });
})();
