(() => {
  const root = document.documentElement;
  const storageKey = "theme";

  function isDark() {
    return (
      root.dataset.theme === "dark" ||
      (!root.dataset.theme &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    );
  }

  function updateButton(button) {
    if (!button) return;
    const dark = isDark();
    button.innerHTML = dark
      ? '<svg class="theme-toggle-icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"></path></svg>'
      : '<svg class="theme-toggle-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z"></path></svg>';
    button.title = dark ? "Use light mode" : "Use dark mode";
    button.setAttribute("aria-label", button.title);
  }

  async function init() {
    const { [storageKey]: storedTheme } = await chrome.storage.local.get({
      [storageKey]: "",
    });
    if (storedTheme === "light" || storedTheme === "dark") {
      root.dataset.theme = storedTheme;
    } else {
      root.dataset.theme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
    }
    const button = document.querySelector("#theme-toggle");
    updateButton(button);
    button?.addEventListener("click", async () => {
      const nextTheme = isDark() ? "light" : "dark";
      root.dataset.theme = nextTheme;
      await chrome.storage.local.set({ [storageKey]: nextTheme });
      updateButton(button);
    });
  }

  init().catch(() => {
    root.dataset.theme = window.matchMedia("(prefers-color-scheme: dark)")
      .matches
      ? "dark"
      : "light";
    updateButton(document.querySelector("#theme-toggle"));
  });
})();
