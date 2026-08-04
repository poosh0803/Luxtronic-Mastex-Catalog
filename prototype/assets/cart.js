/* ============================================================
   Shared "order list" cart, used across every vendor page plus
   cart.html. Persisted in localStorage so items added on one
   vendor page are still there when you visit another vendor or
   the cart page — this is the one thing in the prototype that
   actually works client-side, everything else is still static
   demo data.
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
  function keyOf(vendor, code) { return vendor + "::" + code; }

  function getQty(vendor, code) {
    const item = load()[keyOf(vendor, code)];
    return item ? item.qty : 0;
  }
  function setQty(vendor, item, qty) {
    const cart = load();
    const k = keyOf(vendor, item.code);
    if (qty <= 0) { delete cart[k]; }
    else { cart[k] = { vendor, code: item.code, sku: item.sku, name: item.name, price: item.price, qty }; }
    save(cart);
  }
  function add(vendor, item, delta) {
    setQty(vendor, item, getQty(vendor, item.code) + delta);
  }
  function removeItem(vendor, code) {
    const cart = load();
    delete cart[keyOf(vendor, code)];
    save(cart);
  }
  function clear() {
    localStorage.removeItem(CART_KEY);
    updateBadge();
    window.dispatchEvent(new CustomEvent("cart:change"));
  }
  function all() {
    return Object.values(load()).sort((a, b) => a.vendor.localeCompare(b.vendor) || a.name.localeCompare(b.name));
  }
  function totalCount() {
    return all().reduce((s, i) => s + i.qty, 0);
  }
  function totalValue() {
    return all().reduce((s, i) => s + i.qty * i.price, 0);
  }
  function updateBadge() {
    const badge = document.getElementById("cartBadge");
    if (!badge) return;
    const n = totalCount();
    badge.textContent = n > 99 ? "99+" : n;
    badge.style.display = n > 0 ? "flex" : "none";
  }

  window.MastexCart = { getQty, setQty, add, removeItem, clear, all, totalCount, totalValue, updateBadge };
  document.addEventListener("DOMContentLoaded", updateBadge);
})(window);
