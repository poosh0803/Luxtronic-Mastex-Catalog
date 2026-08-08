/* ============================================================
   The /favorites page: shows every favorited product across all
   vendors. The server resolves each {vendorSlug, code} pair from
   data/favorites.json into full product data (window.__FAVORITE_ITEMS__)
   before this runs, so no extra fetch is needed here.
   ============================================================ */
(function () {
  const { stockInfo, mediaHtml, priceHtml, modalPriceHtml, cartItemMeta } = window.MastexProduct;
  let items = window.__FAVORITE_ITEMS__ || [];

  let state = { q: "", inStockOnly: false, sort: "relevance", view: "grid" };

  const grid = document.getElementById("grid");
  const resultCount = document.getElementById("resultCount");
  const emptyState = document.getElementById("emptyState");
  const searchInput = document.getElementById("searchInput");

  function findItem(vendorSlug, code) {
    return items.find((i) => i.vendorSlug === vendorSlug && i.code === code);
  }

  function filteredItems() {
    let list = items.slice();
    if (state.inStockOnly) list = list.filter((p) => p.soh > 0 && p.remark !== "EOL");
    if (state.q.trim()) {
      const q = state.q.trim().toLowerCase();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.vendorName.toLowerCase().includes(q)
      );
    }
    switch (state.sort) {
      case "name-asc": list.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "price-asc": list.sort((a, b) => a.priceEx - b.priceEx); break;
      case "price-desc": list.sort((a, b) => b.priceEx - a.priceEx); break;
      case "stock-desc": list.sort((a, b) => b.soh - a.soh); break;
      case "vendor": list.sort((a, b) => a.vendorName.localeCompare(b.vendorName) || a.name.localeCompare(b.name)); break;
    }
    return list;
  }

  function cartCtrlHtml(item) {
    const qty = MastexCart.getQty(item.vendorSlug, item.code);
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

  function removeFavorite(item) {
    items = items.filter((i) => !(i.vendorSlug === item.vendorSlug && i.code === item.code));
    const footerSummary = document.getElementById("footerSummary");
    if (footerSummary) {
      const vendorCount = new Set(items.map((i) => i.vendorSlug)).size;
      footerSummary.textContent = `${items.length} favorite${items.length === 1 ? "" : "s"} across ${vendorCount} vendor${vendorCount === 1 ? "" : "s"}`;
    }
    render();
    showToast("Removed from favorites");
    fetch("/api/favorites/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorSlug: item.vendorSlug, code: item.code }),
    }).then(() => window.MastexFavoritesBadge?.update())
      .catch((err) => console.error("Failed to remove favorite", err));
  }

  function render() {
    const list = filteredItems();
    resultCount.textContent = `Showing ${list.length} of ${items.length} favorites`;
    grid.classList.toggle("list-mode", state.view === "list");

    if (list.length === 0) {
      grid.style.display = "none";
      emptyState.style.display = "block";
      const title = document.getElementById("emptyStateTitle");
      const body = document.getElementById("emptyStateBody");
      const action = document.getElementById("emptyStateAction");
      if (items.length === 0) {
        title.textContent = "No favorites yet";
        body.textContent = "Click the star on any product across any vendor page to save it here.";
        action.textContent = "Browse vendors";
        action.onclick = () => { location.href = "/"; };
      } else {
        title.textContent = "No favorites match your filters";
        body.textContent = "Try a different search term or clear your filters.";
        action.textContent = "Clear all filters";
        action.onclick = () => {
          state.q = ""; state.inStockOnly = false;
          searchInput.value = ""; document.getElementById("inStockOnly").checked = false;
          render();
        };
      }
      return;
    }
    grid.style.display = "grid";
    emptyState.style.display = "none";

    grid.innerHTML = list.map((item) => {
      const stock = stockInfo(item);
      return `
      <div class="card" data-vendor="${item.vendorSlug}" data-code="${item.code}">
        ${item.remark === "NEW" ? '<span class="tag-new">NEW</span>' : ""}
        <button class="fav-btn active" data-action="unfav" title="Remove from favorites">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </button>
        <div class="card-media">${mediaHtml(item, item.vendorSlug, false)}</div>
        <div class="card-body">
          <span class="card-cat">${item.vendorName}</span>
          <div class="card-title">${item.name}</div>
          <span class="card-sku">${item.sku}</span>
          <div class="card-foot">
            ${priceHtml(item)}
            <span class="badge ${stock.cls}">${stock.label}</span>
          </div>
          <div class="cart-ctrl" data-code="${item.code}">${cartCtrlHtml(item)}</div>
        </div>
      </div>`;
    }).join("");

    grid.querySelectorAll(".fav-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const card = btn.closest(".card");
        const item = findItem(card.dataset.vendor, card.dataset.code);
        if (item) removeFavorite(item);
      });
    });
    grid.querySelectorAll(".cart-ctrl").forEach((ctrl) => {
      ctrl.addEventListener("click", (e) => {
        e.stopPropagation();
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const card = ctrl.closest(".card");
        const item = findItem(card.dataset.vendor, card.dataset.code);
        if (!item) return;
        const meta = cartItemMeta(item);
        if (btn.dataset.action === "add") { MastexCart.add(item.vendorSlug, item.vendorName, meta, 1); showToast("Added to order list"); }
        else if (btn.dataset.action === "inc") { MastexCart.add(item.vendorSlug, item.vendorName, meta, 1); }
        else if (btn.dataset.action === "dec") { MastexCart.add(item.vendorSlug, item.vendorName, meta, -1); }
        render();
      });
    });
    grid.querySelectorAll(".card").forEach((card) => {
      card.addEventListener("click", () => {
        const item = findItem(card.dataset.vendor, card.dataset.code);
        if (item) openModal(item);
      });
    });
  }

  const modalOverlay = document.getElementById("modalOverlay");
  const modalContent = document.getElementById("modalContent");

  function openModal(item) {
    const stock = stockInfo(item);
    modalContent.innerHTML = `
      <div><div class="modal-media">${mediaHtml(item, item.vendorSlug, true)}</div></div>
      <div>
        <div class="modal-cat">${item.vendorName}</div>
        <h2 class="modal-title">${item.name}</h2>
        <div class="modal-sku">SKU ${item.sku}${item.remark ? ` &nbsp;·&nbsp; <b style="color:var(--accent)">${item.remark}</b>` : ""}</div>
        <div class="modal-price-row">
          ${modalPriceHtml(item)}
          <span class="badge ${stock.cls}">${stock.label}</span>
        </div>
        <dl class="spec-grid">
          <div class="spec-item"><dt>Product code</dt><dd>${item.code}</dd></div>
          <div class="spec-item"><dt>EAN</dt><dd>${item.ean || "—"}</dd></div>
          <div class="spec-item"><dt>Weight</dt><dd>${item.weight || "—"}</dd></div>
          <div class="spec-item"><dt>Dimensions</dt><dd>${item.dims || "—"}</dd></div>
        </dl>
        <div class="modal-actions">
          <div class="cart-ctrl" id="modalCartCtrl" style="width:150px; margin-top:0;">${cartCtrlHtml(item)}</div>
          ${item.link ? `<a class="btn-primary" href="${item.link}" target="_blank" rel="noopener">Open supplier link ↗</a>` : ""}
          <button class="btn-secondary" id="modalCopy">Copy SKU</button>
          <button class="btn-secondary" id="modalFav">★ Remove from favorites</button>
        </div>
      </div>
    `;
    modalOverlay.classList.add("open");
    document.getElementById("modalCartCtrl").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const meta = cartItemMeta(item);
      if (btn.dataset.action === "add") { MastexCart.add(item.vendorSlug, item.vendorName, meta, 1); showToast("Added to order list"); }
      else if (btn.dataset.action === "inc") { MastexCart.add(item.vendorSlug, item.vendorName, meta, 1); }
      else if (btn.dataset.action === "dec") { MastexCart.add(item.vendorSlug, item.vendorName, meta, -1); }
      openModal(item); render();
    });
    document.getElementById("modalCopy").addEventListener("click", () => {
      navigator.clipboard?.writeText(item.sku).catch(() => {});
      showToast(`Copied "${item.sku}"`);
    });
    document.getElementById("modalFav").addEventListener("click", () => {
      modalOverlay.classList.remove("open");
      removeFavorite(item);
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
  document.getElementById("themeToggle").addEventListener("click", () => MastexTheme.toggle());

  render();
})();
