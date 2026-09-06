(() => {
  "use strict";

  const ready = () => typeof window.api === "function";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
  const show = (message, type = "error") => {
    if (typeof window.notice === "function") window.notice(message, type);
  };

  const state = {
    groups: [],
    data: null,
  };

  const inject = () => {
    const nav = document.getElementById("desktopNav");
    const main = document.querySelector("main");
    const bottom = document.querySelector(".bottom");
    if (!nav || !main) return false;
    if (document.getElementById("meowie")) return true;

    const makeNav = () => {
      const btn = document.createElement("button");
      btn.dataset.tab = "meowie";
      btn.innerHTML = "<span>🐱</span>میویی";
      btn.onclick = () => window.showTab?.("meowie");
      return btn;
    };
    nav.appendChild(makeNav());
    if (bottom) bottom.appendChild(makeNav());

    const section = document.createElement("section");
    section.id = "meowie";
    section.className = "page";
    section.innerHTML = `
      <div class="grid2">
        <div class="stack">
          <div class="card">
            <div class="head">
              <div><div class="eyebrow">MEOWIE ENGINE</div><h2>اتوماسیون هوشمند MeowieQBot</h2><p class="sub">اجرای مداوم، تشخیص پاسخ واقعی ربات و مدیریت خودکار گربه، میو و کارخانه.</p></div>
              <label class="pill" style="cursor:pointer;display:flex;gap:7px;align-items:center"><input id="mwEnabled" type="checkbox" style="width:auto"> فعال</label>
            </div>
            <div class="stack">
              <label class="sub">گروه هدف</label>
              <select id="mwGroup"><option value="">در حال دریافت گروه‌ها…</option></select>
            </div>
          </div>

          <div class="card">
            <div class="head"><div><div class="eyebrow">MEOW</div><h2>میو خودکار</h2><p class="sub">Cooldown واقعی از پاسخ MeowieQBot خوانده می‌شود.</p></div></div>
            <label class="item"><span class="main"><span class="title">فعال‌سازی میو</span><span class="meta">پس از هر پاسخ، زمان تلاش بعدی از پیام ربات استخراج می‌شود.</span></span><input id="mwMeow" type="checkbox" style="width:auto"></label>
            <div class="divider"></div>
            <label class="sub">Fallback retry (ثانیه)</label><input id="mwMeowRetry" type="number" min="5" max="3600" value="30">
          </div>

          <div class="card">
            <div class="head"><div><div class="eyebrow">CAT CORE</div><h2>گربه</h2><p class="sub">جمع‌آوری دوره‌ای و ارتقای خودکار تا زمانی که منابع کافی باشد.</p></div></div>
            <label class="item"><span class="main"><span class="title">موتور گربه</span><span class="meta">پانل گربه با فرمان «گربه» دریافت می‌شود.</span></span><input id="mwCat" type="checkbox" style="width:auto"></label>
            <div class="divider"></div>
            <label class="sub">جمع‌آوری هر چند ثانیه؟</label><input id="mwCollectInterval" type="number" min="10" max="86400" value="300">
            <div class="divider"></div>
            <label class="item"><span class="main"><span class="title">ارتقای خودکار</span><span class="meta">تا وقتی دکمه ارتقا وجود داشته باشد، ارتقا انجام می‌شود.</span></span><input id="mwCatUpgrade" type="checkbox" style="width:auto"></label>
            <div class="divider"></div>
            <label class="sub">تلاش مجدد ارتقا (ثانیه)</label><input id="mwCatUpgradeRetry" type="number" min="10" max="86400" value="300">
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <div class="head"><div><div class="eyebrow">FACTORY</div><h2>کارخونه میویی</h2><p class="sub">ارتقای بخش‌ها و اجرای تولیدهای انتخاب‌شده.</p></div></div>
            <label class="item"><span class="main"><span class="title">موتور کارخانه</span><span class="meta">اجرای «کارخونه میویی» و کنترل منوهای واقعی.</span></span><input id="mwFactory" type="checkbox" style="width:auto"></label>
            <div class="divider"></div>
            <label class="item"><span class="main"><span class="title">ارتقای انبار</span></span><input id="mwStorage" type="checkbox" style="width:auto"></label>
            <label class="item"><span class="main"><span class="title">ارتقای کارگران / صندلی</span></span><input id="mwWorkers" type="checkbox" style="width:auto"></label>
            <label class="item"><span class="main"><span class="title">ارتقای دستگاه‌ها</span></span><input id="mwMachines" type="checkbox" style="width:auto"></label>
          </div>

          <div class="card">
            <div class="head"><div><div class="eyebrow">PRODUCTION QUEUE</div><h2>صف تولید همزمان</h2><p class="sub">حداکثر ۴ محصول مستقل؛ درصد انتخاب‌شده برای هر محصول پایدار می‌ماند.</p></div></div>
            <div id="mwProducts" class="stack"></div>
          </div>

          <div class="card">
            <div class="actions">
              <button class="btn primary" id="mwSave">ذخیره و اعمال</button>
              <button class="btn" id="mwReload">بازخوانی</button>
            </div>
            <div id="mwStatus" class="empty">هنوز تنظیماتی ثبت نشده است.</div>
          </div>
        </div>
      </div>`;
    main.appendChild(section);
    bind();
    return true;
  };

  const productNames = [
    "تولیدی آبنبات",
    "تولیدی کیک",
    "تولیدی تکنولوژی",
    "تولیدی خودرو",
    "تولیدی هواپیما",
    "تولیدی تکنولوژی پیشرفته",
  ];

  const bind = () => {
    document.getElementById("mwReload")?.addEventListener("click", load);
    document.getElementById("mwSave")?.addEventListener("click", save);
    document.getElementById("mwGroup")?.addEventListener("change", e => {
      state.data = {...(state.data || {}), group_destination_id: Number(e.target.value) || null};
    });
  };

  const productRow = (index, current = {}) => {
    const row = document.createElement("div");
    row.className = "item";
    row.dataset.productIndex = String(index);
    row.innerHTML = `
      <div class="main">
        <select class="mw-product">${productNames.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join("")}</select>
        <div style="height:6px"></div>
        <div class="modegrid">
          ${[25,50,75,100].map(p => `<button type="button" class="mode mw-pct ${Number(current.percentage) === p ? "active" : ""}" data-pct="${p}">${p}%</button>`).join("")}
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:6px;font-size:8px">فعال <input class="mw-product-enabled" type="checkbox" style="width:auto"></label>`;
    const select = row.querySelector(".mw-product");
    const enabled = row.querySelector(".mw-product-enabled");
    select.value = current.product && productNames.includes(current.product) ? current.product : productNames[index] || productNames[0];
    enabled.checked = Boolean(current.enabled);
    row.querySelectorAll(".mw-pct").forEach(button => {
      button.onclick = () => {
        row.querySelectorAll(".mw-pct").forEach(b => b.classList.remove("active"));
        button.classList.add("active");
      };
    });
    return row;
  };

  const renderProducts = products => {
    const box = document.getElementById("mwProducts");
    if (!box) return;
    box.replaceChildren();
    for (let i = 0; i < 4; i++) box.appendChild(productRow(i, products?.[i] || {}));
  };

  const collectProducts = () => [...document.querySelectorAll("#mwProducts .item")].map(row => ({
    enabled: row.querySelector(".mw-product-enabled")?.checked || false,
    product: row.querySelector(".mw-product")?.value || "",
    percentage: Number(row.querySelector(".mw-pct.active")?.dataset.pct || 25),
  }));

  const loadGroups = async () => {
    const data = await window.api("/api/destinations");
    const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
    state.groups = items.filter(x => String(x.kind || "group") === "group");
    const select = document.getElementById("mwGroup");
    if (!select) return;
    select.innerHTML = `<option value="">انتخاب گروه…</option>` + state.groups.map(g => `<option value="${Number(g.id ?? g.destination_id ?? g.peer_id)}">${esc(g.title || g.name || g.peer_id)}</option>`).join("");
    if (state.data?.group_destination_id) select.value = String(state.data.group_destination_id);
  };

  const setForm = data => {
    state.data = data || {};
    const map = {
      mwEnabled: data.enabled,
      mwMeow: data.meow_enabled,
      mwCat: data.cat_enabled,
      mwCatUpgrade: data.cat_upgrade_enabled,
      mwFactory: data.factory_enabled,
      mwStorage: data.factory_storage_upgrade,
      mwWorkers: data.factory_workers_upgrade,
      mwMachines: data.factory_machines_upgrade,
    };
    for (const [id, value] of Object.entries(map)) {
      const node = document.getElementById(id);
      if (node) node.checked = Boolean(value);
    }
    document.getElementById("mwCollectInterval").value = Number(data.cat_collect_interval_seconds || 300);
    document.getElementById("mwCatUpgradeRetry").value = Number(data.cat_upgrade_retry_seconds || 300);
    document.getElementById("mwMeowRetry").value = Number(data.meow_retry_seconds || 30);
    const group = document.getElementById("mwGroup");
    if (group && data.group_peer_id && state.groups.length) {
      const match = state.groups.find(x => Number(x.peer_id ?? x.telegram_peer_id) === Number(data.group_peer_id) || Number(x.id) === Number(data.group_peer_id));
      if (match) group.value = String(match.id ?? match.destination_id ?? match.peer_id);
    }
    renderProducts(data.factory_products || []);
    const status = document.getElementById("mwStatus");
    if (status) status.textContent = data.enabled ? "✅ موتور فعال است." : "⏸ موتور خاموش است.";
  };

  const load = async () => {
    if (!ready()) return;
    try {
      const [data] = await Promise.all([window.api("/api/meowie"), loadGroups()]);
      setForm(data);
    } catch (error) {
      show(error?.message || "بارگذاری تنظیمات Meowie شکست خورد.");
    }
  };

  const save = async () => {
    if (!ready()) return;
    const groupDestinationId = Number(document.getElementById("mwGroup")?.value || 0) || null;
    const body = {
      enabled: document.getElementById("mwEnabled")?.checked || false,
      group_destination_id: groupDestinationId,
      meow_enabled: document.getElementById("mwMeow")?.checked || false,
      meow_retry_seconds: Number(document.getElementById("mwMeowRetry")?.value || 30),
      cat_enabled: document.getElementById("mwCat")?.checked || false,
      cat_collect_enabled: document.getElementById("mwCat")?.checked || false,
      cat_collect_interval_seconds: Number(document.getElementById("mwCollectInterval")?.value || 300),
      cat_upgrade_enabled: document.getElementById("mwCatUpgrade")?.checked || false,
      cat_upgrade_retry_seconds: Number(document.getElementById("mwCatUpgradeRetry")?.value || 300),
      factory_enabled: document.getElementById("mwFactory")?.checked || false,
      factory_storage_upgrade: document.getElementById("mwStorage")?.checked || false,
      factory_workers_upgrade: document.getElementById("mwWorkers")?.checked || false,
      factory_machines_upgrade: document.getElementById("mwMachines")?.checked || false,
      factory_products: collectProducts(),
    };
    try {
      const data = await window.api("/api/meowie", {method:"PUT", body:JSON.stringify(body)});
      setForm(data);
      show("✅ تنظیمات Meowie اعمال شد.", "success");
    } catch (error) {
      show(error?.message || "ذخیره تنظیمات انجام نشد.");
    }
  };

  const boot = () => {
    if (!inject()) return setTimeout(boot, 250);
    if (!ready()) return setTimeout(boot, 250);
    load();
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, {once:true});
  else boot();
})();
