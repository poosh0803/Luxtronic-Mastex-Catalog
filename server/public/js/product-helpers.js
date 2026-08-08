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

  // Three distinct prices, ex-price-first (internal tool — staff, not
  // customers): ex (what the sheet lists as cost, ex GST) is the
  // prominent figure everywhere; inc (ex × 1.1, GST-inclusive cost — NOT
  // the same number as RRP) and RRP (the sheet's recommended *sale*
  // price) are both secondary reference figures shown smaller alongside.
  function formatMoney(n) {
    const rounded = Math.round(n * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  }
  function incPrice(prod) {
    return Math.round(prod.priceEx * 1.1 * 100) / 100;
  }
  function priceSubline(prod) {
    const parts = [`$${formatMoney(incPrice(prod))} inc`];
    if (prod.rrp) parts.push(`$${formatMoney(prod.rrp)} RRP`);
    return parts.join(" &nbsp;·&nbsp; ");
  }

  function priceHtml(prod) {
    if (!prod.priceEx) return `<span class="card-price" style="font-size:13px;color:var(--text-dim);">Price TBC</span>`;
    return `<span class="card-price-wrap">
      <span class="card-price">$${formatMoney(prod.priceEx)}</span>
      <span class="card-price-sub">${priceSubline(prod)}</span>
    </span>`;
  }

  // Same ex/inc/RRP breakdown, plus margin %, for the product detail modal.
  function modalPriceHtml(prod) {
    if (!prod.priceEx) {
      return `<span class="modal-price" style="font-size:18px;color:var(--text-dim);">Price to be confirmed</span>`;
    }
    return `<span class="modal-price">$${formatMoney(prod.priceEx)}</span>
      <span class="modal-price-sub">${priceSubline(prod)}</span>
      ${prod.rrp ? `<span class="badge margin">${prod.margin}% margin</span>` : ""}`;
  }

  // price = ex (what the cart/order-list totals up); priceRrp = RRP (sale
  // price), kept alongside purely for reference display in the cart —
  // inc is re-derived there too (price × 1.1), never summed as cost.
  function cartItemMeta(prod) {
    return { code: prod.code, sku: prod.sku, name: prod.name, price: prod.priceEx, priceRrp: prod.rrp };
  }

  window.MastexProduct = { stockInfo, mediaHtml, priceHtml, modalPriceHtml, cartItemMeta };
})(window);
