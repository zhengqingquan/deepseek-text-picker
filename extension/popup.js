(() => {
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
