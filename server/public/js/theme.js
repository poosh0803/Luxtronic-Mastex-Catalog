/* ============================================================
   Shared light/dark theme, used across every page, per
   LUXTRONIC-DESIGN-GUIDELINES §4: class-based (.dark-mode on <html>
   early to avoid a flash, mirrored onto <body> once it exists),
   persisted in localStorage "theme" ("dark" / "light"). Defaults
   to light regardless of OS preference. Also highlights the
   active nav item from the current path.
   ============================================================ */
(function (window) {
  const THEME_KEY = "theme";
  const LEGACY_KEY = "mastexTheme_v1";

  function read() {
    try {
      return localStorage.getItem(THEME_KEY) || localStorage.getItem(LEGACY_KEY);
    } catch (e) { return null; }
  }

  function apply(theme) {
    const dark = theme === "dark";
    document.documentElement.classList.toggle("dark-mode", dark);
    if (document.body) document.body.classList.toggle("dark-mode", dark);
    const icon = document.getElementById("themeIcon");
    if (icon) icon.className = dark ? "fas fa-sun" : "fas fa-moon";
  }

  function highlightNav() {
    const path = window.location.pathname;
    document.querySelectorAll(".nav-bar .nav-item").forEach((a) => {
      const href = a.getAttribute("href");
      const on = href === "/" ? path === "/" || path.startsWith("/vendor") : path === href || path.startsWith(href + "/");
      a.classList.toggle("active", on);
    });
  }

  let current = read() === "dark" ? "dark" : "light";
  apply(current);
  document.addEventListener("DOMContentLoaded", () => { apply(current); highlightNav(); });

  window.MastexTheme = {
    toggle() {
      current = current === "dark" ? "light" : "dark";
      apply(current);
      try { localStorage.setItem(THEME_KEY, current); } catch (e) {}
      return current;
    },
  };
})(window);
