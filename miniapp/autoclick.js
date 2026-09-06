(() => {
  "use strict";

  const ACTIONS = [
    {
      value: "فروش ماهی",
      icon: "🐟",
      title: "فروش ماهی",
      description: "بعد از هر پیام «ماهی»، فروش ماهی را اجرا می‌کند.",
    },
    {
      value: "بده پیشی بخوره",
      icon: "🐱",
      title: "بده پیشی بخوره",
      description: "بعد از هر پیام «ماهی»، غذا دادن را اجرا می‌کند.",
    },
    {
      value: "بندازش توی یخچال",
      icon: "🧊",
      title: "بندازش توی یخچال",
      description: "بعد از هر پیام «ماهی»، گزینه یخچال را اجرا می‌کند.",
    },
  ];

  const DEFAULT_INTERVAL = 10;
  const MIN_INTERVAL = 1;
  const MAX_INTERVAL = 86400;

  const state = {
    groups: [],
    groupId: null,
    action: ACTIONS[0].value,
    interval: DEFAULT_INTERVAL,
    enabled: false,
    loading: false,
    saving: false,
  };

  const el = (id) =>
    document.getElementById(id);

  const root = () =>
    el("kronos-autoclick-root");


  async function api(
    path,
    options = {},
  ) {
    if (
      typeof window.api === "function"
    ) {
      return window.api(
        path,
        options,
      );
    }

    const headers = {
      ...(options.headers || {}),
    };

    const token =
      localStorage.getItem(
        "kronos_self_token",
      );

    if (token) {
      headers.Authorization =
        `Bearer ${token}`;
    }

    if (
      options.body &&
      !(options.body instanceof FormData) &&
      !headers["Content-Type"]
    ) {
      headers["Content-Type"] =
        "application/json";
    }

    const response = await fetch(
      path,
      {
        ...options,
        headers,
        cache: "no-store",
      },
    );

    const text =
      await response.text();

    let data = {};

    try {
      data = text
        ? JSON.parse(text)
        : {};
    } catch {
      data = {
        detail: text,
      };
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


  function notify(
    text,
    type = "info",
  ) {
    const node =
      el("acMessage");

    if (!node) return;

    node.textContent =
      String(text || "");

    node.className =
      `ac-message ${type}` +
      (text
        ? " visible"
        : "");
  }


  function escapeHtml(
    value,
  ) {
    return String(
      value ?? "",
    )
      .replaceAll(
        "&",
        "&amp;",
      )
      .replaceAll(
        "<",
        "&lt;",
      )
      .replaceAll(
        ">",
        "&gt;",
      )
      .replaceAll(
        '"',
        "&quot;",
      )
      .replaceAll(
        "'",
        "&#039;",
      );
  }


  function injectStyles() {
    if (
      el(
        "kronos-autoclick-styles",
      )
    ) {
      return;
    }

    const style =
      document.createElement(
        "style",
      );

    style.id =
      "kronos-autoclick-styles";

    style.textContent = `
      #kronos-autoclick-root {
        display: none !important;
        width: min(1120px, 100%) !important;
        margin: 0 auto 110px !important;
      }

      #kronos-autoclick-root.ac-open {
        display: block !important;
        animation: ac-in .22s ease both;
      }

      #kronos-autoclick-root,
      #kronos-autoclick-root * {
        box-sizing: border-box;
      }

      main.ac-main-hidden {
        display: none !important;
      }

      #desktopNav {
        grid-template-columns:
          repeat(
            7,
            minmax(0, 1fr)
          ) !important;
      }

      .bottom {
        grid-template-columns:
          repeat(
            7,
            minmax(0, 1fr)
          ) !important;
      }

      #kronos-autoclick-root .ac-shell {
        overflow: hidden;
        border: 1px solid
          rgba(
            149,
            168,
            199,
            .14
          );
        border-radius: 28px;
        background:
          radial-gradient(
            900px 330px at 100% -5%,
            rgba(
              77,
              126,
              241,
              .20
            ),
            transparent 62%
          ),
          radial-gradient(
            620px 260px at 0% 100%,
            rgba(
              82,
              221,
              255,
              .07
            ),
            transparent 65%
          ),
          linear-gradient(
            180deg,
            #111a28,
            #071019
          );
        box-shadow:
          0 30px 100px
          rgba(
            0,
            0,
            0,
            .42
          );
      }

      #kronos-autoclick-root .ac-hero {
        padding: 22px;
        border-bottom:
          1px solid
          rgba(
            149,
            168,
            199,
            .10
          );
      }

      #kronos-autoclick-root .ac-head {
        display: flex;
        justify-content:
          space-between;
        align-items:
          flex-start;
        gap: 14px;
      }

      #kronos-autoclick-root .ac-kicker {
        color: #79a8ee;
        font-size: 8px;
        font-weight: 950;
        letter-spacing: .18em;
      }

      #kronos-autoclick-root .ac-title {
        margin-top: 5px;
        font-size:
          clamp(
            22px,
            5vw,
            31px
          );
        font-weight: 950;
      }

      #kronos-autoclick-root .ac-description {
        max-width: 780px;
        margin-top: 8px;
        color: #8492a8;
        font-size: 9px;
        line-height: 1.9;
      }

      #kronos-autoclick-root .ac-status {
        min-width: 112px;
        padding: 10px 12px;
        border-radius: 999px;
        text-align: center;
        font-size: 8px;
        font-weight: 950;
        border:
          1px solid
          rgba(
            149,
            168,
            199,
            .14
          );
        color: #9da8b8;
        background:
          rgba(
            128,
            138,
            153,
            .09
          );
      }

      #kronos-autoclick-root .ac-status.on {
        color: #9ff0c7;
        background:
          rgba(
            80,
            212,
            147,
            .09
          );
        border-color:
          rgba(
            80,
            212,
            147,
            .24
          );
      }

      #kronos-autoclick-root .ac-message {
        display: none;
        margin: 14px 22px 0;
        padding: 11px 13px;
        border-radius: 14px;
        font-size: 9px;
        line-height: 1.8;
        white-space: pre-wrap;
      }

      #kronos-autoclick-root .ac-message.visible {
        display: block;
      }

      #kronos-autoclick-root .ac-message.info {
        color: #b6d3ff;
        background:
          rgba(
            77,
            125,
            255,
            .10
          );
        border:
          1px solid
          rgba(
            102,
            164,
            255,
            .18
          );
      }

      #kronos-autoclick-root .ac-message.success {
        color: #a0edc6;
        background:
          rgba(
            80,
            212,
            147,
            .08
          );
        border:
          1px solid
          rgba(
            80,
            212,
            147,
            .18
          );
      }

      #kronos-autoclick-root .ac-message.error {
        color: #ffb2bf;
        background:
          rgba(
            139,
            35,
            55,
            .14
          );
        border:
          1px solid
          rgba(
            255,
            111,
            131,
            .20
          );
      }

      #kronos-autoclick-root .ac-body {
        padding: 18px 22px 22px;
      }

      #kronos-autoclick-root .ac-layout {
        display: grid;
        grid-template-columns:
          1.05fr .95fr;
        gap: 14px;
      }

      #kronos-autoclick-root .ac-card {
        padding: 15px;
        border:
          1px solid
          rgba(
            149,
            168,
            199,
            .11
          );
        border-radius: 20px;
        background:
          rgba(
            7,
            12,
            19,
            .58
          );
      }

      #kronos-autoclick-root .ac-card-title {
        font-size: 11px;
        font-weight: 950;
      }

      #kronos-autoclick-root .ac-card-subtitle {
        margin-top: 4px;
        color: #8290a6;
        font-size: 8px;
        line-height: 1.7;
      }

      #kronos-autoclick-root .ac-groups {
        display: grid;
        gap: 8px;
        margin-top: 12px;
        max-height: 300px;
        overflow: auto;
      }

      #kronos-autoclick-root .ac-group {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 11px;
        text-align: right;
        color: #f4f7ff;
        background: #0b111a;
        border:
          1px solid
          rgba(
            149,
            168,
            199,
            .12
          );
        border-radius: 15px;
        cursor: pointer;
        transition:
          .16s ease;
      }

      #kronos-autoclick-root .ac-group:hover,
      #kronos-autoclick-root .ac-action:hover {
        transform:
          translateY(-1px);
      }

      #kronos-autoclick-root .ac-group.active,
      #kronos-autoclick-root .ac-action.active {
        border-color:
          rgba(
            102,
            164,
            255,
            .52
          );
        background:
          linear-gradient(
            135deg,
            rgba(
              77,
              125,
              255,
              .15
            ),
            rgba(
              77,
              125,
              255,
              .05
            )
          );
      }

      #kronos-autoclick-root .ac-group-icon,
      #kronos-autoclick-root .ac-action-icon {
        display: grid;
        place-items: center;
        flex: none;
        border-radius: 12px;
        background:
          linear-gradient(
            145deg,
            #17283e,
            #0d1727
          );
      }

      #kronos-autoclick-root .ac-group-icon {
        width: 38px;
        height: 38px;
        font-size: 18px;
      }

      #kronos-autoclick-root .ac-group-name {
        display: block;
        font-size: 9px;
        font-weight: 900;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #kronos-autoclick-root .ac-group-meta {
        display: block;
        margin-top: 3px;
        color: #8290a6;
        font-size: 7px;
      }

      #kronos-autoclick-root .ac-check {
        margin-inline-start: auto;
        color: #7f8da1;
      }

      #kronos-autoclick-root .ac-group.active .ac-check {
        color: #9ff0c7;
      }

      #kronos-autoclick-root .ac-actions {
        display: grid;
        gap: 8px;
        margin-top: 12px;
      }

      #kronos-autoclick-root .ac-action {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px;
        text-align: right;
        color: #f4f7ff;
        background: #0b111a;
        border:
          1px solid
          rgba(
            149,
            168,
            199,
            .12
          );
        border-radius: 15px;
        cursor: pointer;
        transition:
          .16s ease;
      }

      #kronos-autoclick-root .ac-action-icon {
        width: 42px;
        height: 42px;
        font-size: 20px;
      }

      #kronos-autoclick-root .ac-action-title {
        display: block;
        font-size: 9px;
        font-weight: 950;
      }

      #kronos-autoclick-root .ac-action-description {
        display: block;
        margin-top: 3px;
        color: #8290a6;
        font-size: 7px;
        line-height: 1.65;
      }

      #kronos-autoclick-root .ac-control {
        display: grid;
        gap: 10px;
        margin-top: 12px;
      }

      #kronos-autoclick-root .ac-row {
        padding: 12px;
        border-radius: 15px;
        background: #0b111a;
        border:
          1px solid
          rgba(
            149,
            168,
            199,
            .12
          );
      }

      #kronos-autoclick-root .ac-row-top {
        display: flex;
        justify-content:
          space-between;
        align-items:
          center;
        gap: 10px;
      }

      #kronos-autoclick-root .ac-row strong {
        font-size: 9px;
      }

      #kronos-autoclick-root .ac-row small {
        display: block;
        margin-top: 4px;
        color: #8290a6;
        font-size: 7px;
        line-height: 1.7;
      }

      #kronos-autoclick-root .ac-input-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 9px;
      }

      #kronos-autoclick-root .ac-input {
        width: 120px;
        padding: 10px 11px;
        border-radius: 12px;
        border:
          1px solid
          rgba(
            149,
            168,
            199,
            .16
          );
        background: #101a27;
        color: #f3f6ff;
        outline: 0;
        font: inherit;
        font-size: 9px;
        font-weight: 900;
      }

      #kronos-autoclick-root .ac-input:focus {
        border-color:
          rgba(
            102,
            164,
            255,
            .55
          );
      }

      #kronos-autoclick-root .ac-unit {
        color: #8290a6;
        font-size: 8px;
      }

      #kronos-autoclick-root .ac-switch {
        position: relative;
        width: 48px;
        height: 27px;
        flex: none;
      }

      #kronos-autoclick-root .ac-switch input {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
      }

      #kronos-autoclick-root .ac-switch span {
        position: absolute;
        inset: 0;
        border-radius: 999px;
        background: #293444;
        border:
          1px solid
          rgba(
            255,
            255,
            255,
            .08
          );
        cursor: pointer;
      }

      #kronos-autoclick-root .ac-switch span::before {
        content: "";
        position: absolute;
        top: 3px;
        left: 3px;
        width: 19px;
        height: 19px;
        border-radius: 50%;
        background: #c7d0dc;
        transition: .18s ease;
      }

      #kronos-autoclick-root .ac-switch input:checked + span {
        background:
          rgba(
            80,
            212,
            147,
            .25
          );
        border-color:
          rgba(
            80,
            212,
            147,
            .35
          );
      }

      #kronos-autoclick-root .ac-switch input:checked + span::before {
        transform:
          translateX(21px);
        background:
          #9ff0c7;
      }

      #kronos-autoclick-root .ac-note {
        margin-top: 12px;
        padding: 11px 12px;
        border-radius: 14px;
        background:
          rgba(
            77,
            125,
            255,
            .07
          );
        border:
          1px solid
          rgba(
            102,
            164,
            255,
            .12
          );
        color: #9db1ce;
        font-size: 8px;
        line-height: 1.8;
      }

      #kronos-autoclick-root .ac-button {
        width: 100%;
        border: 0;
        border-radius: 14px;
        padding: 12px;
        margin-top: 12px;
        color: #f4f7ff;
        font-size: 9px;
        font-weight: 950;
        cursor: pointer;
        background:
          linear-gradient(
            135deg,
            #4d7ef1,
            #67a1ff
          );
        box-shadow:
          0 12px 30px
          rgba(
            77,
            126,
            241,
            .16
          );
      }

      #kronos-autoclick-root .ac-button:disabled {
        opacity: .55;
        cursor: wait;
      }

      .ac-empty {
        padding: 18px 10px;
        text-align: center;
        color: #8290a6;
        border:
          1px dashed
          rgba(
            149,
            168,
            199,
            .14
          );
        border-radius: 14px;
        font-size: 8px;
        line-height: 1.8;
      }

      @keyframes ac-in {
        from {
          opacity: 0;
          transform:
            translateY(9px);
        }

        to {
          opacity: 1;
          transform: none;
        }
      }

      @media(max-width:860px) {
        #kronos-autoclick-root .ac-layout {
          grid-template-columns: 1fr;
        }
      }

      @media(max-width:600px) {
        #kronos-autoclick-root .ac-body {
          padding: 12px;
        }

        #kronos-autoclick-root .ac-hero {
          padding: 17px 14px 14px;
        }

        #kronos-autoclick-root .ac-message {
          margin-inline: 14px;
        }

        #kronos-autoclick-root .ac-head {
          gap: 8px;
        }

        #kronos-autoclick-root .ac-status {
          min-width: 94px;
        }

        #kronos-autoclick-root .ac-groups {
          max-height: 250px;
        }
      }
    `;

    document.head.appendChild(
      style,
    );
  }


  function buildRoot() {
    const existing = root();

    if (existing) {
      return existing;
    }

    const node =
      document.createElement(
        "section",
      );

    node.id =
      "kronos-autoclick-root";

    node.innerHTML = `
      <div class="ac-shell">

        <div class="ac-hero">
          <div class="ac-head">

            <div>
              <div class="ac-kicker">
                KRONOS • PERSISTENT AUTOMATION
              </div>

              <div class="ac-title">
                AutoClick
              </div>

              <div class="ac-description">
                با فعال‌سازی، Kronos بلافاصله
                «ماهی» را در گروه انتخاب‌شده ارسال
                می‌کند. فقط منوی ایجادشده بعد از همان
                پیام پیدا می‌شود، اکشن انتخابی اجرا
                می‌شود و بعد از فاصله مشخص‌شده چرخه
                دوباره آغاز می‌شود.
              </div>
            </div>

            <div
              id="acStatus"
              class="ac-status"
            >
              خاموش
            </div>

          </div>
        </div>

        <div
          id="acMessage"
          class="ac-message"
        ></div>

        <div class="ac-body">

          <div class="ac-layout">

            <div class="ac-card">

              <div class="ac-card-title">
                گروه هدف
              </div>

              <div class="ac-card-subtitle">
                تمام پیام‌های «ماهی» فقط در
                این گروه ارسال می‌شوند.
              </div>

              <div
                id="acGroups"
                class="ac-groups"
              ></div>

            </div>

            <div class="ac-card">

              <div class="ac-card-title">
                اکشن منو
              </div>

              <div class="ac-card-subtitle">
                بعد از هر «ماهی»، همین اکشن
                از منوی ربات اجرا می‌شود.
              </div>

              <div
                id="acActions"
                class="ac-actions"
              ></div>

              <div class="ac-control">

                <div class="ac-row">

                  <div class="ac-row-top">

                    <div>
                      <strong>
                        فاصله بین ارسال‌ها
                      </strong>

                      <small>
                        فاصله بین هر دو پیام «ماهی»
                        بر حسب ثانیه.
                      </small>
                    </div>

                  </div>

                  <div class="ac-input-wrap">

                    <input
                      id="acInterval"
                      class="ac-input"
                      type="number"
                      min="${MIN_INTERVAL}"
                      max="${MAX_INTERVAL}"
                      step="1"
                      inputmode="numeric"
                    >

                    <span class="ac-unit">
                      ثانیه
                    </span>

                  </div>

                </div>

                <div class="ac-row">

                  <div class="ac-row-top">

                    <div>
                      <strong>
                        اجرای دائمی
                      </strong>

                      <small>
                        بعد از روشن شدن، چرخه به‌صورت
                        خودکار ادامه پیدا می‌کند.
                      </small>
                    </div>

                    <label class="ac-switch">
                      <input
                        id="acEnabled"
                        type="checkbox"
                      >

                      <span></span>
                    </label>

                  </div>

                </div>

              </div>

              <div class="ac-note">
                Start Time وجود ندارد.
                با روشن کردن قابلیت، اولین «ماهی»
                بلافاصله ارسال می‌شود و سپس سیستم
                تا خاموش کردن دستی ادامه می‌دهد.
              </div>

              <button
                id="acSave"
                class="ac-button"
                type="button"
              >
                ذخیره و فعال‌سازی
              </button>

            </div>

          </div>

        </div>

      </div>
    `;

    const app =
      document.querySelector(
        ".app",
      );

    const main =
      document.querySelector(
        "main",
      );

    if (app && main) {
      app.insertBefore(
        node,
        main,
      );
    } else {
      document.body.appendChild(
        node,
      );
    }

    bindEvents();

    return node;
  }


  function renderGroups() {
    const node =
      el("acGroups");

    if (!node) return;

    if (!state.groups.length) {
      node.innerHTML = `
        <div class="ac-empty">
          هیچ گروه فعالی برای اکانت پیدا نشد.
        </div>
      `;

      return;
    }

    node.innerHTML =
      state.groups
        .map(
          (group) => {
            const active =
              Number(group.id) ===
              Number(state.groupId);

            const title =
              escapeHtml(
                group.title ||
                group.username ||
                `Group ${group.id}`,
              );

            const username =
              group.username
                ? `@${escapeHtml(
                    group.username,
                  )}`
                : "گروه Telegram";

            return `
              <button
                type="button"
                class="ac-group ${
                  active
                    ? "active"
                    : ""
                }"
                data-group-id="${group.id}"
              >
                <span class="ac-group-icon">
                  👥
                </span>

                <span>
                  <span class="ac-group-name">
                    ${title}
                  </span>

                  <span class="ac-group-meta">
                    ${username}
                  </span>
                </span>

                <span class="ac-check">
                  ${
                    active
                      ? "✓"
                      : "○"
                  }
                </span>
              </button>
            `;
          },
        )
        .join("");

    node
      .querySelectorAll(
        "[data-group-id]",
      )
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            () => {
              state.groupId =
                Number(
                  button.dataset.groupId,
                );

              renderGroups();
            },
          );
        },
      );
  }


  function renderActions() {
    const node =
      el("acActions");

    if (!node) return;

    node.innerHTML =
      ACTIONS
        .map(
          (action) => {
            const active =
              action.value ===
              state.action;

            return `
              <button
                type="button"
                class="ac-action ${
                  active
                    ? "active"
                    : ""
                }"
                data-action="${escapeHtml(
                  action.value,
                )}"
              >
                <span class="ac-action-icon">
                  ${action.icon}
                </span>

                <span>
                  <span class="ac-action-title">
                    ${escapeHtml(
                      action.title,
                    )}
                  </span>

                  <span class="ac-action-description">
                    ${escapeHtml(
                      action.description,
                    )}
                  </span>
                </span>
              </button>
            `;
          },
        )
        .join("");

    node
      .querySelectorAll(
        "[data-action]",
      )
      .forEach(
        (button) => {
          button.addEventListener(
            "click",
            () => {
              state.action =
                button.dataset.action;

              renderActions();
            },
          );
        },
      );
  }


  function renderState() {
    const status =
      el("acStatus");

    const enabled =
      el("acEnabled");

    const interval =
      el("acInterval");

    if (status) {
      status.textContent =
        state.enabled
          ? "فعال"
          : "خاموش";

      status.classList.toggle(
        "on",
        state.enabled,
      );
    }

    if (enabled) {
      enabled.checked =
        state.enabled;
    }

    if (interval) {
      interval.value =
        state.interval;
    }
  }


  async function loadData() {
    if (state.loading) {
      return;
    }

    state.loading = true;

    try {
      const [
        setting,
        groups,
      ] = await Promise.all([
        api(
          "/api/autoclick",
        ),
        api(
          "/api/destinations?kind=group",
        ),
      ]);

      state.groups =
        Array.isArray(groups)
          ? groups
          : Array.isArray(
                groups?.items,
              )
            ? groups.items
            : [];

      state.groupId =
        setting?.group
          ?.peer_id
          ? Number(
              setting.group.peer_id,
            )
          : null;

      state.action =
        ACTIONS.some(
          (item) =>
            item.value ===
            setting?.selected_action,
        )
          ? setting.selected_action
          : ACTIONS[0].value;

      state.interval =
        Math.max(
          MIN_INTERVAL,
          Math.min(
            MAX_INTERVAL,
            Number(
              setting?.interval_seconds ||
                DEFAULT_INTERVAL,
            ),
          ),
        );

      state.enabled =
        Boolean(
          setting?.enabled,
        );

      renderGroups();
      renderActions();
      renderState();

    } catch (error) {
      console.error(
        "[Kronos AutoClick] load failed",
        error,
      );

      notify(
        error?.message ||
          "دریافت تنظیمات AutoClick ناموفق بود.",
        "error",
      );

    } finally {
      state.loading = false;
    }
  }


  async function saveSettings() {
    if (state.saving) {
      return;
    }

    if (!state.groupId) {
      notify(
        "ابتدا یک گروه انتخاب کن.",
        "error",
      );

      return;
    }

    let interval =
      Number(
        el("acInterval")?.value ||
          DEFAULT_INTERVAL,
      );

    interval =
      Math.round(interval);

    if (
      interval < MIN_INTERVAL ||
      interval > MAX_INTERVAL
    ) {
      notify(
        `فاصله باید بین ${MIN_INTERVAL} تا ${MAX_INTERVAL} ثانیه باشد.`,
        "error",
      );

      return;
    }

    state.interval =
      interval;

    state.enabled =
      Boolean(
        el("acEnabled")
          ?.checked,
      );

    state.saving = true;

    const button =
      el("acSave");

    if (button) {
      button.disabled = true;
      button.textContent =
        "در حال ذخیره...";
    }

    try {
      const result =
        await api(
          "/api/autoclick",
          {
            method: "PUT",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              group_destination_id:
                Number(
                  state.groupId,
                ),
              enabled:
                state.enabled,
              selected_action:
                state.action,
              interval_seconds:
                state.interval,
            }),
          },
        );

      state.enabled =
        Boolean(result.enabled);

      state.interval =
        Number(
          result.interval_seconds ||
            state.interval,
        );

      notify(
        state.enabled
          ? "AutoClick فعال شد؛ اولین «ماهی» بلافاصله ارسال می‌شود."
          : "AutoClick خاموش شد.",
        "success",
      );

      renderState();

    } catch (error) {
      console.error(
        "[Kronos AutoClick] save failed",
        error,
      );

      notify(
        error?.message ||
          "ذخیره تنظیمات ناموفق بود.",
        "error",
      );

    } finally {
      state.saving = false;

      if (button) {
        button.disabled = false;

        button.textContent =
          "ذخیره و فعال‌سازی";
      }
    }
  }


  function bindEvents() {
    const save =
      el("acSave");

    if (save) {
      save.addEventListener(
        "click",
        saveSettings,
      );
    }
  }


  function bridgeShowTab() {
    if (
      typeof window.showTab !==
      "function"
    ) {
      return;
    }

    if (
      window.__kronosAutoClickBridge
    ) {
      return;
    }

    const originalShowTab =
      window.showTab;

    window.showTab =
      function (id) {
        if (
          id === "autoclick"
        ) {
          open();

          return;
        }

        close();

        return originalShowTab.call(
          this,
          id,
        );
      };

    window.__kronosAutoClickBridge =
      true;
  }


  function installNavigation() {
    const desktop =
      document.querySelector(
        "#desktopNav",
      );

    const bottom =
      document.querySelector(
        ".bottom",
      );

    const buttonHTML = `
      <button
        type="button"
        data-tab="autoclick"
        class="nav-item autoclick-nav"
      >
        ⚡
        <span>AutoClick</span>
      </button>
    `;

    if (
      desktop &&
      !desktop.querySelector(
        '[data-tab="autoclick"]',
      )
    ) {
      desktop.insertAdjacentHTML(
        "beforeend",
        buttonHTML,
      );
    }

    if (
      bottom &&
      !bottom.querySelector(
        '[data-tab="autoclick"]',
      )
    ) {
      bottom.insertAdjacentHTML(
        "beforeend",
        buttonHTML,
      );
    }

    document
      .querySelectorAll(
        '[data-tab="autoclick"]',
      )
      .forEach(
        (button) => {
          if (
            button.dataset.acBound
          ) {
            return;
          }

          button.dataset.acBound =
            "1";

          button.addEventListener(
            "click",
            (event) => {
              event.preventDefault();

              open();
            },
          );
        },
      );
  }


  function updateNavigation() {
    document
      .querySelectorAll(
        "[data-tab]",
      )
      .forEach(
        (button) => {
          button.classList.toggle(
            "active",
            button.dataset.tab ===
              "autoclick",
          );
        },
      );
  }


  function open() {
    injectStyles();

    const node =
      buildRoot();

    const main =
      document.querySelector(
        "main",
      );

    if (main) {
      main.classList.add(
        "ac-main-hidden",
      );
    }

    node.classList.add(
      "ac-open",
    );

    updateNavigation();

    bridgeShowTab();

    loadData();
  }


  function close() {
    const node =
      root();

    if (node) {
      node.classList.remove(
        "ac-open",
      );
    }

    const main =
      document.querySelector(
        "main",
      );

    if (main) {
      main.classList.remove(
        "ac-main-hidden",
      );
    }
  }


  function boot() {
    injectStyles();
    buildRoot();
    installNavigation();
    bridgeShowTab();
  }


  window.KronosAutoClick = {
    open,
    close,
    loadData,
  };


  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      boot,
      {
        once: true,
      },
    );
  } else {
    boot();
  }
})();