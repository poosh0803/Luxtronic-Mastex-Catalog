/* ============================================================
   Generic vendor-page catalog UI: search, favorites, sort,
   grid/list view, product modal, and "Add to order" cart wiring.
   One file drives every vendor page — the server injects
   window.__VENDOR_SLUG__, window.__VENDOR_NAME__ and
   window.__PRODUCTS__ into the page before loading this script,
   so there's no per-vendor duplication and no extra fetch().
   Shared card-rendering helpers (stock/price/image/cart-item
   shaping) live in product-helpers.js, loaded before this file.
   ============================================================ */
(function () {
  const VENDOR_SLUG = window.__VENDOR_SLUG__;
  const VENDOR_NAME = window.__VENDOR_NAME__;
  const PRODUCTS = window.__PRODUCTS__ || [];
  const { stockInfo, mediaHtml, priceHtml, modalPriceHtml, cartItemMeta } = window.MastexProduct;

  let state = { q: "", inStockOnly: false, favOnly: false, sort: "relevance", view: "grid" };
  // Favorites are shared, persisted server-side in data/favorites.json (see
  // server/index.js) rather than kept only in memory, so they survive a
  // reload/navigation instead of resetting every time. `favorites` holds
  // plain product codes for THIS vendor only.
  let favorites = new Set();

  async function loadFavorites() {
    try {
      const res = await fetch(`/api/favorites/${VENDOR_SLUG}`);
      if (res.ok) favorites = new Set(await res.json());
    } catch (err) {
      console.error("Failed to load favorites", err);
    }
    render();
  }

  function toggleFavorite(code) {
    const wasFav = favorites.has(code);
    if (wasFav) favorites.delete(code); else favorites.add(code);
    render();
    showToast(wasFav ? "Removed from favorites" : "Saved to favorites");
    fetch("/api/favorites/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorSlug: VENDOR_SLUG, code }),
    }).then(() => {
      window.MastexFavoritesBadge?.update();
    }).catch((err) => {
      console.error("Failed to save favorite, reverting", err);
      if (wasFav) favorites.add(code); else favorites.delete(code);
      render();
    });
  }

  const grid = document.getElementById("grid");
  const resultCount = document.getElementById("resultCount");
  const favCountEl = document.getElementById("favCount");
  const emptyState = document.getElementById("emptyState");
  const searchInput = document.getElementById("searchInput");
  const favToggle = document.getElementById("favToggle");

  function filteredProducts() {
    let list = PRODUCTS.slice();
    if (state.inStockOnly) list = list.filter((p) => p.soh > 0 && p.remark !== "EOL");
    if (state.favOnly) list = list.filter((p) => favorites.has(p.code));
    if (state.q.trim()) {
      const q = state.q.trim().toLowerCase();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q)
      );
    }
    switch (state.sort) {
      case "name-asc": list.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "price-asc": list.sort((a, b) => a.priceEx - b.priceEx); break;
      case "price-desc": list.sort((a, b) => b.priceEx - a.priceEx); break;
      case "stock-desc": list.sort((a, b) => b.soh - a.soh); break;
    }
    return list;
  }

  function cartCtrlHtml(prod) {
    const qty = MastexCart.getQty(VENDOR_SLUG, prod.code);
    if (qty > 0) {
      return `<div class="qty-stepper">
        <button class="qty-btn" data-action="dec">−</button>
        <span class="qty-val">${qty}</span>
        <button class="qty-btn" data-action="inc">+</button>
      </div>`;
    }
    return `<button class="add-btn" data-action="add">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
      Add to order
    </button>`;
  }

  function render() {
    favToggle.classList.toggle("active", state.favOnly);
    const list = filteredProducts();
    resultCount.textContent = `Showing ${list.length} of ${PRODUCTS.length} products`;
    favCountEl.textContent = favorites.size ? `★ ${favorites.size} favorited` : "";
    grid.classList.toggle("list-mode", state.view === "list");

    if (list.length === 0) {
      grid.style.display = "none";
      emptyState.style.display = "block";
      return;
    }
    grid.style.display = "grid";
    emptyState.style.display = "none";

    grid.innerHTML = list.map((prod) => {
      const stock = stockInfo(prod);
      const isFav = favorites.has(prod.code);
      const catLabel = prod.category || VENDOR_NAME;
      return `
      <div class="card" data-code="${prod.code}">
        ${prod.remark === "NEW" ? '<span class="tag-new">NEW</span>' : ""}
        <button class="fav-btn ${isFav ? "active" : ""}" data-fav="${prod.code}" title="Save to favorites">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${isFav ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </button>
        <div class="card-media">${mediaHtml(prod, VENDOR_SLUG, false)}</div>
        <div class="card-body">
          <span class="card-cat">${catLabel}</span>
          <div class="card-title">${prod.name}</div>
          <span class="card-sku">${prod.sku}</span>
          <div class="card-foot">
            ${priceHtml(prod)}
            <span class="badge ${stock.cls}">${stock.label}</span>
          </div>
          <div class="cart-ctrl" data-code="${prod.code}">${cartCtrlHtml(prod)}</div>
        </div>
      </div>`;
    }).join("");

    grid.querySelectorAll(".fav-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFavorite(btn.dataset.fav);
      });
    });
    grid.querySelectorAll(".cart-ctrl").forEach((ctrl) => {
      ctrl.addEventListener("click", (e) => {
        e.stopPropagation();
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const prod = PRODUCTS.find((p) => p.code === ctrl.dataset.code);
        const meta = cartItemMeta(prod);
        if (btn.dataset.action === "add") { MastexCart.add(VENDOR_SLUG, VENDOR_NAME, meta, 1); showToast("Added to order list"); }
        else if (btn.dataset.action === "inc") { MastexCart.add(VENDOR_SLUG, VENDOR_NAME, meta, 1); }
        else if (btn.dataset.action === "dec") { MastexCart.add(VENDOR_SLUG, VENDOR_NAME, meta, -1); }
        render();
      });
    });
    grid.querySelectorAll(".card").forEach((card) => {
      card.addEventListener("click", () => openModal(card.dataset.code));
    });
  }

  const modalOverlay = document.getElementById("modalOverlay");
  const modalContent = document.getElementById("modalContent");

  function openModal(code) {
    const prod = PRODUCTS.find((p) => p.code === code);
    if (!prod) return;
    const stock = stockInfo(prod);
    modalContent.innerHTML = `
      <div>
        <div class="modal-media">${mediaHtml(prod, VENDOR_SLUG, true)}</div>
      </div>
      <div>
        <div class="modal-cat">${prod.category || VENDOR_NAME}</div>
        <h2 class="modal-title">${prod.name}</h2>
        <div class="modal-sku">SKU ${prod.sku}${prod.remark ? ` &nbsp;·&nbsp; <b style="color:var(--accent)">${prod.remark}</b>` : ""}</div>
        <div class="modal-price-row">
          ${modalPriceHtml(prod)}
          <span class="badge ${stock.cls}">${stock.label}</span>
        </div>
        <dl class="spec-grid">
          <div class="spec-item"><dt>Product code</dt><dd>${prod.code}</dd></div>
          <div class="spec-item"><dt>EAN</dt><dd>${prod.ean || "—"}</dd></div>
          <div class="spec-item"><dt>Weight</dt><dd>${prod.weight || "—"}</dd></div>
          <div class="spec-item"><dt>Dimensions</dt><dd>${prod.dims || "—"}</dd></div>
        </dl>
        <div class="modal-actions">
          <div class="cart-ctrl" id="modalCartCtrl" style="width:150px; margin-top:0;">${cartCtrlHtml(prod)}</div>
          ${prod.link ? `<a class="btn-primary" href="${prod.link}" target="_blank" rel="noopener">Open supplier link ↗</a>` : ""}
          <button class="btn-secondary" id="modalCopy">Copy SKU</button>
          <button class="btn-secondary" id="modalFav">${favorites.has(prod.code) ? "★ Favorited" : "☆ Add to favorites"}</button>
        </div>
      </div>
    `;
    modalOverlay.classList.add("open");
    document.getElementById("modalCartCtrl").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const meta = cartItemMeta(prod);
      if (btn.dataset.action === "add") { MastexCart.add(VENDOR_SLUG, VENDOR_NAME, meta, 1); showToast("Added to order list"); }
      else if (btn.dataset.action === "inc") { MastexCart.add(VENDOR_SLUG, VENDOR_NAME, meta, 1); }
      else if (btn.dataset.action === "dec") { MastexCart.add(VENDOR_SLUG, VENDOR_NAME, meta, -1); }
      openModal(code); render();
    });
    document.getElementById("modalCopy").addEventListener("click", () => {
      navigator.clipboard?.writeText(prod.sku).catch(() => {});
      showToast(`Copied "${prod.sku}"`);
    });
    document.getElementById("modalFav").addEventListener("click", () => {
      toggleFavorite(prod.code);
      openModal(code);
    });
  }
  document.getElementById("modalClose").addEventListener("click", () => modalOverlay.classList.remove("open"));
  modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) modalOverlay.classList.remove("open"); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") modalOverlay.classList.remove("open");
    if (e.key === "/" && document.activeElement !== searchInput) { e.preventDefault(); searchInput.focus(); }
  });

  let toastTimer;
  function showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  searchInput.addEventListener("input", (e) => { state.q = e.target.value; render(); });
  document.getElementById("inStockOnly").addEventListener("change", (e) => { state.inStockOnly = e.target.checked; render(); });
  favToggle.addEventListener("click", () => { state.favOnly = !state.favOnly; render(); });
  document.getElementById("sortSelect").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
  document.getElementById("viewGrid").addEventListener("click", () => {
    state.view = "grid";
    document.getElementById("viewGrid").classList.add("active");
    document.getElementById("viewList").classList.remove("active");
    render();
  });
  document.getElementById("viewList").addEventListener("click", () => {
    state.view = "list";
    document.getElementById("viewList").classList.add("active");
    document.getElementById("viewGrid").classList.remove("active");
    render();
  });
  document.getElementById("clearFilters").addEventListener("click", () => {
    state.q = ""; state.inStockOnly = false; state.favOnly = false;
    searchInput.value = ""; document.getElementById("inStockOnly").checked = false;
    render();
  });
  document.getElementById("themeToggle").addEventListener("click", () => MastexTheme.toggle());

  render();
  loadFavorites();
})();
