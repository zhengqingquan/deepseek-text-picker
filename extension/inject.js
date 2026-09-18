(() => {
  const SOURCE = "ds-text-picker";
  const CHUNK_KEY = "rspackChunk_deepseek_chat";
  let cachedStore = null;
  let cachedStoreApi = null;

  function emit(payload) {
    try {
      window.postMessage({ source: SOURCE, ...payload }, "*");
    } catch (_) {
      /* ignore */
    }
  }

  function getSessionId() {
    const m = location.pathname.match(/\/(?:a\/)?chat\/s\/([^/?#]+)/);
    if (m) return m[1];
    const m2 = location.pathname.match(/\/chat\/([^/?#]+)/);
    return m2 ? m2[1] : null;
  }

  function fiberFromNode(node) {
    if (!node) return null;
    for (const key of Object.keys(node)) {
      if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) {
        return node[key];
      }
      if (key.startsWith("__reactContainer$")) {
        const c = node[key];
        return (c && c.current) || c;
      }
    }
    return null;
  }

  /** 聊天 zustand state：含 getMessage + sessionStore */
  function looksLikeStore(obj) {
    return (
      obj &&
      typeof obj === "object" &&
      typeof obj.getMessage === "function" &&
      obj.sessionStore &&
      typeof obj.sessionStore === "object"
    );
  }

  function unwrapStore(candidate) {
    // zustand store API 本身是 function（可 hook 调用），同时挂 getState
    if (
      !candidate ||
      (typeof candidate !== "object" && typeof candidate !== "function")
    ) {
      return null;
    }
    if (looksLikeStore(candidate)) return candidate;
    if (typeof candidate.getState === "function") {
      try {
        const state = candidate.getState();
        if (looksLikeStore(state)) return state;
      } catch (_) {
        /* ignore */
      }
    }
    return null;
  }

  function pickStoreFromExports(exp) {
    if (!exp || (typeof exp !== "object" && typeof exp !== "function")) return null;
    const candidates = [exp.L, exp.default, exp];
    try {
      for (const v of Object.values(exp)) candidates.push(v);
    } catch (_) {
      /* ignore */
    }
    for (const c of candidates) {
      const s = unwrapStore(c);
      if (s) return { state: s, api: c && typeof c.getState === "function" ? c : null };
    }
    return null;
  }

  /** 通过 rspack 运行时拿到已加载模块里的聊天 store（D.L） */
  function findStoreViaRspack() {
    const chunks = self[CHUNK_KEY];
    if (!Array.isArray(chunks)) return null;

    let requireFn = null;
    const chunkId = "ds-tp-" + Math.random().toString(36).slice(2, 10);
    try {
      chunks.push([[chunkId], {}, (req) => {
        requireFn = req;
      }]);
    } catch (_) {
      return null;
    }
    if (!requireFn || !requireFn.m) return null;

    for (const id of Object.keys(requireFn.m)) {
      const factory = requireFn.m[id];
      if (typeof factory !== "function") continue;

      let executed = false;
      requireFn.m[id] = function patched(module, exports, req) {
        executed = true;
        return factory.apply(this, arguments);
      };

      try {
        const exp = requireFn(id);
        // 仅使用已缓存模块，避免强行执行未加载的 lazy chunk
        if (executed) continue;
        const hit = pickStoreFromExports(exp);
        if (hit) return hit;
      } catch (_) {
        /* ignore */
      } finally {
        requireFn.m[id] = factory;
      }
    }
    return null;
  }

  function findStoreInHooks(fiber) {
    let hook = fiber && fiber.memoizedState;
    let guard = 0;
    while (hook && guard++ < 60) {
      const fromMemo = unwrapStore(hook.memoizedState);
      if (fromMemo) return fromMemo;
      if (hook.queue) {
        const fromQueue = unwrapStore(hook.queue);
        if (fromQueue) return fromQueue;
        if (typeof hook.queue.getState === "function") {
          try {
            const st = hook.queue.getState();
            if (looksLikeStore(st)) return st;
          } catch (_) {
            /* ignore */
          }
        }
      }
      hook = hook.next;
    }
    return null;
  }

  function findStoreViaFiber() {
    const roots = [
      document.getElementById("root"),
      document.body,
      document.documentElement,
    ].filter(Boolean);

    for (const root of roots) {
      const start = fiberFromNode(root);
      if (!start) continue;
      const seen = new Set();
      const queue = [start];
      while (queue.length && seen.size < 8000) {
        const fiber = queue.shift();
        if (!fiber || seen.has(fiber)) continue;
        seen.add(fiber);

        const fromHooks = findStoreInHooks(fiber);
        if (fromHooks) return { state: fromHooks, api: null };

        const props = fiber.memoizedProps;
        if (props) {
          for (const v of Object.values(props)) {
            const s = unwrapStore(v);
            if (s) return { state: s, api: null };
          }
        }

        if (fiber.child) queue.push(fiber.child);
        if (fiber.sibling) queue.push(fiber.sibling);
      }
    }
    return null;
  }

  function findChatStore() {
    if (cachedStore && looksLikeStore(cachedStore)) return cachedStore;

    let hit = null;
    try {
      hit = findStoreViaRspack();
    } catch (_) {
      hit = null;
    }
    if (!hit) {
      try {
        hit = findStoreViaFiber();
      } catch (_) {
        hit = null;
      }
    }
    if (hit && hit.state) {
      cachedStore = hit.state;
      cachedStoreApi = hit.api || null;
      return cachedStore;
    }
    return null;
  }

  function refreshStoreState() {
    if (cachedStoreApi && typeof cachedStoreApi.getState === "function") {
      try {
        const st = cachedStoreApi.getState();
        if (looksLikeStore(st)) {
          cachedStore = st;
          return st;
        }
      } catch (_) {
        /* ignore */
      }
    }
    return findChatStore();
  }

  function normalizeMessage(raw, fallbackId) {
    if (!raw || typeof raw !== "object") return null;
    const fragments = raw.fragments;
    if (!Array.isArray(fragments)) return null;
    const id =
      raw.message_id != null
        ? String(raw.message_id)
        : raw.id != null
          ? String(raw.id)
          : raw.renderKey != null
            ? String(raw.renderKey)
            : fallbackId != null
              ? String(fallbackId)
              : "";
    return {
      message_id: id,
      role: raw.role,
      conversationMode: raw.conversationMode || raw.conversation_mode || "DEFAULT",
      fragments,
    };
  }

  function getResponseContent(message) {
    if (!message || !Array.isArray(message.fragments)) return "";
    const preferred = ["RESPONSE", "TEMPLATE_RESPONSE"];
    for (const type of preferred) {
      const hit = message.fragments.find(
        (f) => f && f.type === type && f.content != null && String(f.content).length
      );
      if (hit) return String(hit.content);
    }
    const any = message.fragments.find(
      (f) =>
        f &&
        f.content &&
        String(f.content).trim() &&
        f.type &&
        /RESPONSE/i.test(String(f.type))
    );
    return any ? String(any.content) : "";
  }

  function getThinkContent(message) {
    if (!message || !Array.isArray(message.fragments)) return "";
    return message.fragments
      .filter((f) => f && f.type === "THINK" && f.content != null)
      .map((f) => String(f.content))
      .join("\n\n");
  }

  function getRequestContent(message) {
    if (!message || !Array.isArray(message.fragments)) return "";
    const hit = message.fragments.find(
      (f) => f && f.type === "REQUEST" && f.content != null && String(f.content).length
    );
    if (hit) return String(hit.content);
    const any = message.fragments.find(
      (f) =>
        f &&
        f.content &&
        String(f.content).trim() &&
        f.type &&
        /REQUEST/i.test(String(f.type))
    );
    return any ? String(any.content) : "";
  }

  /** 对齐官方 getCopyContent / sm() */
  function toCopyContent(message) {
    let text = getResponseContent(message).trim();
    const mode = message.conversationMode || "DEFAULT";
    if (mode !== "DEFAULT") {
      text = text.replace(/\[(citation|reference):\d+\]/g, "");
    }
    return text;
  }

  /** 临时消息 id：官方用 <= -2 */
  function isTempMessageId(id) {
    const n = Number(id);
    return !Number.isNaN(n) && n <= -2;
  }

  function splitLeadingTempIds(childIds) {
    if (!Array.isArray(childIds) || !childIds.length) return [[], []];
    const idx = childIds.findIndex((id) => !isTempMessageId(id));
    if (idx < 0) return [childIds.slice(), []];
    return [childIds.slice(0, idx), childIds.slice(idx)];
  }

  function readRawMessage(store, sid, mid) {
    return readMessageFromSession(store, sid, mid);
  }

  /**
   * 对齐官方 getMessagePathItems：沿 rootBranchIds[rootBranchIndex]
   * + childIds[currentChildIndex] 走当前主分支。
   */
  function getMessagePathIds(store, sessionId) {
    const session =
      (store.sessionStore &&
        (store.sessionStore[sessionId] || store.sessionStore[String(sessionId)])) ||
      (typeof store.getSession === "function" ? store.getSession(sessionId) : null);
    if (!session) return [];

    const path = [];
    const push = (id) => {
      if (id == null) return;
      path.push(id);
    };

    const roots = Array.isArray(session.rootBranchIds) ? session.rootBranchIds : [];
    const rootIdx =
      typeof session.rootBranchIndex === "number" ? session.rootBranchIndex : 0;
    let cur = roots[rootIdx];
    if (cur != null) push(cur);

    while (cur != null) {
      const msg = readRawMessage(store, sessionId, cur);
      if (!msg) break;
      const childIds = Array.isArray(msg.childIds) ? msg.childIds : [];
      const [temps] = splitLeadingTempIds(childIds);
      temps.forEach(push);
      const next =
        typeof msg.currentChildIndex === "number"
          ? childIds[msg.currentChildIndex]
          : undefined;
      if (next == null) break;
      if (!temps.includes(next)) push(next);
      cur = next;
    }
    return path;
  }

  function orderIdsFromDom() {
    const ids = [];
    document.querySelectorAll("[data-virtual-list-item-key]").forEach((el) => {
      const k = el.getAttribute("data-virtual-list-item-key");
      if (k != null && k !== "") ids.push(k);
    });
    return ids;
  }

  function messageTimestamp(raw) {
    if (!raw || typeof raw !== "object") return 0;
    const candidates = [
      raw.insertedAt,
      raw.inserted_at,
      raw.createdAt,
      raw.created_at,
      raw.updatedAt,
      raw.updated_at,
    ];
    for (const c of candidates) {
      const n = Number(c);
      if (!Number.isNaN(n) && n > 0) return n;
    }
    return 0;
  }

  function orderMessageIds(store, sessionId, messageStore) {
    let ids = getMessagePathIds(store, sessionId);
    if (ids.length) return ids.map(String);

    const domIds = orderIdsFromDom();
    if (domIds.length) return domIds.map(String);

    const keys = Object.keys(messageStore || {});
    keys.sort((a, b) => {
      const ta = messageTimestamp(messageStore[a]);
      const tb = messageTimestamp(messageStore[b]);
      if (ta !== tb) return ta - tb;
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    });
    return keys;
  }

  function exportMessageEntry(raw, fallbackId) {
    const msg = normalizeMessage(raw, fallbackId);
    if (!msg) return null;
    const role = String(msg.role || "").toUpperCase();
    if (role === "USER") {
      const content = getRequestContent(msg).trim();
      if (!content) return null;
      return { role: "USER", content, think: "" };
    }
    if (role === "ASSISTANT" || getResponseContent(msg)) {
      const content = toCopyContent(msg);
      const think = getThinkContent(msg);
      if (!content && !think) return null;
      return { role: "ASSISTANT", content: content || "", think: think || "" };
    }
    return null;
  }

  function exportSession() {
    const store = refreshStoreState();
    if (!store) {
      return { ok: false, error: "no_store" };
    }
    const sessionId = getSessionId();
    if (!sessionId) {
      return { ok: false, error: "no_session" };
    }

    const session =
      (store.sessionStore &&
        (store.sessionStore[sessionId] || store.sessionStore[String(sessionId)])) ||
      (typeof store.getSession === "function" ? store.getSession(sessionId) : null);
    if (!session || !session.messageStore) {
      return { ok: false, error: "session_not_found", sessionId };
    }

    const title =
      session.title != null && String(session.title).trim()
        ? String(session.title).trim()
        : "";
    const orderedIds = orderMessageIds(store, sessionId, session.messageStore);
    const messages = [];
    const seen = new Set();

    for (const mid of orderedIds) {
      const key = String(mid);
      if (seen.has(key)) continue;
      seen.add(key);
      const raw = readRawMessage(store, sessionId, mid);
      const entry = exportMessageEntry(raw, mid);
      if (entry) messages.push(entry);
    }

    if (!messages.length) {
      return { ok: false, error: "empty", sessionId, title };
    }

    return { ok: true, sessionId, title, messages };
  }

  function messageFromMessageBody(props, want) {
    if (!props || !props.messageBody) return null;
    const body = props.messageBody;
    if (typeof body.getCopyContent === "function") {
      try {
        const copy = body.getCopyContent();
        if (typeof copy === "string" && copy) {
          const think = Array.isArray(body.fragments)
            ? body.fragments
                .filter((f) => f && f.type === "THINK")
                .map((f) => f.content)
                .join("\n\n")
            : "";
          return {
            message_id: want,
            role: "ASSISTANT",
            conversationMode: "DEFAULT",
            fragments: [
              { type: "RESPONSE", content: copy },
              ...(think ? [{ type: "THINK", content: think }] : []),
            ],
            __copy: copy,
          };
        }
      } catch (_) {
        /* ignore */
      }
    }
    if (Array.isArray(body.fragments)) {
      return normalizeMessage(
        { id: want, role: "ASSISTANT", fragments: body.fragments },
        want
      );
    }
    return null;
  }

  function inspectFiberForMessage(fiber, want) {
    if (!fiber) return null;

    const candidates = [
      fiber.memoizedProps,
      fiber.memoizedProps && fiber.memoizedProps.message,
      fiber.memoizedProps && fiber.memoizedProps.value,
      fiber.memoizedState,
    ];

    for (const c of candidates) {
      const msg = normalizeMessage(c, want);
      if (!msg) continue;
      if (msg.message_id && msg.message_id !== want) continue;
      const role = String(msg.role || "").toUpperCase();
      if (role === "ASSISTANT" || getResponseContent(msg)) return msg;
    }

    const props = fiber.memoizedProps;
    const fromBody = messageFromMessageBody(props, want);
    if (fromBody) return fromBody;

    if (props) {
      for (const v of Object.values(props)) {
        if (!v || typeof v !== "object") continue;
        const nested = messageFromMessageBody(v, want);
        if (nested) return nested;
        const msg = normalizeMessage(v, want);
        if (msg && (!msg.message_id || msg.message_id === want)) {
          const role = String(msg.role || "").toUpperCase();
          if (role === "ASSISTANT" || getResponseContent(msg)) return msg;
        }
      }
    }
    return null;
  }

  function findMessageInItemFiber(itemEl, messageId) {
    const start = fiberFromNode(itemEl);
    if (!start) return null;
    const want = String(messageId);
    let fallback = null;

    // 1) 向上：toolbar / messageBody 多半在祖先组件
    let up = start;
    for (let i = 0; i < 100 && up; i++) {
      const hit = inspectFiberForMessage(up, want);
      if (hit) {
        if (hit.__copy || getResponseContent(hit)) return hit;
        if (!fallback) fallback = hit;
      }
      up = up.return;
    }

    // 2) 向下 BFS
    const seen = new Set();
    const queue = [start];
    while (queue.length && seen.size < 3000) {
      const fiber = queue.shift();
      if (!fiber || seen.has(fiber)) continue;
      seen.add(fiber);

      const hit = inspectFiberForMessage(fiber, want);
      if (hit) {
        if (hit.__copy || getResponseContent(hit)) return hit;
        if (!fallback) fallback = hit;
      }

      if (fiber.child) queue.push(fiber.child);
      if (fiber.sibling) queue.push(fiber.sibling);
    }
    return fallback;
  }

  function readMessageFromSession(store, sid, mid) {
    if (!store || sid == null) return null;
    const keys = [mid, String(mid)];
    const asNum = Number(mid);
    if (!Number.isNaN(asNum)) keys.push(asNum);

    for (const k of keys) {
      try {
        const raw = store.getMessage(sid, k);
        if (raw) return raw;
      } catch (_) {
        /* ignore */
      }
    }

    const session =
      (store.sessionStore && (store.sessionStore[sid] || store.sessionStore[String(sid)])) ||
      (typeof store.getSession === "function" ? store.getSession(sid) : null);
    const ms = session && session.messageStore;
    if (!ms) return null;
    for (const k of keys) {
      if (ms[k]) return ms[k];
    }
    return null;
  }

  function resolveFromStore(messageId) {
    const store = refreshStoreState();
    if (!store) return null;
    const sessionId = getSessionId();
    const mid = String(messageId);

    let raw = null;
    if (sessionId) raw = readMessageFromSession(store, sessionId, mid);

    if (!raw && store.sessionStore) {
      for (const sid of Object.keys(store.sessionStore)) {
        raw = readMessageFromSession(store, sid, mid);
        if (raw) break;
      }
    }

    return normalizeMessage(raw, mid);
  }

  function resolveMessage(messageId) {
    const mid = String(messageId);

    // 1) rspack / fiber → zustand D.L.getMessage（与官方复制同源）
    let message = resolveFromStore(mid);

    // 2) 从该条消息 DOM 的 React fiber 读取（含祖先上的 messageBody.getCopyContent）
    if (!message || !getResponseContent(message)) {
      let item = null;
      document.querySelectorAll("[data-virtual-list-item-key]").forEach((el) => {
        if (!item && el.getAttribute("data-virtual-list-item-key") === mid) {
          item = el;
        }
      });
      if (item) {
        const fromFiber = findMessageInItemFiber(item, mid);
        if (fromFiber) message = fromFiber;
      }
    }

    if (!message) return null;

    const response =
      message.__copy != null ? String(message.__copy) : toCopyContent(message);
    const think = getThinkContent(message);
    return { response, think, role: message.role };
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE) return;

    if (data.type === "export_session") {
      const reqId = data.reqId;
      try {
        const result = exportSession();
        emit({ type: "export_session_result", reqId, ...result });
      } catch (err) {
        emit({
          type: "export_session_result",
          reqId,
          ok: false,
          error: String(err && err.message ? err.message : err),
        });
      }
      return;
    }

    if (data.type !== "resolve") return;

    const reqId = data.reqId;
    try {
      const result = resolveMessage(data.messageId);
      if (!result) {
        emit({
          type: "resolve_result",
          reqId,
          ok: false,
          error: "not_found",
        });
        return;
      }
      emit({
        type: "resolve_result",
        reqId,
        ok: true,
        response: result.response || "",
        think: result.think || "",
        role: result.role || "",
      });
    } catch (err) {
      emit({
        type: "resolve_result",
        reqId,
        ok: false,
        error: String(err && err.message ? err.message : err),
      });
    }
  });

  // 页面就绪后再预热一次 store，减少首次点击失败
  const warm = () => {
    try {
      findChatStore();
    } catch (_) {
      /* ignore */
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(warm, 500), {
      once: true,
    });
  } else {
    setTimeout(warm, 500);
  }
  setTimeout(warm, 2000);

  emit({ type: "hook_ready" });
})();
