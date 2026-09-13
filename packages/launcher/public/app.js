(() => {
  "use strict";

  const VERSION = "0.3.0";
  const STORE_KEY = "terminals.v1";
  const SETTINGS_KEY = "terminals.settings.v1";
  const CHECK_TIMEOUT_MS = 4000;
  const AUTO_CHECK_MS = 30000;
  const COLORS = ["blue", "cyan", "green", "lime", "orange", "red", "pink", "violet", "gray"];
  const TOOLBAR_MIN_ITEMS = 2;

  // ---------- storage ----------
  const readJSON = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const writeJSON = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  let items = readJSON(STORE_KEY, []);
  let settings = Object.assign({ autoCheck: true, appearance: "system" }, readJSON(SETTINGS_KEY, {}));
  const saveItems = () => writeJSON(STORE_KEY, items);
  const saveSettings = () => writeJSON(SETTINGS_KEY, settings);

  // Legacy key from the first prototype.
  const legacy = readJSON("terminals", null);
  if (legacy && !items.length) { items = legacy; saveItems(); localStorage.removeItem("terminals"); }

  // Fill fields introduced in 0.3 (colour, pinned) on older records.
  const pickColor = (seed) => COLORS[[...String(seed)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % (COLORS.length - 1)];
  let migrated = false;
  for (const item of items) {
    if (!COLORS.includes(item.color)) { item.color = pickColor(item.url); migrated = true; }
    if (typeof item.pinned !== "boolean") { item.pinned = false; migrated = true; }
  }
  if (migrated) saveItems();

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const isWide = () => matchMedia("(min-width: 720px)").matches;

  const normalizeUrl = (raw) => {
    let value = String(raw || "").trim();
    if (!value || /\s/.test(value)) return null;
    if (!/^https?:\/\//i.test(value)) value = "https://" + value;
    try {
      const url = new URL(value);
      if (!/^https?:$/.test(url.protocol)) return null;
      return url.href;
    } catch { return null; }
  };
  const hostOf = (url) => { try { return new URL(url).host; } catch { return url; } };
  const displayUrl = (url) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

  const timeAgo = (ts, { never = "아직 접속 안 함", now = "방금" } = {}) => {
    if (!ts) return never;
    const seconds = Math.round((Date.now() - ts) / 1000);
    if (seconds < 45) return now;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.round(hours / 24);
    return days < 30 ? `${days}일 전` : new Date(ts).toLocaleDateString();
  };

  const copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  };

  // ---------- toast (Vapor Toast: top-right stack) ----------
  const toastHost = $("#toasts");
  const toast = (message, kind = "info") => {
    const icon = { success: "#i-check-circle", danger: "#i-error-circle", info: "#i-info-circle" }[kind] || "#i-info-circle";
    const el = document.createElement("div");
    el.className = `v-toast ${kind}`;
    el.innerHTML = `<svg class="v-icon" aria-hidden="true"><use href="${icon}"/></svg><span></span>`;
    $("span", el).textContent = message;
    toastHost.prepend(el);
    while (toastHost.children.length > 3) toastHost.lastElementChild.remove();
    const leave = () => { el.dataset.leaving = ""; el.addEventListener("animationend", () => el.remove(), { once: true }); setTimeout(() => el.remove(), 400); };
    const timer = setTimeout(leave, 2600);
    el.addEventListener("click", () => { clearTimeout(timer); leave(); });
  };

  // ---------- theme (Vapor: <html data-vapor-theme>) ----------
  const darkQuery = matchMedia("(prefers-color-scheme: dark)");
  const applyTheme = () => {
    const mode = settings.appearance || "system";
    const dark = mode === "dark" || (mode === "system" && darkQuery.matches);
    document.documentElement.dataset.vaporTheme = dark ? "dark" : "light";
    $("#theme-color").content = dark ? "#282828" : "#ffffff";
    $$("[data-appearance]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.appearance === mode)));
  };
  darkQuery.addEventListener("change", applyTheme);
  $$("[data-appearance]").forEach((b) => b.addEventListener("click", () => {
    settings.appearance = b.dataset.appearance;
    saveSettings();
    applyTheme();
  }));

  // ---------- overlays (sheet / dialog) ----------
  let overlayReturnFocus = null;
  const openOverlay = (id) => {
    closeMenu();
    overlayReturnFocus = document.activeElement;
    const overlay = $(id);
    $$(".nav, .page").forEach((el) => { el.inert = true; });
    overlay.hidden = false;
    setTimeout(() => $("input:not([type=checkbox]):not([hidden]), textarea, button:not([data-close])", overlay)?.focus(), 30);
  };
  const closeOverlays = () => {
    if (!$$(".v-overlay:not([hidden])").length) return;
    $$(".v-overlay").forEach((s) => { s.hidden = true; });
    $$(".nav, .page").forEach((el) => { el.inert = false; });
    overlayReturnFocus?.focus?.();
    overlayReturnFocus = null;
  };
  document.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeOverlays(); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#menu").hidden) { closeMenu(); return; }
    closeOverlays();
  });

  // ---------- reachability ----------
  // Opaque no-cors fetch: resolves if the host answered anything, rejects on network failure.
  // Round-trip time is recorded so the badge can show latency.
  const status = new Map(); // id -> { state: "online" | "offline" | "checking", ms, at }
  let lastCheckedAt = 0;
  const probe = async (item) => {
    status.set(item.id, { state: "checking", ms: status.get(item.id)?.ms, at: status.get(item.id)?.at });
    paintStatus(item.id);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    const started = performance.now();
    try {
      await fetch(item.url, { mode: "no-cors", cache: "no-store", credentials: "omit", signal: controller.signal });
      status.set(item.id, { state: "online", ms: Math.round(performance.now() - started), at: Date.now() });
    } catch {
      status.set(item.id, { state: "offline", ms: null, at: Date.now() });
    } finally {
      clearTimeout(timer);
      paintStatus(item.id);
      paintSummary();
    }
  };
  let probing = null;
  const probeAll = () => {
    if (!items.length || probing) return probing || Promise.resolve();
    const btn = $("#refresh");
    btn.dataset.busy = "";
    probing = Promise.all(items.map(probe)).finally(() => {
      delete btn.dataset.busy;
      probing = null;
      lastCheckedAt = Date.now();
      paintSummary();
      if (filter !== "all") render(); // membership may have changed
    });
    return probing;
  };

  let autoTimer;
  const scheduleAuto = () => {
    clearInterval(autoTimer);
    if (settings.autoCheck) autoTimer = setInterval(() => { if (document.visibilityState === "visible") probeAll(); }, AUTO_CHECK_MS);
  };

  // ---------- filter / search ----------
  let filter = "all";
  let query = "";
  const stateOf = (item) => status.get(item.id)?.state || "unknown";
  const matches = (item) => {
    if (filter === "online" && stateOf(item) !== "online") return false;
    if (filter === "offline" && stateOf(item) !== "offline") return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return [item.label, item.url, item.note].some((v) => String(v || "").toLowerCase().includes(q));
  };
  $$("[data-filter]").forEach((b) => b.addEventListener("click", () => {
    filter = b.dataset.filter;
    $$("[data-filter]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    render();
  }));
  $("#search").addEventListener("input", (e) => { query = e.target.value.trim(); render(); });
  const resetFilter = () => {
    filter = "all"; query = "";
    $("#search").value = "";
    $$("[data-filter]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.filter === "all")));
    render();
  };

  // ---------- render ----------
  const list = $("#list");
  const cardTpl = $("#card-template");
  const emptyTpl = $("#empty-template");
  const nomatchTpl = $("#nomatch-template");

  const STATUS_LABEL = { online: "접속 가능", offline: "응답 없음", checking: "확인 중", unknown: "확인 전" };
  const STATUS_TONE = { online: "success", offline: "danger", checking: "warning", unknown: "hint" };

  const paintStatus = (id) => {
    const el = list.querySelector(`[data-id="${id}"] .term-status`);
    if (!el) return;
    const s = status.get(id) || { state: "unknown" };
    el.dataset.state = s.state;
    el.classList.remove("success", "danger", "warning", "hint");
    el.classList.add(STATUS_TONE[s.state]);
    $(".term-status-text", el).textContent = STATUS_LABEL[s.state];
    $(".term-spinner", el).hidden = s.state !== "checking";
    $(".term-status-ms", el).textContent = s.state === "online" && Number.isFinite(s.ms) ? `${s.ms}ms` : "";
  };

  const paintSummary = () => {
    const total = items.length;
    const online = items.filter((i) => stateOf(i) === "online").length;
    const offline = items.filter((i) => stateOf(i) === "offline").length;
    const checking = items.some((i) => stateOf(i) === "checking");
    const summary = $("#summary");
    summary.replaceChildren();
    const part = (text, cls) => { const s = document.createElement("span"); if (cls) s.className = cls; s.textContent = text; return s; };
    const sep = () => part("·", "sep");
    if (!total) {
      summary.append(part("아직 저장된 터미널이 없습니다"));
      summary.dataset.state = "unknown";
    } else if (checking) {
      summary.append(part(`${total}개 상태 확인 중`));
      summary.dataset.state = "unknown";
    } else if (online + offline === total) {
      summary.append(part(`${total}개 중 ${online}개 접속 가능`, "summary-online"));
      if (lastCheckedAt) {
        const ago = timeAgo(lastCheckedAt, { now: "방금 확인" });
        summary.append(sep(), part(ago.endsWith("확인") ? ago : `${ago} 확인`));
      }
      summary.dataset.state = online ? "online" : "offline";
    } else {
      summary.append(part(`${total}개 저장됨`), sep(), part("상태 확인 전"));
      summary.dataset.state = "unknown";
    }
    $('[data-count="all"]').textContent = total;
    $('[data-count="online"]').textContent = online;
    $('[data-count="offline"]').textContent = offline;
  };

  const sorted = () => [...items].sort((a, b) =>
    Number(b.pinned) - Number(a.pinned) || (b.lastUsed || 0) - (a.lastUsed || 0) || a.label.localeCompare(b.label));

  const render = () => {
    list.replaceChildren();
    $("#toolbar").hidden = items.length < TOOLBAR_MIN_ITEMS;
    if (!items.length) {
      list.append(emptyTpl.content.cloneNode(true));
      paintSummary();
      return;
    }
    const visible = sorted().filter(matches);
    if (!visible.length) {
      list.append(nomatchTpl.content.cloneNode(true));
      paintSummary();
      return;
    }
    for (const item of visible) {
      const node = cardTpl.content.firstElementChild.cloneNode(true);
      node.dataset.id = item.id;
      node.dataset.color = item.color;
      node.dataset.pinned = String(!!item.pinned);
      $(".term-open", node).href = item.url;
      $(".term-open", node).setAttribute("aria-label", `${item.label} 열기`);
      $(".term-label", node).textContent = item.label || hostOf(item.url);
      $(".term-pin", node).toggleAttribute("hidden", !item.pinned); // SVGElement has no .hidden
      $(".term-host", node).textContent = displayUrl(item.url);
      $(".term-last", node).textContent = timeAgo(item.lastUsed, { now: "방금 접속" });
      $(".term-note", node).textContent = item.note || "";
      $(".term-more", node).dataset.menu = item.id;
      $(".term-more", node).setAttribute("aria-label", `${item.label} 메뉴`);
      list.append(node);
      paintStatus(item.id);
    }
    paintSummary();
  };

  // ---------- open ----------
  const markUsed = (item) => { item.lastUsed = Date.now(); saveItems(); };

  // ---------- form ----------
  const form = $("#form");
  const fUrl = $("#f-url"), fLabel = $("#f-label"), fNote = $("#f-note"), fPinned = $("#f-pinned");
  let editingId = null;

  // Colour swatches: Vapor RadioCard pattern
  $("#f-colors").replaceChildren(...COLORS.map((c) => {
    const label = document.createElement("label");
    label.className = "v-radio-card swatch";
    label.style.setProperty("--swatch", c === "gray" ? "var(--vapor-color-gray-600)" : `var(--vapor-color-${c}-500)`);
    label.innerHTML = `<input type="radio" name="color" value="${c}"><span class="swatch-dot" aria-hidden="true"></span>`;
    label.title = c;
    return label;
  }));
  const setColor = (c) => { const input = form.querySelector(`input[name="color"][value="${c}"]`) || form.querySelector('input[name="color"]'); input.checked = true; };
  const getColor = () => form.querySelector('input[name="color"]:checked')?.value || COLORS[0];

  const openForm = (item = null, prefill = null) => {
    editingId = item?.id ?? null;
    $("#form-title").textContent = editingId ? "터미널 편집" : "터미널 추가";
    $("#f-submit").textContent = editingId ? "저장" : "추가";
    fUrl.value = item?.url ?? prefill?.url ?? "";
    fLabel.value = item?.label ?? prefill?.label ?? "";
    fNote.value = item?.note ?? "";
    fPinned.checked = !!item?.pinned;
    setColor(item?.color ?? pickColor(fUrl.value || Date.now()));
    fUrl.removeAttribute("aria-invalid");
    $("#f-url-error").hidden = true;
    openOverlay("#sheet-form");
    setTimeout(() => (fUrl.value ? fLabel : fUrl).focus(), 60);
  };

  fUrl.addEventListener("input", () => { fUrl.removeAttribute("aria-invalid"); $("#f-url-error").hidden = true; });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const url = normalizeUrl(fUrl.value);
    if (!url) {
      fUrl.setAttribute("aria-invalid", "true");
      $("#f-url-error").hidden = false;
      fUrl.focus();
      return;
    }
    const label = fLabel.value.trim() || hostOf(url);
    const note = fNote.value.trim();
    const color = getColor();
    const pinned = fPinned.checked;
    if (editingId) {
      const item = items.find((i) => i.id === editingId);
      if (item) Object.assign(item, { url, label, note, color, pinned });
      toast("저장했습니다", "success");
    } else {
      const dup = items.find((i) => i.url === url);
      if (dup) { Object.assign(dup, { label, note, color, pinned }); toast("이미 있는 주소라 정보만 갱신했습니다"); }
      else { items.push({ id: uuid(), url, label, note, color, pinned, lastUsed: 0, createdAt: Date.now() }); toast(`${label} 을(를) 추가했습니다`, "success"); }
    }
    saveItems();
    closeOverlays();
    render();
    probeAll();
  });

  // ---------- card interactions ----------
  list.addEventListener("click", (e) => {
    const open = e.target.closest("a.term-open");
    if (open) {
      const item = items.find((i) => i.id === open.closest(".term-card").dataset.id);
      if (item) markUsed(item);
      return; // let the navigation happen
    }
    const more = e.target.closest("button[data-menu]");
    if (more) { openMenu(more.dataset.menu, more); return; }
    if (e.target.closest('[data-action="add"]')) { openForm(); return; }
    if (e.target.closest('[data-action="reset-filter"]')) { resetFilter(); return; }
    // Tapping anywhere else on the card opens the terminal.
    const card = e.target.closest(".term-card");
    if (card && !e.target.closest("button, a")) $(".term-open", card).click();
  });
  list.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !e.target.classList.contains("term-card")) return;
    $(".term-open", e.target).click();
  });

  // ---------- menu (Vapor Menu; bottom sheet under 720px) ----------
  const menu = $("#menu");
  const menuBackdrop = $("#menu-backdrop");
  let menuId = null;
  let menuAnchor = null;

  const positionMenu = (anchor) => {
    menu.style.top = menu.style.right = menu.style.bottom = menu.style.left = "";
    if (!isWide()) return;
    const rect = anchor.getBoundingClientRect();
    const gap = 4;
    const height = menu.offsetHeight;
    const below = rect.bottom + gap + height <= window.innerHeight - 8;
    menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    if (below) { menu.style.top = `${rect.bottom + gap}px`; menu.style.setProperty("--menu-origin", "top right"); }
    else { menu.style.bottom = `${window.innerHeight - rect.top + gap}px`; menu.style.setProperty("--menu-origin", "bottom right"); }
  };

  const openMenu = (id, anchor) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    menuId = id;
    menuAnchor = anchor;
    $("#menu-title").textContent = `${item.label} · ${hostOf(item.url)}`;
    $("#menu-pin-label").textContent = item.pinned ? "고정 해제" : "상단에 고정";
    $('[data-menu="pin"] use', menu).setAttribute("href", item.pinned ? "#i-pin" : "#i-pin-outline");
    $('[data-menu="share"]', menu).hidden = !navigator.share && !navigator.clipboard;
    anchor.setAttribute("aria-expanded", "true");
    menuBackdrop.hidden = false;
    menu.hidden = false;
    positionMenu(anchor);
    $(".v-menu-item:not([hidden])", menu)?.focus();
  };
  const closeMenu = () => {
    if (menu.hidden) return;
    menu.hidden = true;
    menuBackdrop.hidden = true;
    menuAnchor?.setAttribute("aria-expanded", "false");
    menuAnchor?.focus?.();
    menuAnchor = null;
  };
  menuBackdrop.addEventListener("click", closeMenu);
  window.addEventListener("resize", () => { if (!menu.hidden && menuAnchor) positionMenu(menuAnchor); });
  menu.addEventListener("keydown", (e) => {
    const focusable = $$(".v-menu-item:not([hidden])", menu);
    const idx = focusable.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); focusable[(idx + 1) % focusable.length]?.focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); focusable[(idx - 1 + focusable.length) % focusable.length]?.focus(); }
    if (e.key === "Tab") closeMenu();
  });

  const registerLink = (item) => {
    const u = new URL(location.origin + "/");
    u.searchParams.set("add", item.url);
    if (item.label) u.searchParams.set("label", item.label);
    return u.href;
  };

  menu.addEventListener("click", async (e) => {
    const action = e.target.closest("[data-menu]")?.dataset.menu;
    const item = items.find((i) => i.id === menuId);
    if (!action || !item) return;
    const anchor = menuAnchor;
    closeMenu();
    switch (action) {
      case "pin":
        item.pinned = !item.pinned;
        saveItems(); render();
        toast(item.pinned ? "상단에 고정했습니다" : "고정을 해제했습니다", "success");
        break;
      case "open-new":
        markUsed(item); render();
        window.open(item.url, "_blank", "noopener");
        break;
      case "edit":
        overlayReturnFocus = anchor;
        openForm(item);
        break;
      case "copy": {
        const ok = await copyText(item.url);
        toast(ok ? "URL을 복사했습니다" : "복사에 실패했습니다", ok ? "success" : "danger");
        break;
      }
      case "share": {
        const link = registerLink(item);
        if (navigator.share) {
          try { await navigator.share({ title: `Terminals · ${item.label}`, text: `${item.label} 터미널 등록 링크`, url: link }); } catch { /* cancelled */ }
        } else {
          toast((await copyText(link)) ? "등록 링크를 복사했습니다" : "복사에 실패했습니다", "success");
        }
        break;
      }
      case "delete":
        askDelete(item, anchor);
        break;
    }
  });

  // ---------- delete dialog ----------
  let deletingId = null;
  const askDelete = (item, returnTo) => {
    deletingId = item.id;
    $("#delete-desc").textContent = `"${item.label}" (${hostOf(item.url)}) 을(를) 목록에서 삭제합니다. 터미널 자체에는 영향이 없습니다.`;
    openOverlay("#dialog-delete");
    overlayReturnFocus = returnTo || overlayReturnFocus;
    setTimeout(() => $("#delete-confirm").focus(), 30);
  };
  $("#delete-confirm").addEventListener("click", () => {
    const item = items.find((i) => i.id === deletingId);
    deletingId = null;
    closeOverlays();
    if (!item) return;
    items = items.filter((i) => i.id !== item.id);
    status.delete(item.id);
    saveItems();
    render();
    toast(`${item.label} 을(를) 삭제했습니다`);
  });

  // ---------- settings ----------
  $("#settings").addEventListener("click", () => {
    $("#s-autocheck").checked = settings.autoCheck;
    $("#s-import-box").hidden = true;
    $("#s-import-text").value = "";
    applyTheme();
    openOverlay("#sheet-settings");
  });
  $("#s-autocheck").addEventListener("change", (e) => { settings.autoCheck = e.target.checked; saveSettings(); scheduleAuto(); });

  $("#s-export").addEventListener("click", async () => {
    const payload = JSON.stringify(items.map(({ label, url, note, color, pinned }) => ({ label, url, note, color, pinned })), null, 2);
    toast((await copyText(payload)) ? `${items.length}개를 클립보드에 복사했습니다` : "복사에 실패했습니다", "success");
  });
  $("#s-import").addEventListener("click", () => {
    $("#s-import-box").hidden = false;
    $("#s-import-text").focus();
  });
  $("#s-import-cancel").addEventListener("click", () => { $("#s-import-box").hidden = true; });
  $("#s-import-apply").addEventListener("click", () => {
    let incoming;
    try { incoming = JSON.parse($("#s-import-text").value); } catch { toast("JSON 형식이 아닙니다", "danger"); return; }
    if (!Array.isArray(incoming)) { toast("배열 형태여야 합니다", "danger"); return; }
    let added = 0;
    for (const entry of incoming) {
      const url = normalizeUrl(entry?.url);
      if (!url || items.some((i) => i.url === url)) continue;
      items.push({
        id: uuid(), url,
        label: String(entry.label || hostOf(url)),
        note: String(entry.note || ""),
        color: COLORS.includes(entry.color) ? entry.color : pickColor(url),
        pinned: entry.pinned === true,
        lastUsed: 0, createdAt: Date.now(),
      });
      added++;
    }
    saveItems();
    closeOverlays();
    render();
    probeAll();
    toast(added ? `${added}개를 추가했습니다` : "새로 추가된 항목이 없습니다", added ? "success" : "info");
  });

  // PWA install prompt (Chrome/Android)
  let installEvent = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvent = e;
    $("#s-install-section").hidden = false;
  });
  $("#s-install").addEventListener("click", async () => {
    if (!installEvent) return;
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    installEvent = null;
    $("#s-install-section").hidden = true;
    if (outcome === "accepted") toast("설치했습니다", "success");
  });
  window.addEventListener("appinstalled", () => { $("#s-install-section").hidden = true; });

  // ---------- top bar ----------
  $("#refresh").addEventListener("click", () => {
    if (!items.length) { toast("확인할 터미널이 없습니다"); return; }
    probeAll();
  });
  $("#add").addEventListener("click", () => openForm());

  // ---------- ?add= (share target / manual registration) ----------
  const handleIncoming = () => {
    const params = new URLSearchParams(location.search);
    if (![...params.keys()].length) return;
    const fromText = (params.get("text") || "").match(/https?:\/\/\S+/)?.[0];
    const url = normalizeUrl(params.get("add") || params.get("url") || fromText);
    const label = params.get("label") || params.get("title") || "";
    history.replaceState(null, "", location.pathname);
    if (!url) return;
    const existing = items.find((i) => i.url === url);
    if (existing) { toast(`${existing.label} 은(는) 이미 등록되어 있습니다`); return; }
    openForm(null, { url, label: /ttyd/i.test(label) ? "" : label });
  };

  // ---------- boot ----------
  $("#version").textContent = `v${VERSION}`;
  applyTheme();
  render();
  handleIncoming();
  probeAll();
  scheduleAuto();
  setInterval(() => { if (document.visibilityState === "visible" && !probing) paintSummary(); }, 15000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { render(); probeAll(); }
  });
})();
