(() => {
  const SOURCE = "ds-text-picker";
  let reqSeq = 0;
  /** @type {Map<number, {resolve: Function, reject: Function, timer: number}>} */
  const pending = new Map();

  function resolveRaw(messageId) {
    const reqId = ++reqSeq;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pending.delete(reqId);
        reject(new Error("timeout"));
      }, 3000);
      pending.set(reqId, { resolve, reject, timer });
      window.postMessage(
        { source: SOURCE, type: "resolve", messageId: String(messageId), reqId },
        "*"
      );
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE) return;
    if (data.type !== "resolve_result") return;
    const entry = pending.get(data.reqId);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    pending.delete(data.reqId);
    entry.resolve(data);
  });

  /* ---------------- UI ---------------- */

  let modalEl = null;
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

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !root.hidden) closeModal();
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

  function createTriggerButton(messageKey) {
    const btn = document.createElement("div");
    btn.role = "button";
    btn.tabIndex = 0;
    btn.className =
      "ds-button ds-button--iconLabelTertiary ds-button--icon ds-button--capsule ds-button--xs ds-button--icon-relative-l dspicker-trigger";
    btn.title = "显示原文";
    btn.setAttribute("aria-label", "显示原文");
    btn.innerHTML =
      '<div class="ds-button__background"></div>' +
      '<div class="ds-button__icon ds-button__icon--last-child"><div class="ds-icon" style="font-size: inherit;"></div></div>';
    btn.querySelector(".ds-icon").appendChild(createRawIconSvg());

    const open = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModalForMessageId(messageKey);
    };
    btn.addEventListener("click", open);
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") open(e);
    });
    return btn;
  }

  function findAssistantToolbar(item) {
    const icons = item.querySelectorAll(
      ".ds-button.ds-button--icon:not(.dspicker-trigger)"
    );
    for (const el of icons) {
      const parent = el.parentElement;
      if (parent && parent.classList.contains("ds-flex")) return parent;
    }
    return null;
  }

  function detachButton(item) {
    item.querySelectorAll(".dspicker-trigger, .dspicker-trigger-wrap").forEach((el) => {
      el.remove();
    });
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
    const existing = item.querySelector(".dspicker-trigger");

    if (existing && toolbar && !toolbar.contains(existing)) {
      const wrap = existing.closest(".dspicker-trigger-wrap");
      toolbar.appendChild(existing);
      if (wrap) wrap.remove();
      return;
    }
    if (existing) return;

    const btn = createTriggerButton(key);
    if (toolbar) {
      toolbar.appendChild(btn);
      return;
    }

    const message = item.querySelector(".ds-message");
    const wrap = document.createElement("div");
    wrap.className = "dspicker-trigger-wrap";
    wrap.appendChild(btn);
    if (message) {
      message.insertAdjacentElement("afterend", wrap);
    } else {
      item.appendChild(wrap);
    }
  }

  function scanAndAttach() {
    document
      .querySelectorAll("[data-virtual-list-item-key]")
      .forEach((el) => attachButton(el));
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
    scanAndAttach();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
