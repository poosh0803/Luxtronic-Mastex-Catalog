/* ============================================================
   The /cart page itself: renders the combined order list grouped
   by vendor, and wires up qty steppers, removal, CSV export, and
   copy-as-text. Vendor accent colors are computed the same way as
   server/lib/vendor-theme.js so a vendor's dot color here matches
   its own page (kept in sync manually — see colorFor below).
   ============================================================ */
(function () {
  const PALETTE = [
    "#e8590c", "#0d9488", "#6d28d9", "#be185d", "#0369a1",
    "#b45309", "#166534", "#9333ea", "#c2410c", "#0e7490",
    "#dc2626", "#4338ca", "#059669", "#a21caf", "#ca8a04",
  ];
  function hashString(s) {
    let h = 0;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h;
  }
  function colorFor(name) {
    return PALETTE[hashString(name) % PALETTE.length];
  }

  const wrap = document.getElementById("wrap");

  // Ex is the price the cart actually totals (see MastexCart.totalValue());
  // inc (ex × 1.1, GST-inclusive) and RRP (sale price) are both re-derived
  // here purely for the smaller reference line, never summed as cost.
  function priceSubline(exPrice, rrp) {
    const inc = Math.round(exPrice * 1.1 * 100) / 100;
    const parts = [`$${inc.toFixed(2)} inc`];
    if (rrp) parts.push(`$${rrp.toFixed(2)} RRP`);
    return parts.join(" &nbsp;·&nbsp; ");
  }

  function render() {
    const items = MastexCart.all();
    if (items.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          <h3>Your order list is empty</h3>
          <p>Browse a vendor page and click "Add to order" on any product.</p>
          <a href="/">Browse vendors</a>
        </div>`;
      return;
    }

    const byVendor = {};
    items.forEach((i) => { (byVendor[i.vendorSlug] ||= { name: i.vendorName, items: [] }).items.push(i); });

    const groupsHtml = Object.keys(byVendor).sort((a, b) => byVendor[a].name.localeCompare(byVendor[b].name)).map((slug) => {
      const group = byVendor[slug];
      const subtotal = group.items.reduce((s, i) => s + i.qty * i.price, 0);
      const rows = group.items.map((item) => `
        <div class="item-row" data-vendor="${slug}" data-code="${item.code}">
          <div class="item-info">
            <div class="item-name">${item.name}</div>
            <div class="item-sku">${item.sku}</div>
          </div>
          <div class="item-price">
            <span class="item-price-ex">$${item.price.toFixed(2)}</span>
            <span class="item-price-sub">${priceSubline(item.price, item.priceRrp)}</span>
          </div>
          <div class="qty-stepper">
            <button class="qty-btn" data-action="dec">−</button>
            <span class="qty-val">${item.qty}</span>
            <button class="qty-btn" data-action="inc">+</button>
          </div>
          <div class="item-total">$${(item.qty * item.price).toFixed(2)}</div>
          <button class="item-remove" data-action="remove" title="Remove">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `).join("");
      return `
        <div class="vendor-group">
          <div class="vendor-head">
            <span class="vendor-dot" style="background:${colorFor(group.name)}"></span>
            <h2>${group.name}</h2>
            <span class="vendor-subtotal">${group.items.reduce((s, i) => s + i.qty, 0)} items · $${subtotal.toFixed(2)}</span>
          </div>
          ${rows}
        </div>`;
    }).join("");

    const totalCount = MastexCart.totalCount();
    const totalValue = MastexCart.totalValue();
    const totalValueRrp = items.reduce((s, i) => s + i.qty * (i.priceRrp || 0), 0);
    const vendorCount = Object.keys(byVendor).length;

    wrap.innerHTML = `
      ${groupsHtml}
      <div class="summary">
        <div class="summary-row"><span>${totalCount} item${totalCount === 1 ? "" : "s"} across ${vendorCount} vendor${vendorCount === 1 ? "" : "s"}</span><span></span></div>
        <div class="summary-row total">
          <span>Total (ex)</span>
          <span class="summary-total-price">
            $${totalValue.toFixed(2)}
            <span class="summary-total-sub">${priceSubline(totalValue, totalValueRrp)}</span>
          </span>
        </div>
        <div class="summary-actions">
          <button class="btn-primary" id="saveOrder">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Save to order history
          </button>
          <button class="btn-secondary" id="exportCsv">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export as CSV
          </button>
          <button class="btn-secondary" id="copyText">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy as text
          </button>
          <button class="btn-secondary btn-danger" id="clearCart">Clear order list</button>
        </div>
      </div>
    `;

    wrap.querySelectorAll(".item-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const slug = row.dataset.vendor, code = row.dataset.code;
        const item = MastexCart.all().find((i) => i.vendorSlug === slug && i.code === code);
        if (!item) return;
        if (btn.dataset.action === "inc") MastexCart.add(slug, item.vendorName, item, 1);
        else if (btn.dataset.action === "dec") MastexCart.add(slug, item.vendorName, item, -1);
        else if (btn.dataset.action === "remove") MastexCart.removeItem(slug, code);
        render();
      });
    });

    document.getElementById("saveOrder").addEventListener("click", saveToOrderHistory);
    document.getElementById("exportCsv").addEventListener("click", exportCsv);
    document.getElementById("copyText").addEventListener("click", copyText);
    document.getElementById("clearCart").addEventListener("click", () => {
      if (confirm("Clear the entire order list? This can't be undone.")) {
        MastexCart.clear();
        render();
      }
    });
  }

  // Snapshots the current cart into data/orders.json (server/index.js) as a
  // frozen order record, then clears the working cart — "saving" means
  // "I've sent this to Mastex," ready for the next one. See REQUIREMENTS.md
  // for why order history freezes prices instead of re-reading live data.
  function saveToOrderHistory() {
    const label = prompt("Label for this order (optional):", "");
    if (label === null) return; // cancelled
    const items = MastexCart.all();
    fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, items }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(() => {
        MastexCart.clear();
        render();
        showToast("Saved to order history");
      })
      .catch((err) => {
        console.error("Failed to save order", err);
        showToast("Couldn't save — try again");
      });
  }

  function csvEscape(v) {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportCsv() {
    const items = MastexCart.all();
    const rows = [["Vendor", "Product Code", "SKU", "Description", "Qty", "Unit Price", "Line Total"]];
    items.forEach((i) => rows.push([i.vendorName, i.code, i.sku, i.name, i.qty, i.price.toFixed(2), (i.qty * i.price).toFixed(2)]));
    rows.push([]);
    rows.push(["", "", "", "", "", "Grand Total", MastexCart.totalValue().toFixed(2)]);
    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `mastex-order-list-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("CSV downloaded");
  }

  function copyText() {
    const items = MastexCart.all();
    const byVendor = {};
    items.forEach((i) => { (byVendor[i.vendorName] ||= []).push(i); });
    const date = new Date().toLocaleDateString();
    let lines = [`Mastex Order List — ${date}`, ""];
    Object.keys(byVendor).sort().forEach((vendorName) => {
      lines.push(vendorName);
      byVendor[vendorName].forEach((i) => {
        lines.push(`  ${i.sku}  ${i.name}  x${i.qty}  $${i.price.toFixed(2)}  = $${(i.qty * i.price).toFixed(2)}`);
      });
      lines.push("");
    });
    lines.push(`Grand Total: $${MastexCart.totalValue().toFixed(2)}`);
    navigator.clipboard?.writeText(lines.join("\n")).then(() => showToast("Order list copied to clipboard")).catch(() => showToast("Couldn't copy — try Export CSV instead"));
  }

  let toastTimer;
  function showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2000);
  }

  window.addEventListener("cart:change", render);
  document.getElementById("themeToggle").addEventListener("click", () => MastexTheme.toggle());

  render();
})();
