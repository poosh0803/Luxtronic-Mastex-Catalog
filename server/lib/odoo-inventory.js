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
};

// A refresh already in progress (timer or "Sync with Odoo" click) is shared
// rather than skipped, so a manual sync that lands mid-refresh still waits
// for fresh data instead of returning immediately with the old snapshot.
let inFlight = null;

function refreshInventory() {
  if (!ODOO_API_URL) return Promise.resolve();
  if (!inFlight) inFlight = doRefresh().finally(() => { inFlight = null; });
  return inFlight;
}

async function doRefresh() {
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
    if (!p.ean) continue;
    let match = state.byEan[p.ean];
    if (!match) {
      const corrected = correctedEan(p.ean);
      if (corrected) {
        match = state.byEan[corrected];
        p.odooCorrectedEan = corrected;
      }
    }
    if (match) {
      p.odooQty = match.qty;
      p.odooVirtualQty = match.virtualQty;
      p.odooName = match.name;
    }
  }
  return products;
}

function ean13Valid(e) {
  if (!/^\d{13}$/.test(e)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(e[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(e[12]);
}

// Mastex's sheet occasionally has a mistyped EAN (e.g. Keychron K2H-F1:
// 4895848889199 in the sheet vs the real 4895248889199). Only when the
// sheet's EAN is 13 digits AND fails its own check digit — so it is known
// to be wrong — look for an Odoo barcode exactly one digit away that does
// pass. Exactly one such candidate is required; zero or several means no
// match, since a wrong stock figure is worse than a missing one.
function correctedEan(ean) {
  if (!/^\d{13}$/.test(ean) || ean13Valid(ean)) return null;
  let found = null;
  for (let i = 0; i < 13; i++) {
    for (let d = 0; d <= 9; d++) {
      if (String(d) === ean[i]) continue;
      const candidate = ean.slice(0, i) + d + ean.slice(i + 1);
      if (state.byEan[candidate] && ean13Valid(candidate)) {
        if (found && found !== candidate) return null;
        found = candidate;
      }
    }
  }
  return found;
}

function getInventoryStatus() {
  return { enabled: !!ODOO_API_URL, updatedAt: state.updatedAt, error: state.error };
}

module.exports = { startInventoryRefresh, refreshInventory, enrichWithInventory, getInventoryStatus };
