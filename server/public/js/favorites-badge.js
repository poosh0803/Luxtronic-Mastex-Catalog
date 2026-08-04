/* ============================================================
   Total favorites count badge, shown next to the "All Favourites"
   link on every page. Mirrors the cart badge pattern (cart.js),
   but favorites live server-side in data/favorites.json, so this
   fetches the count rather than reading localStorage.
   ============================================================ */
(function (window) {
  async function update() {
    const badge = document.getElementById("favoritesBadge");
    if (!badge) return;
    try {
      const res = await fetch("/api/favorites");
      if (!res.ok) return;
      const list = await res.json();
      const n = list.length;
      badge.textContent = n > 99 ? "99+" : n;
      badge.style.display = n > 0 ? "flex" : "none";
    } catch (err) {
      console.error("Failed to load favorites count", err);
    }
  }

  window.MastexFavoritesBadge = { update };
  document.addEventListener("DOMContentLoaded", update);
})(window);
