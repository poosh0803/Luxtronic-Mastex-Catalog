/* ============================================================
   Shared light/dark theme state, used across every page. Applied
   synchronously (this script is loaded blocking, before <body>
   renders) so there's no flash of the wrong theme. Defaults to
   light regardless of OS preference, and persists the user's
   choice in localStorage so it stays the same on every page.
   ============================================================ */
(function (window) {
  const THEME_KEY = "mastexTheme_v1";

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  const saved = localStorage.getItem(THEME_KEY);
  apply(saved === "dark" ? "dark" : "light");

  window.MastexTheme = {
    toggle() {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      apply(next);
      localStorage.setItem(THEME_KEY, next);
      return next;
    },
  };
})(window);
