/* ============================================================
   The /search page: global search over every product from every
   vendor. The server sends the whole catalog (window.__SEARCH_ITEMS__);
   nothing renders until the user types or picks a vendor, and results
   are capped (with "Show more") so ~1,500 cards never hit the DOM at once.
   ============================================================ */
(function () {
  const { stockInfo, mediaHtml, priceHtml, modalPriceHtml, cartItemMeta, copyToClipboard, odooBadgeHtml, odooModalHtml } = window.MastexProduct;
  let items = window.__SEARCH_ITEMS__ || [];

  const PAGE = 60;
  let state = { q: "", vendor: "", inStockOnly: false, sort: "relevance", view: "grid", limit: PAGE };
  let favSet = new Set();
  const favKey = (i) => i.vendorSlug + "|" + i.code;
  const hasQuery = () => state.q.trim().length >= 2 || state.vendor !== "";
  fetch("/api/favorites").then((r) => r.json()).then((l) => { favSet = new Set(l.map((f) => f.vendorSlug + "|" + f.code)); render(); }).catch(() => {});

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
    if (state.vendor) list = list.filter((p) => p.vendorSlug === state.vendor);
    const terms = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length) {
      list = list.filter((p) => {
        const hay = [p.name, p.sku, p.code, p.ean, p.vendorName, p.category, p.remark].join(" ").toLowerCase();
        return terms.every((t) => hay.includes(t));
      });
    }
    if (state.sort === "relevance" && terms.length) {
      const q = terms.join(" ");
      const score = (p) => {
        const s = (p.sku || "").toLowerCase(), c = (p.code || "").toLowerCase(), n = (p.name || "").toLowerCase();
        return s === q || c === q || p.ean === q ? 0 : s.startsWith(q) || c.startsWith(q) ? 1 : n.startsWith(q) ? 2 : 3;
      };
      list.sort((a, b) => score(a) - score(b));
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

  function toggleFavorite(item) {
    const key = favKey(item);
    const adding = !favSet.has(key);
    if (adding) favSet.add(key); else favSet.delete(key);
    render();
    showToast(adding ? "Added to favorites" : "Removed from favorites");
    fetch("/api/favorites/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorSlug: item.vendorSlug, code: item.code }),
    }).then(() => window.MastexFavoritesBadge?.update())
      .catch((err) => console.error("Failed to toggle favorite", err));
  }

  function render() {
    const title = document.getElementById("emptyStateTitle");
    const body = document.getElementById("emptyStateBody");
    const action = document.getElementById("emptyStateAction");
    const showMore = document.getElementById("showMore");
    grid.classList.toggle("list-mode", state.view === "list");
    if (!hasQuery()) {
      resultCount.textContent = `Type at least 2 characters, or pick a vendor, to search ${items.length} products`;
      grid.style.display = "none"; showMore.style.display = "none";
      emptyState.style.display = "block";
      title.textContent = "Search the catalog";
      body.textContent = "Search by product name, SKU, product code, EAN or vendor. Multiple words narrow the results.";
      action.style.display = "none";
      return;
    }
    const all = filteredItems();
    const list = all.slice(0, state.limit);
    resultCount.textContent = `Showing ${list.length} of ${all.length} matching products`;
    showMore.style.display = all.length > list.length ? "" : "none";
    showMore.textContent = `Show more results (${all.length - list.length} left)`;
    if (all.length === 0) {
      grid.style.display = "none";
      emptyState.style.display = "block";
      title.textContent = "No products match";
      body.textContent = "Try a different search term or another vendor.";
      action.style.display = "";
      action.onclick = () => { state.q = ""; state.vendor = ""; state.limit = PAGE; searchInput.value = ""; document.getElementById("vendorSelect").value = ""; render(); };
      return;
    }
    grid.style.display = "grid";
    emptyState.style.display = "none";

    grid.innerHTML = list.map((item) => {
      const stock = stockInfo(item);
      return `
      <div class="card" data-vendor="${item.vendorSlug}" data-code="${item.code}">
        ${item.remark === "NEW" ? '<span class="tag-new">NEW</span>' : ""}
        <button class="fav-btn${favSet.has(favKey(item)) ? " active" : ""}" data-action="fav" title="Toggle favorite">
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
          ${odooBadgeHtml(item) ? `<div class="card-odoo">${odooBadgeHtml(item)}</div>` : ""}
          <div class="cart-ctrl" data-code="${item.code}">${cartCtrlHtml(item)}</div>
        </div>
      </div>`;
    }).join("");

    grid.querySelectorAll(".fav-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const card = btn.closest(".card");
        const item = findItem(card.dataset.vendor, card.dataset.code);
        if (item) toggleFavorite(item);
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
        ${odooModalHtml(item)}
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
          <button class="btn-secondary" id="modalFav">${favSet.has(favKey(item)) ? "★ Remove from favorites" : "☆ Add to favorites"}</button>
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
      copyToClipboard(item.sku)
        .then(() => showToast(`Copied "${item.sku}"`))
        .catch(() => showToast("Couldn't copy — select and copy the SKU manually"));
    });
    document.getElementById("modalFav").addEventListener("click", () => {
      toggleFavorite(item);
      openModal(item);
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

  searchInput.addEventListener("input", (e) => { state.q = e.target.value; state.limit = PAGE; render(); });
  document.getElementById("vendorSelect").addEventListener("change", (e) => { state.vendor = e.target.value; state.limit = PAGE; render(); });
  document.getElementById("showMore").addEventListener("click", () => { state.limit += PAGE; render(); });
  document.getElementById("inStockOnly").addEventListener("change", (e) => { state.inStockOnly = e.target.checked; state.limit = PAGE; render(); });
  document.getElementById("sortSelect").addEventListener("change", (e) => { state.sort = e.target.value; state.limit = PAGE; render(); });
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
