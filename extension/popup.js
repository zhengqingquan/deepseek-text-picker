(() => {
  function t(key) {
    try {
      const msg = chrome.i18n.getMessage(key);
      if (msg) return msg;
    } catch (_) {
      /* ignore */
    }
    return key;
  }

  const uiLang = chrome.i18n.getUILanguage() || "";
  document.documentElement.lang = uiLang.toLowerCase().startsWith("zh")
    ? "zh-CN"
    : uiLang || "en";

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    if (key) el.setAttribute("title", t(key));
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria-label");
    if (key) el.setAttribute("aria-label", t(key));
  });

  const versionEl = document.getElementById("version");
  if (versionEl) {
    const { version, name } = chrome.runtime.getManifest();
    versionEl.textContent = `v${version}`;
    document.title = name;
  }

  document.querySelectorAll(".menu__item[data-url]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const url = btn.getAttribute("data-url");
      if (!url) return;
      chrome.tabs.create({ url });
      window.close();
    });
  });
})();
