/* ============================================================
   The /orders page: lists every saved order (server/index.js's
   /api/orders, backed by data/orders.json). Orders are frozen
   snapshots — editing quantities here PUTs straight to the specific
   order record, never touches the live cart or re-resolves against
   today's vendor data. "Restore to cart" is the one bridge back to
   the live cart (server/public/js/cart.js).
   ============================================================ */
(function () {
  let orders = window.__ORDERS__ || [];
  const expanded = new Set();
  const wrap = document.getElementById("wrap");

  function money(n) { return (Math.round(n * 100) / 100).toFixed(2); }

  function priceSubline(exPrice, rrp) {
    const inc = Math.round(exPrice * 1.1 * 100) / 100;
    const parts = [`$${inc.toFixed(2)} inc`];
    if (rrp) parts.push(`$${rrp.toFixed(2)} RRP`);
    return parts.join(" &nbsp;·&nbsp; ");
  }

  function orderTotals(order) {
    return order.items.reduce((acc, i) => {
      acc.count += i.qty;
      acc.ex += i.qty * i.price;
      return acc;
    }, { count: 0, ex: 0 });
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  function findOrder(id) {
    return orders.find((o) => o.id === id);
  }

  function render() {
    if (orders.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <h3>No saved orders yet</h3>
          <p>Build up a cart on any vendor page, then click "Save to order history" on the /cart page.</p>
          <a href="/cart">Go to cart</a>
        </div>`;
      return;
    }

    wrap.innerHTML = orders.map((order) => {
      const totals = orderTotals(order);
      const isOpen = expanded.has(order.id);
      const rows = order.items.map((item) => `
        <div class="item-row" data-order="${order.id}" data-vendor="${item.vendorSlug}" data-code="${item.code}">
          <div class="item-info">
            <div class="item-name">${item.name}</div>
            <div class="item-sku">${item.vendorName} &nbsp;·&nbsp; ${item.sku}</div>
          </div>
          <div class="item-price">
            <span class="item-price-ex">$${money(item.price)}</span>
            <span class="item-price-sub">${priceSubline(item.price, item.priceRrp)}</span>
          </div>
          <div class="qty-stepper">
            <button class="qty-btn" data-action="dec">−</button>
            <span class="qty-val">${item.qty}</span>
            <button class="qty-btn" data-action="inc">+</button>
          </div>
          <div class="item-total">$${money(item.qty * item.price)}</div>
          <button class="item-remove" data-action="remove" title="Remove item">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `).join("");

      return `
        <div class="order-card" data-id="${order.id}">
          <div class="order-head">
            <div class="order-head-main">
              <input class="order-label-input" data-id="${order.id}" value="${(order.label || "").replace(/"/g, "&quot;")}" placeholder="Untitled order">
              <span class="order-date">${formatDate(order.createdAt)}</span>
            </div>
            <div class="order-head-meta">
              <span class="order-summary">${totals.count} item${totals.count === 1 ? "" : "s"} &nbsp;·&nbsp; $${money(totals.ex)} ex</span>
              <button class="btn-secondary" data-action="toggle">${isOpen ? "Hide items" : "Edit items"}</button>
              <button class="btn-secondary" data-action="restore">Restore to cart</button>
              <button class="btn-secondary btn-danger" data-action="delete">Delete</button>
            </div>
          </div>
          <div class="order-items" ${isOpen ? "" : "hidden"}>${rows}</div>
        </div>`;
    }).join("");

    wire();
  }

  // Writes the new item list for one order. An edit that empties the order
  // is treated as "delete the whole order" (confirmed first) rather than
  // silently sending an empty items array — the server rejects that anyway.
  function saveOrderItems(order, newItems) {
    if (newItems.length === 0) {
      if (!confirm("Removing this leaves the order empty — delete the whole order?")) {
        render();
        return;
      }
      deleteOrder(order.id);
      return;
    }
    order.items = newItems;
    render();
    fetch(`/api/orders/${order.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: newItems }),
    }).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }).catch((err) => {
      console.error("Failed to save order", err);
      showToast("Couldn't save changes — reloading to stay in sync");
      setTimeout(() => window.location.reload(), 1200);
    });
  }

  function deleteOrder(id) {
    orders = orders.filter((o) => o.id !== id);
    expanded.delete(id);
    render();
    showToast("Order deleted");
    fetch(`/api/orders/${id}`, { method: "DELETE" }).then((res) => {
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
    }).catch((err) => {
      console.error("Failed to delete order", err);
      showToast("Couldn't delete — reloading to stay in sync");
      setTimeout(() => window.location.reload(), 1200);
    });
  }

  function wire() {
    wrap.querySelectorAll(".order-label-input").forEach((input) => {
      input.addEventListener("change", () => {
        const order = findOrder(input.dataset.id);
        if (!order) return;
        order.label = input.value.trim();
        fetch(`/api/orders/${order.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: order.label }),
        }).then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          showToast("Saved");
        }).catch((err) => {
          console.error("Failed to rename order", err);
          showToast("Couldn't save the label — reloading to stay in sync");
          setTimeout(() => window.location.reload(), 1200);
        });
      });
    });

    wrap.querySelectorAll(".order-card").forEach((card) => {
      const id = card.dataset.id;
      const order = findOrder(id);
      if (!order) return;

      card.querySelector('[data-action="toggle"]').addEventListener("click", () => {
        if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
        render();
      });
      card.querySelector('[data-action="restore"]').addEventListener("click", () => {
        order.items.forEach((item) => {
          MastexCart.setQty(item.vendorSlug, item.vendorName, {
            code: item.code, sku: item.sku, name: item.name, price: item.price, priceRrp: item.priceRrp,
          }, item.qty);
        });
        showToast("Restored to cart — opening order list…");
        setTimeout(() => { window.location.href = "/cart"; }, 500);
      });
      card.querySelector('[data-action="delete"]').addEventListener("click", () => {
        if (confirm(`Delete "${order.label || "this order"}"? This can't be undone.`)) {
          deleteOrder(id);
        }
      });
    });

    wrap.querySelectorAll(".item-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const order = findOrder(row.dataset.order);
        if (!order) return;
        const vendorSlug = row.dataset.vendor;
        const code = row.dataset.code;
        // Match on vendorSlug + code, not code alone — an order can span
        // multiple vendors, and two vendors could in principle share a
        // product code. Matching by code only would silently edit every
        // line with that code instead of just the one clicked.
        const isTarget = (i) => i.vendorSlug === vendorSlug && i.code === code;
        const item = order.items.find(isTarget);
        if (!item) return;

        if (btn.dataset.action === "inc") {
          const newItems = order.items.map((i) => (isTarget(i) ? { ...i, qty: i.qty + 1 } : i));
          saveOrderItems(order, newItems);
        } else if (btn.dataset.action === "dec") {
          const newQty = item.qty - 1;
          const newItems = newQty > 0
            ? order.items.map((i) => (isTarget(i) ? { ...i, qty: newQty } : i))
            : order.items.filter((i) => !isTarget(i));
          saveOrderItems(order, newItems);
        } else if (btn.dataset.action === "remove") {
          const newItems = order.items.filter((i) => !isTarget(i));
          saveOrderItems(order, newItems);
        }
      });
    });
  }

  let toastTimer;
  function showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }

  document.getElementById("themeToggle").addEventListener("click", () => MastexTheme.toggle());

  render();
})();
