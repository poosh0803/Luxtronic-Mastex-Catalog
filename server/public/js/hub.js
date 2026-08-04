/* ============================================================
   Vendor hub search: all vendor tiles are rendered server-side
   (see server/views/hub.ejs) from data/meta.json, so this just
   shows/hides them by name — no client-side re-render needed.
   ============================================================ */
(function () {
  const searchInput = document.getElementById("searchInput");
  const tiles = [...document.querySelectorAll(".vcard[data-name]")];
  const emptyState = document.getElementById("emptyState");

  function applyFilter(q) {
    const query = (q || "").trim().toLowerCase();
    let visible = 0;
    tiles.forEach((tile) => {
      const match = tile.dataset.name.includes(query);
      tile.hidden = !match;
      if (match) visible++;
    });
    if (emptyState) emptyState.style.display = visible === 0 ? "block" : "none";
  }

  searchInput.addEventListener("input", (e) => applyFilter(e.target.value));

  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) themeToggle.addEventListener("click", () => MastexTheme.toggle());
})();
