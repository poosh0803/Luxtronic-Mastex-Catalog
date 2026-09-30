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

  // Your own on-hand Odoo stock, matched by EAN server-side (see
  // server/lib/odoo-inventory.js, which sets odooQty on any product with a
  // matching barcode in Odoo before it ever reaches this page) — so this is
  // a pure display concern, no fetch/lookup needed here. Absent entirely
  // (undefined, not 0) for a product with no Odoo match; shown even at 0,
  // since "you have none of this either" is exactly the point.
  function hasOdooStock(prod) {
    return prod.odooQty !== undefined && prod.odooQty !== null;
  }
  function odooBadgeHtml(prod) {
    if (!hasOdooStock(prod)) return "";
    const cls = prod.odooQty > 0 ? "has-stock" : "no-stock";
    return `<span class="badge odoo ${cls}" title="Your on-hand Odoo stock, matched by EAN">🏬 ${prod.odooQty}</span>`;
  }
  function odooModalHtml(prod) {
    if (!hasOdooStock(prod)) return "";
    const cls = prod.odooQty > 0 ? "has-stock" : "no-stock";
    const forecastNote = prod.odooVirtualQty !== prod.odooQty
      ? ` <span class="modal-odoo-sub">(${prod.odooVirtualQty} forecast)</span>`
      : "";
    return `<div class="modal-odoo-row">
      <span class="badge odoo ${cls}">🏬 Your stock: ${prod.odooQty} on hand</span>${forecastNote}
    </div>`;
  }

  // navigator.clipboard only exists in a "secure context" (https:// or
  // localhost) — this app is also reached over plain http:// on a LAN IP
  // (e.g. http://192.168.68.255:8002), where navigator.clipboard is
  // undefined and `navigator.clipboard?.writeText(...)` silently becomes
  // `undefined.then(...)`, throwing before any UI feedback runs.
  // `execCommand("copy")` is deprecated but still works there, so it's the
  // fallback rather than the only path.
  function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) resolve(); else reject(new Error("execCommand copy failed"));
    });
  }

  window.MastexProduct = { stockInfo, mediaHtml, priceHtml, modalPriceHtml, cartItemMeta, copyToClipboard, odooBadgeHtml, odooModalHtml };
})(window);
