/* ============================================================
   Shared product-card rendering helpers, used by both catalog.js
   (single-vendor pages) and favorites.js (cross-vendor page) so
   stock/price/image logic doesn't drift between the two.
   ============================================================ */
(function (window) {
  function stockInfo(prod) {
    if (prod.remark === "EOL") return { cls: "eol", label: "Discontinued" };
    if (prod.soh === 0) return { cls: "out", label: "Out of stock" };
    if (prod.soh <= 5) return { cls: "low", label: `Low · ${prod.soh} left` };
    return { cls: "in", label: `In stock · ${prod.soh}` };
  }

  function mediaHtml(prod, vendorSlug, isModal) {
    if (prod.image) {
      return `<img src="/images/${vendorSlug}/${prod.image}" alt="${prod.name}" loading="lazy">`;
    }
    return `<div class="noimg">
      <svg width="${isModal ? 32 : 26}" height="${isModal ? 32 : 26}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
      <span>No image in sheet</span>
    </div>`;
  }

  function priceHtml(prod) {
    if (!prod.rrp) return `<span class="card-price" style="font-size:13px;color:var(--text-dim);">Price TBC</span>`;
    return `<span class="card-price">$${prod.rrp}</span>`;
  }

  function cartItemMeta(prod) {
    return { code: prod.code, sku: prod.sku, name: prod.name, price: prod.rrp };
  }

  window.MastexProduct = { stockInfo, mediaHtml, priceHtml, cartItemMeta };
})(window);
