(() => {
  let tooltipId = 0;

  window.initInfoTooltips = (root = document) => {
    root.querySelectorAll?.(".info-icon").forEach((button) => {
      const description = button.dataset.tooltip || button.title;
      if (!description) return;
      button.dataset.tooltip = description;
      button.removeAttribute("title");
      if (button.hasAttribute("aria-describedby")) return;
      const text = document.createElement("span");
      text.id = `info-tooltip-${++tooltipId}`;
      text.className = "info-tooltip-description";
      text.textContent = description;
      text.setAttribute("role", "tooltip");
      button.after(text);
      button.setAttribute("aria-describedby", text.id);
    });
  };

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      document.activeElement?.matches(".info-icon")
    ) {
      document.activeElement.blur();
    }
  });
})();
