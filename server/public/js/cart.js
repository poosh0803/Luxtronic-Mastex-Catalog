/* ============================================================
   Shared "order list" cart, used across every vendor page plus
   the /cart page. Persisted in localStorage so items added on one
   vendor page are still there when you visit another vendor or
   the cart page.
   ============================================================ */
(function (window) {
  const CART_KEY = "mastexCart_v1";

  function load() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function save(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateBadge();
    window.dispatchEvent(new CustomEvent("cart:change"));
  }
  function keyOf(vendorSlug, code) { return vendorSlug + "::" + code; }

  function getQty(vendorSlug, code) {
    const item = load()[keyOf(vendorSlug, code)];
    return item ? item.qty : 0;
  }
  function setQty(vendorSlug, vendorName, item, qty) {
    const cart = load();
    const k = keyOf(vendorSlug, item.code);
    if (qty <= 0) { delete cart[k]; }
    else {
      const existing = cart[k];
      // "demo" is cart-only state (not product data), so a caller that
      // doesn't know about it — e.g. a vendor page's qty +/- button,
      // which only ever builds a fresh { code, sku, name, price, priceRrp }
      // from the product — must not clobber whatever the cart already had
      // set. Only an explicit true/false (from the /cart page's own demo
      // checkbox) overrides it.
      const demo = item.demo !== undefined ? item.demo : (existing ? existing.demo : false);
      cart[k] = { vendorSlug, vendorName, code: item.code, sku: item.sku, name: item.name, price: item.price, priceRrp: item.priceRrp, demo, qty };
    }
    save(cart);
  }
  function add(vendorSlug, vendorName, item, delta) {
    setQty(vendorSlug, vendorName, item, getQty(vendorSlug, item.code) + delta);
  }
  function removeItem(vendorSlug, code) {
    const cart = load();
    delete cart[keyOf(vendorSlug, code)];
    save(cart);
  }
  // "Request for demo": one unit of this line is billed at half its ex
  // price — a supplier giving one demo/sample unit at a discount, not a
  // per-unit price change. Only meaningful on an existing cart entry.
  function setDemo(vendorSlug, code, demo) {
    const cart = load();
    const k = keyOf(vendorSlug, code);
    const existing = cart[k];
    if (!existing) return;
    cart[k] = { ...existing, demo };
    save(cart);
  }
  function clear() {
    localStorage.removeItem(CART_KEY);
    updateBadge();
    window.dispatchEvent(new CustomEvent("cart:change"));
  }
  function all() {
    // Defensive: silently drop any entry that doesn't match the current
    // shape (e.g. left over from an older cart schema) instead of letting
    // one bad row crash sort()/render() for the whole cart.
    return Object.values(load())
      .filter((i) => i && typeof i.vendorSlug === "string" && typeof i.vendorName === "string" && typeof i.name === "string")
      .sort((a, b) => a.vendorName.localeCompare(b.vendorName) || a.name.localeCompare(b.name));
  }
  // The ex-price total for one line: qty × price, minus half of one
  // unit's price when "demo" is checked. Never applied to the inc/RRP
  // reference figures — those stay as plain per-unit values, unaffected.
  function lineTotal(item) {
    return item.qty * item.price - (item.demo ? item.price / 2 : 0);
  }
  function totalCount() {
    return all().reduce((s, i) => s + i.qty, 0);
  }
  function totalValue() {
    return all().reduce((s, i) => s + lineTotal(i), 0);
  }
  function updateBadge() {
    const badge = document.getElementById("cartBadge");
    if (!badge) return;
    const n = totalCount();
    badge.textContent = n > 99 ? "99+" : n;
    badge.style.display = n > 0 ? "flex" : "none";
  }

  window.MastexCart = { getQty, setQty, add, removeItem, setDemo, clear, all, lineTotal, totalCount, totalValue, updateBadge };
  document.addEventListener("DOMContentLoaded", updateBadge);
})(window);
