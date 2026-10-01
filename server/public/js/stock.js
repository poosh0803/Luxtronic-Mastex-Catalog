/* ============================================================
   The /stock page: Mastex products you already hold in your own Odoo
   inventory (server/index.js's GET /stock sends only EAN-matched
   products, each with odooQty set). Unlike /favorites (where every
   card is already favorited, so its star only ever removes), the star
   here is a real two-way toggle, so favorite state is loaded from the
   server the same way catalog.js does on a single vendor page.
   ============================================================ */
(function () {
  const { stockInfo, mediaHtml, priceHtml, modalPriceHtml, cartItemMeta, copyToClipboard, odooBadgeHtml, odooModalHtml } = window.MastexProduct;
  const items = window.__STOCK_ITEMS__ || [];

  let state = { q: "", vendor: "all", onHandOnly: true, sort: "odoo-desc", view: "grid" };
  // Shared, persisted server-side in data/favorites.json (see catalog.js's
  // identical reasoning) — keyed by "vendorSlug::code" since this page,
  // unlike a single vendor page, spans every vendor at once.
  let favorites = new Set();

  function favKey(vendorSlug, code) { return vendorSlug + "::" + code; }

  async function loadFavorites() {
    try {
      const res = await fetch("/api/favorites");
      if (res.ok) {
        const list = await res.json();
        favorites = new Set(list.map((f) => favKey(f.vendorSlug, f.code)));
      }
    } catch (err) {
      console.error("Failed to load favorites", err);
    }
    render();
  }

  function toggleFavorite(vendorSlug, code) {
    const key = favKey(vendorSlug, code);
    const wasFav = favorites.has(key);
    if (wasFav) favorites.delete(key); else favorites.add(key);
    render();
    showToast(wasFav ? "Removed from favorites" : "Saved to favorites");
    fetch("/api/favorites/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorSlug, code }),
    }).then(() => {
      window.MastexFavoritesBadge?.update();
    }).catch((err) => {
      console.error("Failed to save favorite, reverting", err);
      if (wasFav) favorites.add(key); else favorites.delete(key);
      render();
    });
  }

  const grid = document.getElementById("grid");
  const resultCount = document.getElementById("resultCount");
  const emptyState = document.getElementById("emptyState");
  const searchInput = document.getElementById("searchInput");
  const vendorFilter = document.getElementById("vendorFilter");

  function findItem(vendorSlug, code) {
    return items.find((i) => i.vendorSlug === vendorSlug && i.code === code);
  }

  function filteredItems() {
    let list = items.slice();
    if (state.vendor !== "all") list = list.filter((p) => p.vendorSlug === state.vendor);
    if (state.onHandOnly) list = list.filter((p) => p.odooQty > 0);
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
      case "odoo-desc": list.sort((a, b) => b.odooQty - a.odooQty || a.name.localeCompare(b.name)); break;
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

  function render() {
    const list = filteredItems();
    resultCount.textContent = `Showing ${list.length} of ${items.length} Mastex products matched in your Odoo`;
    grid.classList.toggle("list-mode", state.view === "list");

    if (list.length === 0) {
      grid.style.display = "none";
      emptyState.style.display = "block";
      const noMatches = items.length === 0;
      document.getElementById("emptyStateTitle").textContent = noMatches
        ? "No Mastex products found in your Odoo"
        : "No products match your filters";
      document.getElementById("emptyStateBody").textContent = noMatches
        ? "Either the Odoo API hasn't been reached yet, or none of your Odoo barcodes match a Mastex EAN."
        : "Try a different search term or clear your filters.";
      document.getElementById("clearFilters").style.display = noMatches ? "none" : "";
      return;
    }
    grid.style.display = "grid";
    emptyState.style.display = "none";

    grid.innerHTML = list.map((item) => {
      const stock = stockInfo(item);
      const isFav = favorites.has(favKey(item.vendorSlug, item.code));
      return `
      <div class="card" data-vendor="${item.vendorSlug}" data-code="${item.code}">
        ${item.remark === "NEW" ? '<span class="tag-new">NEW</span>' : ""}
        <button class="fav-btn ${isFav ? "active" : ""}" data-action="fav" title="Save to favorites">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${isFav ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
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
        toggleFavorite(card.dataset.vendor, card.dataset.code);
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
    const isFav = favorites.has(favKey(item.vendorSlug, item.code));
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
          <button class="btn-secondary" id="modalFav">${isFav ? "★ Favorited" : "☆ Add to favorites"}</button>
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
      toggleFavorite(item.vendorSlug, item.code);
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

  searchInput.addEventListener("input", (e) => { state.q = e.target.value; render(); });
  vendorFilter.addEventListener("change", (e) => { state.vendor = e.target.value; render(); });
  document.getElementById("onHandOnly").addEventListener("change", (e) => { state.onHandOnly = e.target.checked; render(); });
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
    state.q = ""; state.vendor = "all"; state.onHandOnly = false;
    searchInput.value = ""; vendorFilter.value = "all"; document.getElementById("onHandOnly").checked = false;
    render();
  });
  document.getElementById("themeToggle").addEventListener("click", () => MastexTheme.toggle());

  // ---------- "Sync with Odoo" ----------
  // Stock is otherwise refreshed server-side every 30 minutes. Product data
  // is server-rendered into the page, so a successful sync reloads it.
  const syncedAtEl = document.getElementById("odooSyncedAt");
  if (syncedAtEl) {
    const t = new Date(syncedAtEl.dataset.iso);
    const mins = Math.round((Date.now() - t.getTime()) / 60000);
    const ago = mins < 1 ? "just now" : mins === 1 ? "1 min ago" : mins < 60 ? `${mins} min ago` : t.toLocaleString();
    syncedAtEl.textContent = ` Last synced with Odoo: ${ago}.`;
    syncedAtEl.title = t.toLocaleString();
  }

  const odooSyncBtn = document.getElementById("odooSyncBtn");
  if (odooSyncBtn) {
    odooSyncBtn.addEventListener("click", () => {
      odooSyncBtn.disabled = true;
      odooSyncBtn.textContent = "Syncing…";
      fetch("/api/inventory/refresh", { method: "POST" })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
          showToast("Synced with Odoo — reloading…");
          setTimeout(() => window.location.reload(), 400);
        })
        .catch((err) => {
          console.error("Odoo sync failed", err);
          showToast(`Odoo sync failed: ${err.message}`);
          odooSyncBtn.disabled = false;
          odooSyncBtn.textContent = "Sync with Odoo";
        });
    });
  }

  render();
  loadFavorites();
})();
