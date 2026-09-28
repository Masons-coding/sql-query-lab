// Accessible tabs: [role=tab] buttons with aria-controls, deep-linkable via #hash.
export function initTabs(onChange = () => {}) {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  if (!tabs.length) return;

  const activate = (tab, updateHash = true) => {
    tabs.forEach((t) => {
      const selected = t === tab;
      t.setAttribute("aria-selected", String(selected));
      t.tabIndex = selected ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !selected;
    });
    if (updateHash) history.replaceState(null, "", `#${tab.dataset.hash}`);
    onChange(tab.dataset.hash);
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => activate(tab));
    tab.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
      next.focus();
      activate(next);
    });
  });

  const fromHash = tabs.find((t) => `#${t.dataset.hash}` === location.hash);
  activate(fromHash || tabs[0], false);
}
