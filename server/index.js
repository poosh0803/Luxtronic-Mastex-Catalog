#!/usr/bin/env node
/**
 * Mastex catalog server.
 *
 * Renders the vendor hub and one page per vendor directly from whatever is
 * currently in data/*.json — there is no per-vendor template or route to
 * hand-write. When sync/sync-catalog.js discovers a vendor tab in the sheet,
 * it writes data/<slug>.json, and /vendor/<slug> starts serving a real page
 * immediately, with no code change and no restart.
 *
 * Config comes from .env (see .env.example) — PORT here, SHEET_ID in
 * sync/sync-catalog.js. Note PM2 (ecosystem.config.js) sets its own PORT
 * for this process when run via `pm2 start`, which wins over .env's value —
 * keep the two in sync if you change one.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const express = require("express");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { vendorTheme, initials } = require("./lib/vendor-theme");

const PORT = process.env.PORT || 8002;
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const FAVORITES_PATH = path.join(DATA_DIR, "favorites.json");
const ORDERS_PATH = path.join(DATA_DIR, "orders.json");
const SYNC_SCRIPT = path.join(ROOT, "sync", "sync-catalog.js");

// Manual "sync now" support: runs sync/sync-catalog.js as a child process
// (same script the daily PM2 cron job runs) so a slow ~50MB download/parse
// never blocks the server's event loop. Only one run at a time; state is
// in-memory (fine — there's one server process and no login/session split).
const SYNC_LOG_MAX_CHARS = 8000;
const syncState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  log: "",
};

function appendSyncLog(chunk) {
  syncState.log = (syncState.log + chunk).slice(-SYNC_LOG_MAX_CHARS);
}

function startSync() {
  if (syncState.running) return false;
  syncState.running = true;
  syncState.startedAt = new Date().toISOString();
  syncState.finishedAt = null;
  syncState.exitCode = null;
  syncState.log = "";

  const child = spawn(process.execPath, [SYNC_SCRIPT], { cwd: ROOT });
  child.stdout.on("data", (d) => appendSyncLog(d.toString()));
  child.stderr.on("data", (d) => appendSyncLog(d.toString()));
  child.on("close", (code) => {
    syncState.running = false;
    syncState.finishedAt = new Date().toISOString();
    syncState.exitCode = code;
  });
  child.on("error", (err) => {
    syncState.running = false;
    syncState.finishedAt = new Date().toISOString();
    syncState.exitCode = -1;
    appendSyncLog(`\nFailed to start sync process: ${err.message}\n`);
  });

  return true;
}

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use("/css", express.static(path.join(__dirname, "public", "css")));
app.use("/js", express.static(path.join(__dirname, "public", "js")));
app.use("/images", express.static(IMAGES_DIR));

function readMeta() {
  const metaPath = path.join(DATA_DIR, "meta.json");
  if (!fs.existsSync(metaPath)) return { syncedAt: null, vendors: [], errors: [] };
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch (err) {
    console.error("Failed to parse data/meta.json:", err.message);
    return { syncedAt: null, vendors: [], errors: [{ message: "meta.json is corrupt" }] };
  }
}

function readVendorProducts(slug) {
  const dataPath = path.join(DATA_DIR, `${slug}.json`);
  if (!fs.existsSync(dataPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(dataPath, "utf8"));
  } catch (err) {
    console.error(`Failed to parse data/${slug}.json:`, err.message);
    return null;
  }
}

// Favorites are shared (there's no per-user login yet), persisted as a flat
// JSON file. Read + modify + write happen synchronously within one request
// handler with no awaits in between, so concurrent toggles from different
// browsers can't interleave and clobber each other — Node won't start a
// second handler's synchronous work until the first one returns.
function readFavorites() {
  if (!fs.existsSync(FAVORITES_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(FAVORITES_PATH, "utf8"));
  } catch (err) {
    console.error("Failed to parse data/favorites.json:", err.message);
    return [];
  }
}
function writeFavorites(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FAVORITES_PATH, JSON.stringify(list, null, 2));
}

// Order history: shared, persisted the same way as favorites (flat JSON
// file, synchronous read-modify-write within one request handler). Orders
// are frozen snapshots, not live references — each item carries the
// name/sku/price it had at save time, deliberately NOT re-resolved against
// today's data/<slug>.json the way /favorites re-resolves its items. A
// price change or a vendor being dropped from a later sync must not alter
// what a past order record shows. See REQUIREMENTS.md for the reasoning.
function readOrders() {
  if (!fs.existsSync(ORDERS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(ORDERS_PATH, "utf8"));
  } catch (err) {
    console.error("Failed to parse data/orders.json:", err.message);
    return [];
  }
}
function writeOrders(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ORDERS_PATH, JSON.stringify(list, null, 2));
}
function sanitizeOrderItems(items) {
  if (!Array.isArray(items)) return null;
  const clean = items
    .filter((i) => i && typeof i.vendorSlug === "string" && typeof i.code === "string" && typeof i.qty === "number" && i.qty > 0)
    .map((i) => ({
      vendorSlug: i.vendorSlug,
      vendorName: String(i.vendorName || i.vendorSlug),
      code: i.code,
      sku: String(i.sku || i.code),
      name: String(i.name || i.code),
      price: Number(i.price) || 0,
      priceRrp: Number(i.priceRrp) || 0,
      qty: i.qty,
    }));
  return clean.length ? clean : null;
}

app.get("/", (req, res) => {
  const meta = readMeta();
  const vendors = meta.vendors.map((v) => ({
    ...v,
    theme: vendorTheme(v.name),
    initials: initials(v.name),
  }));
  res.render("hub", { vendors, syncedAt: meta.syncedAt, errors: meta.errors });
});

app.get("/vendor/:slug", (req, res) => {
  const meta = readMeta();
  const vendorMeta = meta.vendors.find((v) => v.slug === req.params.slug);
  const products = readVendorProducts(req.params.slug);

  if (!vendorMeta || !products) {
    res.status(404);
    return res.send(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Vendor not found</title>` +
      `<link rel="stylesheet" href="/css/site.css"></head><body style="padding:60px;text-align:center;">` +
      `<h1>No such vendor</h1><p>"${req.params.slug}" hasn't been synced (yet). ` +
      `<a href="/">Back to all vendors</a></p></body></html>`
    );
  }

  res.render("vendor", {
    vendor: vendorMeta,
    products,
    theme: vendorTheme(vendorMeta.name),
    initials: initials(vendorMeta.name),
  });
});

app.get("/cart", (req, res) => {
  res.render("cart");
});

app.get("/favorites", (req, res) => {
  const meta = readMeta();
  const vendorNameBySlug = {};
  meta.vendors.forEach((v) => { vendorNameBySlug[v.slug] = v.name; });

  const codesBySlug = {};
  readFavorites().forEach((f) => {
    (codesBySlug[f.vendorSlug] ||= new Set()).add(f.code);
  });

  const items = [];
  for (const slug of Object.keys(codesBySlug)) {
    const products = readVendorProducts(slug);
    if (!products) continue; // vendor no longer synced — skip its stale favorites rather than error
    const codes = codesBySlug[slug];
    products.filter((p) => codes.has(p.code)).forEach((p) => {
      items.push({ ...p, vendorSlug: slug, vendorName: vendorNameBySlug[slug] || slug });
    });
  }
  items.sort((a, b) => a.vendorName.localeCompare(b.vendorName) || a.name.localeCompare(b.name));

  res.render("favorites", { items });
});

app.get("/orders", (req, res) => {
  const orders = readOrders().slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.render("orders", { orders });
});

app.get("/api/favorites", (req, res) => {
  res.json(readFavorites());
});

app.get("/api/favorites/:slug", (req, res) => {
  const codes = readFavorites()
    .filter((f) => f.vendorSlug === req.params.slug)
    .map((f) => f.code);
  res.json(codes);
});

app.post("/api/favorites/toggle", (req, res) => {
  const { vendorSlug, code } = req.body || {};
  if (!vendorSlug || !code) {
    return res.status(400).json({ error: "vendorSlug and code are required" });
  }
  const list = readFavorites();
  const idx = list.findIndex((f) => f.vendorSlug === vendorSlug && f.code === code);
  let favorited;
  if (idx === -1) {
    list.push({ vendorSlug, code });
    favorited = true;
  } else {
    list.splice(idx, 1);
    favorited = false;
  }
  writeFavorites(list);
  res.json({ favorited });
});

app.get("/api/orders", (req, res) => {
  res.json(readOrders());
});

app.post("/api/orders", (req, res) => {
  const items = sanitizeOrderItems(req.body?.items);
  if (!items) return res.status(400).json({ error: "items must be a non-empty array" });
  const label = String(req.body?.label || "").trim();
  const now = new Date().toISOString();
  const order = {
    id: crypto.randomUUID(),
    label,
    createdAt: now,
    updatedAt: now,
    items,
  };
  const list = readOrders();
  list.push(order);
  writeOrders(list);
  res.status(201).json(order);
});

app.put("/api/orders/:id", (req, res) => {
  const list = readOrders();
  const order = list.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "No such order" });

  if (req.body?.items !== undefined) {
    const items = sanitizeOrderItems(req.body.items);
    if (!items) return res.status(400).json({ error: "items must be a non-empty array" });
    order.items = items;
  }
  if (req.body?.label !== undefined) {
    order.label = String(req.body.label).trim();
  }
  order.updatedAt = new Date().toISOString();
  writeOrders(list);
  res.json(order);
});

app.delete("/api/orders/:id", (req, res) => {
  const list = readOrders();
  const idx = list.findIndex((o) => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "No such order" });
  list.splice(idx, 1);
  writeOrders(list);
  res.status(204).end();
});

app.post("/api/sync", (req, res) => {
  const started = startSync();
  if (!started) return res.status(409).json({ error: "A sync is already running.", running: true });
  res.json({ started: true });
});

app.get("/api/sync/status", (req, res) => {
  res.json(syncState);
});

app.listen(PORT, () => {
  console.log(`Mastex catalog serving http://localhost:${PORT}`);
});
