(() => {
  const SOURCE = "ds-text-picker";
  let reqSeq = 0;
  /** @type {Map<number, {resolve: Function, reject: Function, timer: number}>} */
  const pending = new Map();

  /** Chrome i18n；缺 key 时回退到 key 本身，便于发现漏译 */
  function t(key, substitutions) {
    try {
      const msg = chrome.i18n.getMessage(key, substitutions);
      if (msg) return msg;
    } catch (_) {
      /* ignore */
    }
    return key;
  }

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

  function beginExportSelectionRaw(untilMessageId) {
    const extra =
      untilMessageId != null && String(untilMessageId) !== ""
        ? { untilMessageId: String(untilMessageId) }
        : {};
    return postRequest("begin_export_selection", extra, 5000);
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

  /** 思考放在回复前，用 details/summary 折叠，避免长思考挤占正文 */
  function formatThinkBlock(think) {
    const text = String(think || "")
      .trim()
      .replace(/<\/details>/gi, "<\\/details>");
    if (!text) return "";
    return `<details>\n<summary>${t("thinkSummary")}</summary>\n\n${text}\n\n</details>`;
  }

  function ensureModal() {
    if (modalEl) return modalEl;
    const root = document.createElement("div");
    root.className = "dspicker-overlay";
    root.hidden = true;
    root.innerHTML = `
      <div class="dspicker-modal" role="dialog" aria-modal="true" aria-label="${t("dialogOriginal")}">
        <div class="dspicker-header">
          <div class="dspicker-tabs" role="tablist" hidden>
            <button type="button" class="dspicker-tab is-active" data-tab="main">${t("tabOriginal")}</button>
            <button type="button" class="dspicker-tab" data-tab="think">${t("tabThink")}</button>
          </div>
          <label class="dspicker-check" data-role="include-think-wrap" hidden>
            <input type="checkbox" data-action="include-think" />
            <span>${t("includeThink")}</span>
          </label>
          <div class="dspicker-status" hidden></div>
          <div class="dspicker-actions">
            <button type="button" class="dspicker-btn" data-action="copy">${t("copy")}</button>
            <button type="button" class="dspicker-btn dspicker-btn-ghost" data-action="close" aria-label="${t("close")}">${t("close")}</button>
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
      includeThink: false,
    };
    root.__dspState = state;

    const renderBody = () => {
      const body = root.querySelector(".dspicker-body");
      if (state.active === "think") {
        body.textContent = state.think || "";
        return;
      }
      if (state.includeThink) {
        const thinkBlock = formatThinkBlock(state.think);
        body.textContent = thinkBlock
          ? `${thinkBlock}\n\n${state.main || ""}`.trim() + "\n"
          : state.main || "";
      } else {
        body.textContent = state.main || "";
      }
    };
    root.__dspRenderBody = renderBody;

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
      const body = root.querySelector(".dspicker-body");
      const text = body.textContent || "";
      const status = root.querySelector(".dspicker-status");
      try {
        await navigator.clipboard.writeText(text);
        status.hidden = false;
        status.textContent = t("copied");
        status.classList.remove("is-error");
        setTimeout(() => {
          status.hidden = true;
        }, 3000);
      } catch (_) {
        status.hidden = false;
        status.textContent = t("copyFailed");
        status.classList.add("is-error");
      }
    });

    root.querySelectorAll(".dspicker-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const name = tab.getAttribute("data-tab");
        state.active = name;
        root.querySelectorAll(".dspicker-tab").forEach((t) => {
          t.classList.toggle("is-active", t === tab);
        });
        renderBody();
      });
    });

    const thinkCb = root.querySelector('[data-action="include-think"]');
    thinkCb.addEventListener("change", () => {
      state.includeThink = Boolean(thinkCb.checked);
      renderBody();
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
    const tabs = root.querySelector(".dspicker-tabs");
    const thinkTab = root.querySelector('[data-tab="think"]');
    const mainTab = root.querySelector('[data-tab="main"]');
    const thinkWrap = root.querySelector('[data-role="include-think-wrap"]');
    const thinkCb = root.querySelector('[data-action="include-think"]');
    const status = root.querySelector(".dspicker-status");
    status.hidden = true;
    status.textContent = "";
    status.classList.remove("is-error");

    state.active = "main";
    state.includeThink = false;
    thinkCb.checked = false;
    mainTab.classList.add("is-active");
    thinkTab.classList.remove("is-active");
    // 打开时先藏，避免上一条有思考时勾选框闪一下
    tabs.hidden = true;
    thinkWrap.hidden = true;

    try {
      const result = await resolveRaw(id);
      if (!result || !result.ok) {
        state.main = t("resolveFailed");
        state.think = "";
      } else {
        const role = String(result.role || "").toUpperCase();
        if (role === "USER") {
          state.main = t("userOnlyUnsupported");
          state.think = "";
        } else {
          state.main = result.response || t("emptyContent");
          state.think = result.think || "";
        }
      }
    } catch (_) {
      state.main = t("resolveTimeout");
      state.think = "";
    }

    const hasThink = Boolean(state.think && String(state.think).trim());
    tabs.hidden = !hasThink;
    thinkWrap.hidden = !hasThink;
    root.__dspRenderBody();
    root.hidden = false;
  }

  /* ---------------- UI: 导出会话（复用官方分享选对话） ---------------- */

  const SHARE_CONFIRM_RE =
    /创建公开链接|Create public link|Create link|Create and copy|创建并复制|确认并复制|Copy link|Confirm and copy|创建导出内容|Create export/i;
  const SHARE_CANCEL_RE = /^(取消|Cancel)$/i;

  /** @type {{ hijack: boolean, patching: boolean, patchingBar: boolean, seenSelecting: boolean, observer: MutationObserver|null, pollTimer: number, docClickBound: boolean, untilMessageId: string|null }} */
  const exportFlow = {
    hijack: false,
    patching: false,
    patchingBar: false,
    seenSelecting: false,
    observer: null,
    pollTimer: 0,
    docClickBound: false,
    untilMessageId: null,
  };

  function formatExportTime(ms) {
    const n = Number(ms);
    if (!n || Number.isNaN(n) || n <= 0) return "";
    const d = new Date(n);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (x) => String(x).padStart(2, "0");
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    );
  }

  function exportHeading(roleLabel, msg) {
    const t = formatExportTime(msg && msg.time);
    return t ? `## ${roleLabel} · ${t}` : `## ${roleLabel}`;
  }

  function buildExportMarkdown(payload, includeThink) {
    const title =
      payload && payload.title && String(payload.title).trim()
        ? String(payload.title).trim()
        : t("defaultChatTitle");
    const lines = [`# ${title}`, ""];
    const messages = (payload && payload.messages) || [];
    for (const msg of messages) {
      const role = String(msg.role || "").toUpperCase();
      if (role === "USER") {
        lines.push(exportHeading(t("roleUser"), msg), "", msg.content || "", "");
      } else {
        lines.push(exportHeading("DeepSeek", msg), "");
        if (includeThink) {
          const thinkBlock = formatThinkBlock(msg.think);
          if (thinkBlock) lines.push(thinkBlock, "");
        }
        lines.push(msg.content || "", "");
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
    if (el.closest(".dspicker-export-confirm-cover")) return true;
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
        openExportModalError(t("exportReadFailed"));
        return;
      }
      const ids = Array.isArray(sel.messageIds) ? sel.messageIds : [];
      if (!ids.length) {
        exportFlow.patching = false;
        return;
      }
      const result = await exportSessionRaw(ids);
      if (!result || !result.ok || !Array.isArray(result.messages) || !result.messages.length) {
        await stopExportHijack();
        openExportModalError(
          result && result.error === "empty"
            ? t("exportNoSelection")
            : t("exportFailed")
        );
        return;
      }
      // 预览时保持选对话，便于「返回」继续勾选；「关闭」再退出
      openExportModal(result, { canReturn: true });
    } catch (_) {
      await stopExportHijack();
      openExportModalError(t("exportTimeout"));
    } finally {
      exportFlow.patching = false;
    }
  }

  function onExportHijackDocClick(e) {
    if (!exportFlow.hijack || exportFlow.patching) return;
    if (exportModalEl && !exportModalEl.hidden) return;
    if (!isShareConfirmButton(e.target)) return;
    confirmNativeExportSelection(e);
  }

  function ensureConfirmLayer() {
    let layer = document.querySelector(".dspicker-export-confirm-layer");
    if (layer) return layer;
    const label = t("createExportContent");
    layer = document.createElement("div");
    layer.className = "dspicker-export-confirm-layer";
    layer.hidden = true;
    layer.innerHTML =
      `<button type="button" class="dspicker-export-confirm-cover" aria-label="${label}">` +
      `${label}` +
      `</button>`;
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

  /** 从官方「创建公开链接」按钮抄计算样式到独立按钮 */
  function applyNativeButtonLook(cover, nativeBtn) {
    const btnCs = getComputedStyle(nativeBtn);
    const bgEl = nativeBtn.querySelector(".ds-button__background");
    const textEl = nativeBtn.querySelector(".ds-button__text");
    const bgCs = bgEl ? getComputedStyle(bgEl) : null;
    const textCs = textEl ? getComputedStyle(textEl) : null;

    const bg =
      (bgCs && bgCs.backgroundColor && bgCs.backgroundColor !== "rgba(0, 0, 0, 0)")
        ? bgCs.backgroundColor
        : btnCs.backgroundColor && btnCs.backgroundColor !== "rgba(0, 0, 0, 0)"
          ? btnCs.backgroundColor
          : "#4d6bfe";
    const color =
      (textCs && textCs.color) ||
      (btnCs.color && btnCs.color !== "rgba(0, 0, 0, 0)" ? btnCs.color : "#fff");
    const radius =
      (bgCs && bgCs.borderRadius) ||
      btnCs.borderRadius ||
      "9999px";
    const fontSize = (textCs && textCs.fontSize) || btnCs.fontSize || "14px";
    const fontWeight = (textCs && textCs.fontWeight) || btnCs.fontWeight || "500";
    const fontFamily =
      (textCs && textCs.fontFamily) || btnCs.fontFamily || "inherit";
    const letterSpacing =
      (textCs && textCs.letterSpacing) || btnCs.letterSpacing || "normal";

    cover.style.background = bg;
    cover.style.color = color;
    cover.style.borderRadius = radius;
    cover.style.fontSize = fontSize;
    cover.style.fontWeight = fontWeight;
    cover.style.fontFamily = fontFamily;
    cover.style.letterSpacing = letterSpacing;
  }

  /** 隐藏官方确认按钮，独立按钮对齐其位置与外观 */
  function patchNativeShareBar() {
    if (!exportFlow.hijack || exportFlow.patchingBar) return;
    exportFlow.patchingBar = true;
    try {
      // 预览弹层打开时仍保持底栏补丁（按钮在遮罩下方），返回后无需重建

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

      const cover = layer.querySelector(".dspicker-export-confirm-cover");
      const label = t("createExportContent");
      // 勿每次写 textContent：会触发 childList MutationObserver → 死循环卡死页面
      if (cover.textContent !== label) {
        cover.textContent = label;
        cover.setAttribute("aria-label", label);
      }
      applyNativeButtonLook(cover, target);
      hideNativeCreateButtons(natives);

      layer.hidden = false;
      cover.style.left = Math.round(rect.left) + "px";
      cover.style.top = Math.round(rect.top) + "px";
      cover.style.width = Math.round(rect.width) + "px";
      cover.style.height = Math.round(rect.height) + "px";
    } finally {
      exportFlow.patchingBar = false;
    }
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
        // 预览打开时不要因短暂 not selecting 结束劫持（否则「创建导出内容」会没掉）
        if (exportModalEl && !exportModalEl.hidden) return;
        if (exportFlow.seenSelecting && !st.selecting) {
          void stopExportHijack();
        }
      } catch (_) {
        /* ignore */
      }
    }, 400);
  }

  async function startExportSelection(untilMessageId) {
    if (exportFlow.hijack) return;
    if (exportModalEl && !exportModalEl.hidden) closeExportModal();

    const until =
      untilMessageId != null && String(untilMessageId) !== ""
        ? String(untilMessageId)
        : null;
    exportFlow.untilMessageId = until;

    try {
      const begun = await beginExportSelectionRaw(until);
      if (!begun || !begun.ok) {
        exportFlow.untilMessageId = null;
        const err = begun && begun.error;
        openExportModalError(
          err === "no_session"
            ? t("exportNoSession")
            : err === "no_share_api"
              ? t("exportNoShareApi")
              : t("exportEnterFailed")
        );
        return;
      }
      exportFlow.hijack = true;
      exportFlow.seenSelecting = false;
      startExportHijackWatchers();
      [50, 200, 500].forEach((ms) => window.setTimeout(patchNativeShareBar, ms));
    } catch (_) {
      exportFlow.hijack = false;
      exportFlow.untilMessageId = null;
      openExportModalError(t("exportEnterTimeout"));
    }
  }

  function ensureExportModal() {
    if (exportModalEl) return exportModalEl;
    const root = document.createElement("div");
    root.className = "dspicker-overlay";
    root.hidden = true;
    root.innerHTML = `
      <div class="dspicker-modal dspicker-modal--export" role="dialog" aria-modal="true" aria-label="${t("dialogExport")}">
        <div class="dspicker-header">
          <div class="dspicker-header-title">${t("exportSession")}</div>
          <label class="dspicker-check">
            <input type="checkbox" data-action="include-think" />
            <span>${t("includeThink")}</span>
          </label>
          <div class="dspicker-status" hidden></div>
          <div class="dspicker-actions">
            <button type="button" class="dspicker-btn" data-action="copy">${t("copy")}</button>
            <button type="button" class="dspicker-btn" data-action="download">${t("downloadMd")}</button>
            <button type="button" class="dspicker-btn dspicker-btn-ghost" data-action="back" hidden aria-label="${t("backToSelection")}">${t("back")}</button>
            <button type="button" class="dspicker-btn dspicker-btn-ghost" data-action="close" aria-label="${t("close")}">${t("close")}</button>
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
      // 点遮罩：有选对话时等同「返回」，否则关闭
      if (e.target === root && backdropPointerDown) {
        if (exportFlow.hijack) returnToExportSelection();
        else closeExportModal();
      }
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

    root.querySelector('[data-action="back"]').addEventListener("click", returnToExportSelection);
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
        showStatus(t("copied"), true);
      } catch (_) {
        showStatus(t("copyFailed"), false);
      }
    });

    root.querySelector('[data-action="download"]').addEventListener("click", () => {
      if (!state.markdown) {
        showStatus(t("downloadEmpty"), false);
        return;
      }
      const sid = state.payload && state.payload.sessionId;
      downloadText(exportFileName(sid), state.markdown);
      showStatus(t("downloadStarted"), true);
    });

    exportModalEl = root;
    return root;
  }

  function setExportBackVisible(root, visible) {
    const backBtn = root.querySelector('[data-action="back"]');
    if (!backBtn) return;
    backBtn.hidden = !visible;
  }

  function hideExportModalOnly() {
    if (!exportModalEl) return;
    exportModalEl.hidden = true;
    setExportBackVisible(exportModalEl, false);
  }

  /** 关闭预览并退出选对话（仅「关闭」按钮） */
  function closeExportModal() {
    hideExportModalOnly();
    if (exportFlow.hijack) void stopExportHijack();
    exportFlow.untilMessageId = null;
  }

  /** 关闭预览，回到官方选对话勾选态（返回 / Esc / 点遮罩） */
  function returnToExportSelection() {
    if (!exportModalEl) return;
    hideExportModalOnly();
    if (exportFlow.hijack) {
      patchNativeShareBar();
      [50, 200, 500].forEach((ms) => window.setTimeout(patchNativeShareBar, ms));
      return;
    }
    void startExportSelection(exportFlow.untilMessageId);
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
    setExportBackVisible(root, false);
    root.hidden = false;
  }

  function openExportModal(payload, options) {
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
      state.markdown = t("exportNoMessages");
    } else {
      state.markdown = buildExportMarkdown(state.payload, state.includeThink);
    }
    body.textContent = state.markdown;
    setExportBackVisible(
      root,
      Boolean(options && options.canReturn && exportFlow.hijack)
    );
    root.hidden = false;
  }

  function isAssistantItem(item) {
    if (!item) return false;
    if (item.querySelector(".ds-assistant-message-main-content")) return true;
    if (item.querySelector(".ds-message .ds-markdown")) return true;
    return false;
  }

  /** 临时/流式消息 id（官方常用 <= -2） */
  function isTempMessageKey(key) {
    const n = Number(key);
    return !Number.isNaN(n) && n <= -2;
  }

  /**
   * 生成中勿挂载：尚无官方操作栏，或只有「停止」等单个按钮。
   * 完成后通常会出现复制/重新生成等一组图标。
   */
  function shouldAttachPicker(item) {
    if (!isAssistantItem(item)) return false;
    const key = item.getAttribute("data-virtual-list-item-key");
    if (key == null || key === "" || isTempMessageKey(key)) return false;

    const toolbar = findAssistantToolbar(item);
    if (!toolbar) return false;

    const natives = toolbar.querySelectorAll(
      ".ds-button.ds-button--icon:not(.dspicker-trigger):not(.dspicker-export-trigger)"
    );
    return natives.length >= 2;
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
      t("showOriginal"),
      createRawIconSvg(),
      () => openModalForMessageId(messageKey)
    );
  }

  function createExportTriggerButton(messageKey) {
    return createIconToolbarButton(
      "dspicker-export-trigger",
      t("exportSession"),
      createExportIconSvg(),
      () => startExportSelection(messageKey)
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

    if (!shouldAttachPicker(item)) {
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
    const exportBtn = existingExport || createExportTriggerButton(key);

    // 仅挂到官方操作栏；生成中无栏时上面已 detach
    placePickerButtons(toolbar, exportBtn, rawBtn);
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
      // 预览打开时 Esc = 返回选对话；无选对话则关闭；否则退出选对话
      if (exportModalEl && !exportModalEl.hidden) {
        if (exportFlow.hijack) returnToExportSelection();
        else closeExportModal();
        return;
      }
      if (exportFlow.hijack) {
        void stopExportHijack();
        exportFlow.untilMessageId = null;
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
