/**
 * Your own on-hand Odoo stock, shown alongside each Mastex product so you
 * don't have to check both systems separately — matched by EAN (Mastex's
 * `ean` field) against Odoo's `barcode` field, which is where this shop's
 * Odoo stores the same EAN/UPC codes.
 *
 * Talks to the Luxtronic-Odoo-API service (a separate project, already
 * running on the shop's LAN server — see its own README for the Odoo side)
 * via its GET /inventory/products/all endpoint: ~1,100 products, ~325KB,
 * under 1.5s. Cheap enough to poll on an interval and keep a small
 * in-memory map (EAN -> stock) rather than treating this like the Mastex
 * sheet sync (child process, disk-persisted, manual-trigger button) — that
 * machinery exists because the Mastex sheet is a ~50MB download; this is
 * two orders of magnitude smaller and doesn't need any of it.
 *
 * If the Odoo API is unreachable, unconfigured, or the fetch fails: the
 * cache just keeps whatever it last had (or stays empty), enrichment
 * becomes a no-op, and product pages render exactly as if this feature
 * didn't exist — never a reason for the Mastex catalog itself to break.
 */

const ODOO_API_URL = process.env.ODOO_API_URL || "";
const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes — one small read-only query per refresh (~1,100 products); chosen to keep Odoo traffic light rather than for any hard limit.

const state = {
  byEan: {},
  updatedAt: null,
  error: null,
  fetching: false,
};

async function refreshInventory() {
  if (!ODOO_API_URL || state.fetching) return;
  state.fetching = true;
  try {
    const res = await fetch(`${ODOO_API_URL}/inventory/products/all`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const byEan = {};
    for (const p of data.products || []) {
      if (!p.barcode) continue; // most non-storable/service products have none
      byEan[p.barcode] = {
        qty: p.qty_available,
        virtualQty: p.virtual_available,
        name: p.display_name,
      };
    }
    state.byEan = byEan;
    state.updatedAt = new Date().toISOString();
    state.error = null;
  } catch (err) {
    console.error("Failed to refresh Odoo inventory:", err.message);
    state.error = err.message; // keep the previous byEan/updatedAt — stale beats gone
  } finally {
    state.fetching = false;
  }
}

function startInventoryRefresh() {
  if (!ODOO_API_URL) {
    console.log("ODOO_API_URL not set — Odoo stock badges disabled.");
    return;
  }
  refreshInventory();
  setInterval(refreshInventory, REFRESH_INTERVAL_MS);
}

/** Adds odooQty/odooVirtualQty/odooName to each product that has a matching
 *  EAN in the cache. Mutates and returns the same array — every caller
 *  already has a fresh, request-scoped products array (freshly
 *  JSON.parse'd from disk), never a shared/cached one, so this is safe. */
function enrichWithInventory(products) {
  if (!products || !Object.keys(state.byEan).length) return products;
  for (const p of products) {
    const match = p.ean && state.byEan[p.ean];
    if (match) {
      p.odooQty = match.qty;
      p.odooVirtualQty = match.virtualQty;
      p.odooName = match.name;
    }
  }
  return products;
}

function getInventoryStatus() {
  return { enabled: !!ODOO_API_URL, updatedAt: state.updatedAt, error: state.error };
}

module.exports = { startInventoryRefresh, refreshInventory, enrichWithInventory, getInventoryStatus };
