(() => {
  const SOURCE = "ds-text-picker";
  let reqSeq = 0;
  /** @type {Map<number, {resolve: Function, reject: Function, timer: number}>} */
  const pending = new Map();

  function postRequest(type, extra, timeoutMs) {
    const reqId = ++reqSeq;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pending.delete(reqId);
        reject(new Error("timeout"));
      }, timeoutMs || 3000);
      pending.set(reqId, { resolve, reject, timer });
      window.postMessage({ source: SOURCE, type, reqId, ...extra }, "*");
    });
  }

  function resolveRaw(messageId) {
    return postRequest("resolve", { messageId: String(messageId) }, 3000);
  }

  function exportSessionRaw(messageIds) {
    const extra =
      Array.isArray(messageIds) && messageIds.length
        ? { messageIds: messageIds.map(String) }
        : {};
    return postRequest("export_session", extra, 8000);
  }

  function beginExportSelectionRaw() {
    return postRequest("begin_export_selection", {}, 5000);
  }

  function getExportSelectionRaw() {
    return postRequest("get_export_selection", {}, 5000);
  }

  function endExportSelectionRaw() {
    return postRequest("end_export_selection", {}, 5000);
  }

  function exportHijackStatusRaw() {
    return postRequest("export_hijack_status", {}, 3000);
  }

  const RESULT_TYPES = new Set([
    "resolve_result",
    "export_session_result",
    "begin_export_selection_result",
    "get_export_selection_result",
    "end_export_selection_result",
    "export_hijack_status_result",
  ]);

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE) return;
    if (!RESULT_TYPES.has(data.type)) return;
    const entry = pending.get(data.reqId);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    pending.delete(data.reqId);
    entry.resolve(data);
  });

  /* ---------------- UI: 单条原文 ---------------- */

  let modalEl = null;
  let exportModalEl = null;
  let scanTimer = 0;

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      scanAndAttach();
    }, 80);
  }

  function ensureModal() {
    if (modalEl) return modalEl;
    const root = document.createElement("div");
    root.className = "dspicker-overlay";
    root.hidden = true;
    root.innerHTML = `
      <div class="dspicker-modal" role="dialog" aria-modal="true" aria-label="消息原文">
        <div class="dspicker-header">
          <div class="dspicker-tabs" role="tablist" hidden>
            <button type="button" class="dspicker-tab is-active" data-tab="main">原文</button>
            <button type="button" class="dspicker-tab" data-tab="think">思考</button>
          </div>
          <div class="dspicker-status" hidden></div>
          <div class="dspicker-actions">
            <button type="button" class="dspicker-btn" data-action="copy">复制</button>
            <button type="button" class="dspicker-btn dspicker-btn-ghost" data-action="close" aria-label="关闭">关闭</button>
          </div>
        </div>
        <pre class="dspicker-body" tabindex="0"></pre>
      </div>
    `;
    document.documentElement.appendChild(root);

    const state = {
      main: "",
      think: "",
      active: "main",
    };
    root.__dspState = state;

    let backdropPointerDown = false;
    root.addEventListener("pointerdown", (e) => {
      backdropPointerDown = e.target === root;
    });
    root.addEventListener("click", (e) => {
      if (e.target === root && backdropPointerDown) closeModal();
      backdropPointerDown = false;
    });

    root.querySelector('[data-action="close"]').addEventListener("click", closeModal);
    root.querySelector('[data-action="copy"]').addEventListener("click", async () => {
      const text = state.active === "think" ? state.think : state.main;
      const status = root.querySelector(".dspicker-status");
      try {
        await navigator.clipboard.writeText(text || "");
        status.hidden = false;
        status.textContent = "已复制";
        setTimeout(() => {
          status.hidden = true;
        }, 3000);
      } catch (_) {
        status.hidden = false;
        status.textContent = "复制失败，请手动全选复制";
      }
    });

    root.querySelectorAll(".dspicker-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const name = tab.getAttribute("data-tab");
        state.active = name;
        root.querySelectorAll(".dspicker-tab").forEach((t) => {
          t.classList.toggle("is-active", t === tab);
        });
        const body = root.querySelector(".dspicker-body");
        body.textContent = name === "think" ? state.think : state.main;
      });
    });

    modalEl = root;
    return root;
  }

  function closeModal() {
    if (!modalEl) return;
    modalEl.hidden = true;
  }

  async function openModalForMessageId(id) {
    const root = ensureModal();
    const state = root.__dspState;
    const body = root.querySelector(".dspicker-body");
    const tabs = root.querySelector(".dspicker-tabs");
    const thinkTab = root.querySelector('[data-tab="think"]');
    const mainTab = root.querySelector('[data-tab="main"]');
    const status = root.querySelector(".dspicker-status");
    status.hidden = true;
    status.textContent = "";

    state.active = "main";
    mainTab.classList.add("is-active");
    thinkTab.classList.remove("is-active");

    try {
      const result = await resolveRaw(id);
      if (!result || !result.ok) {
        state.main =
          "未从页面内存读到原文。请确认该条回答已显示完整，或刷新后重试。";
        state.think = "";
      } else {
        const role = String(result.role || "").toUpperCase();
        if (role === "USER") {
          state.main = "仅支持查看 DeepSeek 回答的原文。";
          state.think = "";
        } else {
          state.main = result.response || "(空)";
          state.think = result.think || "";
        }
      }
    } catch (_) {
      state.main = "读取原文超时，请刷新页面后重试。";
      state.think = "";
    }

    const hasThink = Boolean(state.think);
    tabs.hidden = !hasThink;
    body.textContent = state.active === "think" ? state.think : state.main;
    root.hidden = false;
  }

  /* ---------------- UI: 导出会话（复用官方分享选对话） ---------------- */

  const EXPORT_CONFIRM_LABEL = "导出所选";
  const SHARE_CONFIRM_RE =
    /创建公开链接|导出所选|Create public link|Create link|Create and copy|创建并复制|确认并复制|Copy link|Confirm and copy/i;
  const SHARE_CANCEL_RE = /^(取消|Cancel)$/i;

  /** @type {{ hijack: boolean, patching: boolean, seenSelecting: boolean, observer: MutationObserver|null, pollTimer: number, docClickBound: boolean }} */
  const exportFlow = {
    hijack: false,
    patching: false,
    seenSelecting: false,
    observer: null,
    pollTimer: 0,
    docClickBound: false,
  };

  function buildExportMarkdown(payload, includeThink) {
    const title =
      payload && payload.title && String(payload.title).trim()
        ? String(payload.title).trim()
        : "DeepSeek 对话";
    const lines = [`# ${title}`, ""];
    const messages = (payload && payload.messages) || [];
    for (const msg of messages) {
      const role = String(msg.role || "").toUpperCase();
      if (role === "USER") {
        lines.push("## 用户", "", msg.content || "", "");
      } else {
        lines.push("## DeepSeek", "", msg.content || "", "");
        if (includeThink && msg.think && String(msg.think).trim()) {
          lines.push("### 思考", "", String(msg.think).trim(), "");
        }
      }
    }
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  function exportFileName(sessionId) {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const date = `${y}${m}${day}`;
    if (sessionId) {
      const short = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 8);
      if (short) return `deepseek-${short}-${date}.md`;
    }
    return `deepseek-${date}-${d.getTime()}.md`;
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.documentElement.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function buttonLabelText(el) {
    if (!el) return "";
    const textEl = el.querySelector(".ds-button__text");
    return ((textEl && textEl.textContent) || el.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isShareConfirmButton(el) {
    if (!el || el.closest(".dspicker-overlay")) return false;
    if (el.closest(".dspicker-export-confirm-layer")) return true;
    const btn = el.closest(".ds-button, [role='button']");
    if (!btn || btn.closest(".dspicker-overlay")) return false;
    const text = buttonLabelText(btn);
    if (!text || SHARE_CANCEL_RE.test(text)) return false;
    return SHARE_CONFIRM_RE.test(text);
  }

  function findNativeCreateLinkButtons() {
    const out = [];
    const seen = new Set();
    const push = (el) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      out.push(el);
    };

    document.querySelectorAll(".ds-button--primary, .ds-button, [role='button']").forEach((el) => {
      if (el.closest(".dspicker-overlay, .dspicker-export-confirm-layer")) return;
      if (el.classList.contains("dspicker-export-confirm-cover")) return;

      const rect = el.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 20) return;

      const text = buttonLabelText(el);
      if (SHARE_CANCEL_RE.test(text)) return;
      if (SHARE_CONFIRM_RE.test(text)) {
        push(el);
        return;
      }

      // 文案异常时：底部 primary 且祖先含「全选」
      if (
        el.classList.contains("ds-button--primary") &&
        rect.bottom > window.innerHeight - 100
      ) {
        let p = el.parentElement;
        for (let i = 0; i < 6 && p; i++) {
          const pt = (p.textContent || "").replace(/\s+/g, " ");
          if (/全选|Select all/.test(pt) && /取消|Cancel|公开|link|Link/i.test(pt)) {
            push(el);
            return;
          }
          p = p.parentElement;
        }
      }
    });
    return out;
  }

  function cleanupExportHijackUi() {
    exportFlow.hijack = false;
    exportFlow.seenSelecting = false;
    document.documentElement.classList.remove("dspicker-export-hijack");
    const layer = document.querySelector(".dspicker-export-confirm-layer");
    if (layer) layer.remove();
    document.querySelectorAll("[data-dspicker-native-hidden='1']").forEach((el) => {
      el.style.cssText = el.dataset.dspickerPrevStyle || "";
      delete el.dataset.dspickerNativeHidden;
      delete el.dataset.dspickerPrevStyle;
    });
  }

  async function stopExportHijack() {
    stopExportHijackWatchers();
    try {
      await endExportSelectionRaw();
    } catch (_) {
      /* ignore */
    }
    cleanupExportHijackUi();
    scheduleScan();
  }

  function stopExportHijackWatchers() {
    if (exportFlow.observer) {
      exportFlow.observer.disconnect();
      exportFlow.observer = null;
    }
    if (exportFlow.pollTimer) {
      window.clearInterval(exportFlow.pollTimer);
      exportFlow.pollTimer = 0;
    }
  }

  async function confirmNativeExportSelection(e) {
    if (!exportFlow.hijack || exportFlow.patching) return;
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
    exportFlow.patching = true;
    try {
      const sel = await getExportSelectionRaw();
      if (!sel || !sel.ok) {
        await stopExportHijack();
        openExportModalError("未能读取已选对话，请重试。");
        return;
      }
      const ids = Array.isArray(sel.messageIds) ? sel.messageIds : [];
      if (!ids.length) {
        exportFlow.patching = false;
        return;
      }
      const result = await exportSessionRaw(ids);
      await stopExportHijack();
      if (!result || !result.ok || !Array.isArray(result.messages) || !result.messages.length) {
        openExportModalError(
          result && result.error === "empty"
            ? "当前没有可导出的已选消息。"
            : "导出会话失败，请刷新后重试。"
        );
        return;
      }
      openExportModal(result);
    } catch (_) {
      await stopExportHijack();
      openExportModalError("导出会话超时，请刷新页面后重试。");
    } finally {
      exportFlow.patching = false;
    }
  }

  function onExportHijackDocClick(e) {
    if (!exportFlow.hijack || exportFlow.patching) return;
    if (!isShareConfirmButton(e.target)) return;
    confirmNativeExportSelection(e);
  }

  function ensureConfirmLayer() {
    let layer = document.querySelector(".dspicker-export-confirm-layer");
    if (layer) return layer;
    layer = document.createElement("div");
    layer.className = "dspicker-export-confirm-layer";
    layer.hidden = true;
    layer.innerHTML =
      `<div class="dspicker-export-confirm-cover ds-button ds-button--primary ds-button--xl" role="button" tabindex="0">` +
      `<div class="ds-button__background"></div>` +
      `<span class="ds-button__text">${EXPORT_CONFIRM_LABEL}</span>` +
      `</div>`;
    const cover = layer.querySelector(".dspicker-export-confirm-cover");
    cover.addEventListener("click", (ev) => confirmNativeExportSelection(ev));
    cover.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        confirmNativeExportSelection(ev);
      }
    });
    document.documentElement.appendChild(layer);
    return layer;
  }

  function hideNativeCreateButtons(buttons) {
    buttons.forEach((btn) => {
      if (btn.dataset.dspickerNativeHidden === "1") return;
      btn.dataset.dspickerNativeHidden = "1";
      btn.dataset.dspickerPrevStyle = btn.getAttribute("style") || "";
      btn.style.setProperty("visibility", "hidden", "important");
      btn.style.setProperty("pointer-events", "none", "important");
    });
  }

  /** 隐藏官方确认按钮，用 fixed 层盖上「导出所选」 */
  function patchNativeShareBar() {
    if (!exportFlow.hijack) return;

    let natives = findNativeCreateLinkButtons();
    if (!natives.length) {
      document.querySelectorAll(".ds-button--primary").forEach((el) => {
        if (el.closest(".dspicker-export-confirm-layer, .dspicker-overlay")) return;
        const r = el.getBoundingClientRect();
        if (r.width >= 48 && r.height >= 28 && r.bottom > window.innerHeight - 110) {
          natives.push(el);
        }
      });
    }

    const layer = ensureConfirmLayer();
    if (!natives.length) {
      layer.hidden = true;
      return;
    }

    hideNativeCreateButtons(natives);

    const target =
      natives.find((el) => {
        const r = el.getBoundingClientRect();
        return r.bottom > window.innerHeight - 120 && r.width > 0;
      }) || natives[0];
    const rect = target.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) {
      layer.hidden = true;
      return;
    }

    layer.hidden = false;
    const cover = layer.querySelector(".dspicker-export-confirm-cover");
    cover.style.left = Math.round(rect.left) + "px";
    cover.style.top = Math.round(rect.top) + "px";
    cover.style.width = Math.round(rect.width) + "px";
    cover.style.height = Math.round(rect.height) + "px";
  }

  function ensureDocClickHijack() {
    if (exportFlow.docClickBound) return;
    document.addEventListener("click", onExportHijackDocClick, true);
    exportFlow.docClickBound = true;
  }

  function startExportHijackWatchers() {
    stopExportHijackWatchers();
    exportFlow.seenSelecting = false;
    ensureDocClickHijack();
    patchNativeShareBar();
    exportFlow.observer = new MutationObserver(() => {
      if (exportFlow.hijack) patchNativeShareBar();
    });
    exportFlow.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    exportFlow.pollTimer = window.setInterval(async () => {
      if (!exportFlow.hijack || exportFlow.patching) return;
      patchNativeShareBar();
      try {
        const st = await exportHijackStatusRaw();
        if (!st || !st.ok) return;
        if (st.selecting) {
          exportFlow.seenSelecting = true;
          return;
        }
        if (exportFlow.seenSelecting && !st.selecting) {
          void stopExportHijack();
        }
      } catch (_) {
        /* ignore */
      }
    }, 400);
  }

  async function startExportSelection() {
    if (exportFlow.hijack) return;
    if (exportModalEl && !exportModalEl.hidden) closeExportModal();

    try {
      const begun = await beginExportSelectionRaw();
      if (!begun || !begun.ok) {
        const err = begun && begun.error;
        openExportModalError(
          err === "no_session"
            ? "当前不在会话页。请打开具体聊天后再导出。"
            : err === "no_share_api"
              ? "未能接入页面分享选对话。请刷新后重试，或确认 DeepSeek 页面已加载完成。"
              : "无法进入选对话，请刷新后重试。"
        );
        return;
      }
      exportFlow.hijack = true;
      exportFlow.seenSelecting = false;
      document.documentElement.classList.add("dspicker-export-hijack");
      startExportHijackWatchers();
      [50, 200, 500].forEach((ms) => window.setTimeout(patchNativeShareBar, ms));
    } catch (_) {
      exportFlow.hijack = false;
      document.documentElement.classList.remove("dspicker-export-hijack");
      openExportModalError("进入选对话超时，请刷新页面后重试。");
    }
  }

  function ensureExportModal() {
    if (exportModalEl) return exportModalEl;
    const root = document.createElement("div");
    root.className = "dspicker-overlay";
    root.hidden = true;
    root.innerHTML = `
      <div class="dspicker-modal dspicker-modal--export" role="dialog" aria-modal="true" aria-label="导出会话">
        <div class="dspicker-header">
          <div class="dspicker-header-title">导出会话</div>
          <label class="dspicker-check">
            <input type="checkbox" data-action="include-think" />
            <span>包含深度思考</span>
          </label>
          <div class="dspicker-status" hidden></div>
          <div class="dspicker-actions">
            <button type="button" class="dspicker-btn" data-action="copy">复制</button>
            <button type="button" class="dspicker-btn" data-action="download">下载 .md</button>
            <button type="button" class="dspicker-btn dspicker-btn-ghost" data-action="close" aria-label="关闭">关闭</button>
          </div>
        </div>
        <pre class="dspicker-body" tabindex="0"></pre>
      </div>
    `;
    document.documentElement.appendChild(root);

    const state = {
      payload: null,
      markdown: "",
      includeThink: false,
    };
    root.__dspExportState = state;

    let backdropPointerDown = false;
    root.addEventListener("pointerdown", (e) => {
      backdropPointerDown = e.target === root;
    });
    root.addEventListener("click", (e) => {
      if (e.target === root && backdropPointerDown) closeExportModal();
      backdropPointerDown = false;
    });

    const thinkCb = root.querySelector('[data-action="include-think"]');
    thinkCb.addEventListener("change", () => {
      state.includeThink = Boolean(thinkCb.checked);
      if (state.payload && state.payload.ok) {
        state.markdown = buildExportMarkdown(state.payload, state.includeThink);
        root.querySelector(".dspicker-body").textContent = state.markdown;
      }
    });

    root.querySelector('[data-action="close"]').addEventListener("click", closeExportModal);

    const showStatus = (text, ok) => {
      const status = root.querySelector(".dspicker-status");
      status.hidden = false;
      status.textContent = text;
      status.classList.toggle("is-error", !ok);
      setTimeout(() => {
        status.hidden = true;
        status.classList.remove("is-error");
      }, 3000);
    };

    root.querySelector('[data-action="copy"]').addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(state.markdown || "");
        showStatus("已复制", true);
      } catch (_) {
        showStatus("复制失败，请手动全选复制", false);
      }
    });

    root.querySelector('[data-action="download"]').addEventListener("click", () => {
      if (!state.markdown) {
        showStatus("没有可下载的内容", false);
        return;
      }
      const sid = state.payload && state.payload.sessionId;
      downloadText(exportFileName(sid), state.markdown);
      showStatus("已开始下载", true);
    });

    exportModalEl = root;
    return root;
  }

  function closeExportModal() {
    if (!exportModalEl) return;
    exportModalEl.hidden = true;
  }

  function openExportModalError(message) {
    const root = ensureExportModal();
    const state = root.__dspExportState;
    const body = root.querySelector(".dspicker-body");
    const thinkCb = root.querySelector('[data-action="include-think"]');
    const status = root.querySelector(".dspicker-status");
    status.hidden = true;
    thinkCb.checked = false;
    state.includeThink = false;
    state.payload = null;
    state.markdown = message;
    body.textContent = state.markdown;
    root.hidden = false;
  }

  function openExportModal(payload) {
    const root = ensureExportModal();
    const state = root.__dspExportState;
    const body = root.querySelector(".dspicker-body");
    const thinkCb = root.querySelector('[data-action="include-think"]');
    const status = root.querySelector(".dspicker-status");
    status.hidden = true;
    status.textContent = "";
    status.classList.remove("is-error");

    state.includeThink = false;
    thinkCb.checked = false;
    state.payload = payload && payload.ok ? payload : null;
    if (!state.payload || !state.payload.messages || !state.payload.messages.length) {
      state.markdown = "没有可导出的消息。";
    } else {
      state.markdown = buildExportMarkdown(state.payload, state.includeThink);
    }
    body.textContent = state.markdown;
    root.hidden = false;
  }

  function isAssistantItem(item) {
    if (!item) return false;
    if (item.querySelector(".ds-assistant-message-main-content")) return true;
    if (item.querySelector(".ds-message .ds-markdown")) return true;
    return false;
  }

  function createRawIconSvg() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("fill", "none");
    svg.innerHTML =
      '<path fill="currentColor" d="M3.5 1.5A1.5 1.5 0 0 1 5 0h4.293L13 3.707V14.5A1.5 1.5 0 0 1 11.5 16h-6A1.5 1.5 0 0 1 4 14.5v-13Zm5 .5V4h2.5L8.5 2ZM5.25 7a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5h-5.5Zm0 3a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5h-5.5Z"/>';
    return svg;
  }

  function createExportIconSvg() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("fill", "none");
    svg.innerHTML =
      '<path fill="currentColor" d="M8 1.25a.75.75 0 0 1 .75.75v6.19l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 1.06-1.06l1.72 1.72V2A.75.75 0 0 1 8 1.25ZM2.75 10a.75.75 0 0 1 .75.75v1.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25v-1.5a.75.75 0 0 1 1.5 0v1.5A2.75 2.75 0 0 1 11.25 14h-6.5A2.75 2.75 0 0 1 2 12.25v-1.5a.75.75 0 0 1 .75-.75Z"/>';
    return svg;
  }

  function createIconToolbarButton(className, title, iconEl, onOpen) {
    const btn = document.createElement("div");
    btn.role = "button";
    btn.tabIndex = 0;
    btn.className =
      "ds-button ds-button--iconLabelTertiary ds-button--icon ds-button--capsule ds-button--xs ds-button--icon-relative-l " +
      className;
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.innerHTML =
      '<div class="ds-button__background"></div>' +
      '<div class="ds-button__icon ds-button__icon--last-child"><div class="ds-icon" style="font-size: inherit;"></div></div>';
    btn.querySelector(".ds-icon").appendChild(iconEl);

    const open = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onOpen();
    };
    btn.addEventListener("click", open);
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") open(e);
    });
    return btn;
  }

  function createTriggerButton(messageKey) {
    return createIconToolbarButton(
      "dspicker-trigger",
      "显示原文",
      createRawIconSvg(),
      () => openModalForMessageId(messageKey)
    );
  }

  function createExportTriggerButton() {
    return createIconToolbarButton(
      "dspicker-export-trigger",
      "导出会话",
      createExportIconSvg(),
      () => startExportSelection()
    );
  }

  function findAssistantToolbar(item) {
    const icons = item.querySelectorAll(
      ".ds-button.ds-button--icon:not(.dspicker-trigger):not(.dspicker-export-trigger)"
    );
    for (const el of icons) {
      const parent = el.parentElement;
      if (parent && parent.classList.contains("ds-flex")) return parent;
    }
    return null;
  }

  function detachButton(item) {
    item
      .querySelectorAll(
        ".dspicker-trigger, .dspicker-export-trigger, .dspicker-trigger-wrap"
      )
      .forEach((el) => {
        el.remove();
      });
  }

  function placePickerButtons(container, exportBtn, rawBtn) {
    container.appendChild(exportBtn);
    container.appendChild(rawBtn);
  }

  function attachButton(item) {
    if (!item) return;
    const key = item.getAttribute("data-virtual-list-item-key");
    if (key == null || key === "") return;
    if (!item.querySelector(".ds-message")) return;

    if (!isAssistantItem(item)) {
      detachButton(item);
      return;
    }

    const toolbar = findAssistantToolbar(item);
    let existingRaw = item.querySelector(".dspicker-trigger");
    let existingExport = item.querySelector(".dspicker-export-trigger");

    if (existingRaw && toolbar && !toolbar.contains(existingRaw)) {
      const wrap = existingRaw.closest(".dspicker-trigger-wrap");
      if (existingExport && !toolbar.contains(existingExport)) {
        placePickerButtons(toolbar, existingExport, existingRaw);
      } else if (existingExport) {
        toolbar.insertBefore(existingRaw, existingExport.nextSibling);
      } else {
        toolbar.appendChild(existingRaw);
      }
      if (wrap) wrap.remove();
      existingRaw = item.querySelector(".dspicker-trigger");
      existingExport = item.querySelector(".dspicker-export-trigger");
    }

    if (existingRaw && existingExport) {
      if (
        existingExport.nextSibling !== existingRaw &&
        existingExport.parentElement === existingRaw.parentElement
      ) {
        existingRaw.parentElement.insertBefore(existingExport, existingRaw);
      }
      return;
    }

    const rawBtn = existingRaw || createTriggerButton(key);
    const exportBtn = existingExport || createExportTriggerButton();

    if (toolbar) {
      placePickerButtons(toolbar, exportBtn, rawBtn);
      return;
    }

    let wrap = item.querySelector(".dspicker-trigger-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "dspicker-trigger-wrap";
      const message = item.querySelector(".ds-message");
      if (message) {
        message.insertAdjacentElement("afterend", wrap);
      } else {
        item.appendChild(wrap);
      }
    }
    placePickerButtons(wrap, exportBtn, rawBtn);
  }

  function scanAndAttach() {
    document
      .querySelectorAll("[data-virtual-list-item-key]")
      .forEach((el) => {
        attachButton(el);
      });
  }

  const observer = new MutationObserver((mutations) => {
    let need = false;
    for (const m of mutations) {
      if (m.type === "childList" && (m.addedNodes.length || m.removedNodes.length)) {
        need = true;
        break;
      }
      if (m.type === "attributes" && m.attributeName === "data-virtual-list-item-key") {
        need = true;
        break;
      }
    }
    if (need) scheduleScan();
  });

  function start() {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-virtual-list-item-key"],
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (exportFlow.hijack) {
        stopExportHijack();
        return;
      }
      if (exportModalEl && !exportModalEl.hidden) {
        closeExportModal();
        return;
      }
      if (modalEl && !modalEl.hidden) closeModal();
    });
    scanAndAttach();
    window.addEventListener("popstate", scheduleScan);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
